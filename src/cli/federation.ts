import { listPeers, loadPeers, savePeers, getPeer, getPeerByUrl, getPeerByPublicKey, approvePeer, rejectPeer, updatePeer, updatePeerGrantedScopes, type Peer } from '../daemon/peers.js';
import { requireConfig, loadConfig, type OGPConfig } from '../shared/config.js';
import { lookupPeer } from '../daemon/rendezvous.js';
import { getPublicKey, getPrivateKey, loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { signObject, sign } from '../shared/signing.js';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type ScopeBundle,
  type ScopeGrant,
  type RateLimit,
  createScopeBundle,
  createScopeGrant,
  parseRateLimit,
  formatRateLimit,
  DEFAULT_RATE_LIMIT
} from '../daemon/scopes.js';
import { loadIntents } from '../daemon/intent-registry.js';
import { loadMetaConfig } from '../shared/meta-config.js';
import { logActivity } from '../daemon/agent-comms.js';
import { deliverLocalSessionText } from '../daemon/notify.js';

/**
 * Expand tilde in paths
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function formatRelative(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'in the future';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function healthStateLabel(state?: Peer['healthState']): { icon: string; label: string } {
  switch (state) {
    case 'established': return { icon: '✓', label: 'established' };
    case 'degraded-outbound': return { icon: '⚠', label: 'degraded-out' };
    case 'degraded-inbound': return { icon: '⚠', label: 'degraded-in' };
    case 'down': return { icon: '✗', label: 'down' };
    default: return { icon: '?', label: 'unknown' };
  }
}

function federationStateLabel(state?: Peer['federationState']): { icon: string; label: string } {
  switch (state) {
    case 'init': return { icon: '◐', label: 'INIT' };
    case 'twoWay': return { icon: '◑', label: 'TWO-WAY' };
    case 'established': return { icon: '✓', label: 'ESTABLISHED' };
    case 'degraded': return { icon: '⚠', label: 'DEGRADED' };
    case 'down': return { icon: '✗', label: 'DOWN' };
    case 'tombstoned': return { icon: '☠', label: 'TOMBSTONED' };
    default: return { icon: '?', label: 'UNKNOWN' };
  }
}

type FederationCard = {
  displayName?: string;
  email?: string;
  gatewayUrl?: string;
  publicKey?: string;
};

function normalizeGatewayUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // Add https:// if no protocol specified
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  // Remove trailing slashes
  return withProtocol.replace(/\/+$/, '');
}

export async function fetchFederationCard(
  gatewayUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ requestedUrl: string; canonicalUrl: string; card: FederationCard }> {
  const requestedUrl = normalizeGatewayUrl(gatewayUrl);
  const wellKnownUrl = `${requestedUrl}/.well-known/ogp`;
  const response = await fetchImpl(wellKnownUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch ${wellKnownUrl}: ${response.status} ${response.statusText}`);
  }

  const card = await response.json() as FederationCard;
  const canonicalUrl = card.gatewayUrl ? normalizeGatewayUrl(card.gatewayUrl) : requestedUrl;
  return { requestedUrl, canonicalUrl, card };
}

export async function ensureLocalGatewayReachable(
  config: Pick<OGPConfig, 'gatewayUrl'>,
  actionLabel: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const configuredGatewayUrl = normalizeGatewayUrl(config.gatewayUrl || '');

  if (!configuredGatewayUrl) {
    console.error(`Error: gatewayUrl is not set. Run "ogp expose" or update your config before you ${actionLabel}.`);
    return false;
  }

  try {
    const { canonicalUrl } = await fetchFederationCard(configuredGatewayUrl, fetchImpl);
    if (canonicalUrl !== configuredGatewayUrl) {
      console.error(`Error: configured gatewayUrl is stale.`);
      console.error(`  Config: ${configuredGatewayUrl}`);
      console.error(`  Live card: ${canonicalUrl}`);
      console.error(`  Update your config before you ${actionLabel}.`);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error(`Error: your gatewayUrl is not reachable at ${configuredGatewayUrl}.`);
    console.error(`  Run "ogp expose" or fix gatewayUrl before you ${actionLabel}.`);
    console.error(`  Details: ${error.message}`);
    return false;
  }
}

async function resolvePeerGatewayUrl(
  gatewayUrl: string,
  contextLabel: string
): Promise<{ gatewayUrl: string; card: FederationCard }> {
  try {
    const { requestedUrl, canonicalUrl, card } = await fetchFederationCard(gatewayUrl);
    if (canonicalUrl !== requestedUrl) {
      console.log(`ℹ ${contextLabel}: peer advertises canonical gateway URL ${canonicalUrl}; using it instead of ${requestedUrl}`);
    }
    return { gatewayUrl: canonicalUrl, card };
  } catch (error: any) {
    throw new Error(`${contextLabel}: peer gateway is not reachable or missing /.well-known/ogp. ${error.message}`);
  }
}

async function refreshPeerGatewayUrlForApproval(peer: Peer): Promise<string> {
  const { gatewayUrl, card } = await resolvePeerGatewayUrl(peer.gatewayUrl, 'Preflight');

  if (card.publicKey && peer.publicKey && card.publicKey !== peer.publicKey) {
    throw new Error(
      `Preflight: peer gateway identity mismatch. Expected ${peer.publicKey.substring(0, 32)}, got ${card.publicKey.substring(0, 32)}.`
    );
  }

  if (gatewayUrl !== peer.gatewayUrl) {
    updatePeer(peer.id, { gatewayUrl });
  }

  return gatewayUrl;
}

/**
 * Resolve a peer identifier (alias, ID, or public key) to a peer ID.
 * Returns the peer ID if found, or null.
 */
function resolvePeerId(identifier: string): string | null {
  // First try exact match by ID or public key
  const exactPeer = getPeer(identifier);
  if (exactPeer) {
    return exactPeer.id;
  }

  // Then try alias lookup
  const peers = loadPeers();
  const aliasPeer = peers.find(p => p.alias === identifier);
  if (aliasPeer) {
    return aliasPeer.id;
  }

  return null;
}

export async function federationList(status?: 'pending' | 'approved' | 'rejected' | 'removed', filterTag?: string): Promise<void> {
  // Check if --for all was specified
  if (process.env.OGP_FOR_ALL === 'true') {
    const metaConfig = loadMetaConfig();
    const enabledFrameworks = metaConfig.frameworks.filter(f => f.enabled);

    if (enabledFrameworks.length === 0) {
      console.error('Error: No enabled frameworks found. Run "ogp setup" first.');
      process.exit(1);
    }

    // Print header
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`Federation Peers (All Frameworks)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalPeers = 0;

    // Iterate through each framework
    for (const framework of enabledFrameworks) {
      const originalOgpHome = process.env.OGP_HOME;
      process.env.OGP_HOME = expandTilde(framework.configDir);

      try {
        const config = loadConfig();
        if (!config) {
          console.log(`${framework.name} (${framework.displayName || framework.id})`);
          console.log('───────────────────────────────────────────────────────────────');
          console.log('  No config found - run setup');
          console.log('');
          continue;
        }

        // Load peers for this framework
        const allPeers = loadPeers();
        const peers = status ? allPeers.filter(p => p.status === status) : allPeers.filter(p => p.status !== 'removed');

        // Print framework header
        console.log(`${framework.name} (${framework.displayName || framework.id})`);
        console.log('───────────────────────────────────────────────────────────────');

        if (peers.length === 0) {
          console.log('  No peers found');
        } else {
          totalPeers += peers.length;

          peers.forEach(peer => {
            const aliasDisplay = peer.alias || peer.displayName || '-';
            const displayName = peer.alias ? peer.displayName : '';

            // Status and health icons
            let statusIcon = peer.status === 'approved' ? '✓' : peer.status === 'pending' ? '?' : '✗';
            if (peer.status === 'approved' && peer.healthy === false) {
              statusIcon = '✗'; // Show unhealthy status
            }

            // Issue #3 + #5: directional health summary for approved peers
            let healthInfo = '';
            if (peer.status === 'approved') {
              const { icon, label } = healthStateLabel(peer.healthState);
              const out = peer.lastOutboundCheckFailedAt && (!peer.lastOutboundCheckAt || peer.lastOutboundCheckFailedAt > peer.lastOutboundCheckAt)
                ? `out: FAIL ${formatRelative(peer.lastOutboundCheckFailedAt)}`
                : `out: ${formatRelative(peer.lastOutboundCheckAt)}`;
              const inboundLabel = peer.inboundHealthReport
                ? `in (reported): ${peer.inboundHealthReport.healthy ? 'OK' : 'FAIL'} ${formatRelative(peer.inboundHealthReport.receivedAt)}`
                : `in: ${formatRelative(peer.lastInboundContactAt)}`;
              healthInfo = ` [${icon} ${label}  ${out}  ${inboundLabel}]`;
              if (peer.healthCheckFailures && peer.healthCheckFailures > 0) {
                healthInfo += ` (${peer.healthCheckFailures} failures)`;
              }
            }

            console.log(`  ${statusIcon} ${aliasDisplay.padEnd(20)} ${(displayName || '').padEnd(25)} ${peer.status.padEnd(10)}${healthInfo}`);
          });
        }

        console.log('');
      } catch (error: any) {
        console.log(`${framework.name} (${framework.displayName || framework.id})`);
        console.log('───────────────────────────────────────────────────────────────');
        console.log(`  Error: ${error.message}`);
        console.log('');
      } finally {
        // Restore original OGP_HOME
        if (originalOgpHome) {
          process.env.OGP_HOME = originalOgpHome;
        } else {
          delete process.env.OGP_HOME;
        }
      }
    }

    console.log(`Total: ${totalPeers} peer${totalPeers !== 1 ? 's' : ''} across ${enabledFrameworks.length} framework${enabledFrameworks.length !== 1 ? 's' : ''}`);
    return;
  }

  // Single framework mode (existing behavior)
  // listPeers() doesn't filter 'removed' — load all and filter manually if needed
  const allPeers = loadPeers();
  let peers = status ? allPeers.filter(p => p.status === status) : allPeers.filter(p => p.status !== 'removed');

  // Filter by tag if specified
  if (filterTag) {
    peers = peers.filter(p => p.tags && p.tags.includes(filterTag));
  }

  if (peers.length === 0) {
    console.log('No peers found.');
    return;
  }

  const listHeader = filterTag
    ? `${status ? status.toUpperCase() : 'ALL'} PEERS (tag: ${filterTag})`
    : `${status ? status.toUpperCase() : 'ALL'} PEERS`;
  console.log(`\n${listHeader}:\n`);

  // Column headers
  console.log('  ALIAS                DISPLAY NAME           PUBLIC KEY          STATUS');
  console.log('  ' + '-'.repeat(80));

  peers.forEach(peer => {
    const aliasCol = (peer.alias || '-').padEnd(20);
    const displayCol = (peer.displayName || '-').slice(0, 20).padEnd(20);
    const keyCol = (peer.publicKey?.substring(0, 16) || '-') + '...';
    const statusCol = peer.status;

    // Health status indicator (Issue #3: directional)
    const { icon: healthIcon } = peer.status === 'approved'
      ? healthStateLabel(peer.healthState)
      : { icon: '' };

    console.log(`  ${healthIcon ? healthIcon + ' ' : ''}${aliasCol} ${displayCol} ${keyCol.padEnd(20)} ${statusCol}`);
    console.log(`    Gateway: ${peer.gatewayUrl}`);
    console.log(`    ID: ${peer.id}`);

    // Show identity if available
    if (peer.humanName || peer.agentName || peer.organization) {
      const parts = [];
      if (peer.humanName) parts.push(`Human: ${peer.humanName}`);
      if (peer.agentName) parts.push(`Agent: ${peer.agentName}`);
      if (peer.organization) parts.push(`Org: ${peer.organization}`);
      console.log(`    ${parts.join(', ')}`);
    }

    // Show local tags if any
    if (peer.tags && peer.tags.length > 0) {
      console.log(`    Tags: ${peer.tags.join(', ')}`);
    }

    // Issue #4: federation lifecycle line for any non-tombstoned peer.
    if (peer.status !== 'rejected' && peer.status !== 'removed') {
      const { label: fedLabel } = federationStateLabel(peer.federationState);
      const since = peer.federationStateChangedAt ? ` since ${formatRelative(peer.federationStateChangedAt)}` : '';
      const reason = peer.federationStateReason ? ` — ${peer.federationStateReason}` : '';
      console.log(`    Federation:  ${fedLabel}${since}${reason}`);
    }

    // Show health details for approved peers (Issue #3: directional, Issue #5: authoritative inbound)
    if (peer.status === 'approved') {
      const { label } = healthStateLabel(peer.healthState);
      console.log(`    Health state: ${label}${peer.healthStateChangedAt ? ` (since ${formatRelative(peer.healthStateChangedAt)})` : ''}`);
      console.log(`    Outbound:    last ok ${formatRelative(peer.lastOutboundCheckAt)}, last fail ${formatRelative(peer.lastOutboundCheckFailedAt)}`);
      console.log(`    Inbound:     last contact ${formatRelative(peer.lastInboundContactAt)}`);
      if (peer.inboundHealthReport) {
        const r = peer.inboundHealthReport;
        console.log(`    Inbound (reported): ${r.healthy ? 'healthy' : 'unhealthy'} as of ${formatRelative(r.receivedAt)}` +
          (r.healthCheckFailures && r.healthCheckFailures > 0 ? ` (${r.healthCheckFailures} failures from peer)` : ''));
      }
      if (peer.healthCheckFailures && peer.healthCheckFailures > 0) {
        console.log(`    Health check failures: ${peer.healthCheckFailures}`);
      }
    }

    console.log('');
  });
}

export async function federationStatus(): Promise<void> {
  // Check if --for all was specified
  if (process.env.OGP_FOR_ALL === 'true') {
    const metaConfig = loadMetaConfig();
    const enabledFrameworks = metaConfig.frameworks.filter(f => f.enabled);

    if (enabledFrameworks.length === 0) {
      console.error('Error: No enabled frameworks found. Run "ogp setup" first.');
      process.exit(1);
    }

    // Print header
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`Federation Status (All Frameworks)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalApproved = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalRemoved = 0;

    // Iterate through each framework
    for (const framework of enabledFrameworks) {
      const originalOgpHome = process.env.OGP_HOME;
      process.env.OGP_HOME = expandTilde(framework.configDir);

      try {
        const config = loadConfig();
        if (!config) {
          console.log(`${framework.name} (${framework.displayName || framework.id})`);
          console.log('───────────────────────────────────────────────────────────────');
          console.log('  No config found - run setup');
          console.log('');
          continue;
        }

        // Load peers for this framework
        const peers = listPeers();
        const approvedPeers = peers.filter(p => p.status === 'approved');
        const pendingPeers = peers.filter(p => p.status === 'pending');
        const rejectedPeers = peers.filter(p => p.status === 'rejected');
        const removedPeers = peers.filter(p => p.status === 'removed');

        // Update totals
        totalApproved += approvedPeers.length;
        totalPending += pendingPeers.length;
        totalRejected += rejectedPeers.length;
        totalRemoved += removedPeers.length;

        // Print framework header
        console.log(`${framework.name} (${framework.displayName || framework.id})`);
        console.log('───────────────────────────────────────────────────────────────');

        if (peers.length === 0) {
          console.log('  No peers configured');
        } else {
          console.log(`  Total: ${peers.length} | Approved: ${approvedPeers.length} | Pending: ${pendingPeers.length} | Rejected: ${rejectedPeers.length} | Removed: ${removedPeers.length}`);

          // Show aliases for approved peers with health info
          if (approvedPeers.length > 0) {
            console.log('\n  Approved peers:');
            for (const peer of approvedPeers) {
              const aliasDisplay = peer.alias || peer.displayName || 'no alias';

              // Issue #3: directional health
              const { icon: healthIcon, label } = healthStateLabel(peer.healthState);
              const out = peer.lastOutboundCheckFailedAt && (!peer.lastOutboundCheckAt || peer.lastOutboundCheckFailedAt > peer.lastOutboundCheckAt)
                ? `out FAIL ${formatRelative(peer.lastOutboundCheckFailedAt)}`
                : `out ${formatRelative(peer.lastOutboundCheckAt)}`;
              const inb = `in ${formatRelative(peer.lastInboundContactAt)}`;
              const failuresStr = peer.healthCheckFailures && peer.healthCheckFailures > 0
                ? ` (${peer.healthCheckFailures} failures)`
                : '';

              const scopes = peer.grantedScopes?.scopes.map(s => s.intent).join(', ') || 'none';
              console.log(`    ${healthIcon} ${aliasDisplay.padEnd(20)} ${label.padEnd(13)} ${out.padEnd(20)} ${inb.padEnd(15)}${failuresStr} ${scopes}`);
            }
          }
        }

        console.log('');
      } catch (error: any) {
        console.log(`${framework.name} (${framework.displayName || framework.id})`);
        console.log('───────────────────────────────────────────────────────────────');
        console.log(`  Error: ${error.message}`);
        console.log('');
      } finally {
        // Restore original OGP_HOME
        if (originalOgpHome) {
          process.env.OGP_HOME = originalOgpHome;
        } else {
          delete process.env.OGP_HOME;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total across all frameworks:`);
    console.log(`  Approved: ${totalApproved}`);
    console.log(`  Pending:  ${totalPending}`);
    console.log(`  Rejected: ${totalRejected}`);
    console.log(`  Removed:  ${totalRemoved}`);
    console.log('');
    console.log('Health checks run every 5 minutes for approved peers.');
    console.log('Peers are marked unhealthy after 3 consecutive failures (10s timeout each).');
    console.log('');
    return;
  }

  // Single framework mode (existing behavior)
  const peers = listPeers();
  const approvedPeers = peers.filter(p => p.status === 'approved');
  const pendingPeers = peers.filter(p => p.status === 'pending');
  const rejectedPeers = peers.filter(p => p.status === 'rejected');
  const removedPeers = peers.filter(p => p.status === 'removed');

  // Health statistics for approved peers (Issue #3: directional)
  const stateCounts = {
    established: 0,
    'degraded-outbound': 0,
    'degraded-inbound': 0,
    down: 0,
    unknown: 0
  };
  for (const p of approvedPeers) {
    const state = p.healthState ?? 'unknown';
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
  }

  console.log('\n📊 FEDERATION STATUS\n');

  // Summary counts
  console.log(`Total peers: ${peers.length}`);
  console.log(`  Approved: ${approvedPeers.length}`);
  console.log(`  Pending:  ${pendingPeers.length}`);
  console.log(`  Rejected: ${rejectedPeers.length}`);
  console.log(`  Removed:  ${removedPeers.length}`);
  console.log('');

  // Health summary for approved peers (Issue #3: directional state breakdown)
  if (approvedPeers.length > 0) {
    console.log('🏥 PEER HEALTH:\n');
    console.log(`  Established:      ${stateCounts.established} (✓)`);
    console.log(`  Degraded out:     ${stateCounts['degraded-outbound']} (⚠ I can't reach them)`);
    console.log(`  Degraded in:      ${stateCounts['degraded-inbound']} (⚠ they haven't reached me)`);
    console.log(`  Down:             ${stateCounts.down} (✗)`);
    console.log(`  Unknown:          ${stateCounts.unknown} (?)`);
    console.log('');
  }

  // Issue #4: federation lifecycle state breakdown across all non-tombstoned peers.
  const lifecycleCounts: Record<string, number> = {
    init: 0, twoWay: 0, established: 0, degraded: 0, down: 0, unknown: 0
  };
  for (const p of peers) {
    if (p.status === 'rejected' || p.status === 'removed') continue;
    const s = p.federationState ?? 'unknown';
    if (s === 'tombstoned') continue;
    lifecycleCounts[s] = (lifecycleCounts[s] ?? 0) + 1;
  }
  if (peers.some(p => p.status !== 'rejected' && p.status !== 'removed')) {
    console.log('🔗 FEDERATION LIFECYCLE:\n');
    console.log(`  Init:        ${lifecycleCounts.init}`);
    console.log(`  Two-way:     ${lifecycleCounts.twoWay}`);
    console.log(`  Established: ${lifecycleCounts.established}`);
    console.log(`  Degraded:    ${lifecycleCounts.degraded}`);
    console.log(`  Down:        ${lifecycleCounts.down}`);
    if (lifecycleCounts.unknown > 0) {
      console.log(`  Unknown:     ${lifecycleCounts.unknown}`);
    }
    console.log('');
  }

  // Alias → Public Key mapping section
  if (peers.length > 0) {
    console.log('📝 ALIAS → PUBLIC KEY MAPPING:\n');

    // Group by status for clarity
    const statusGroups = [
      { label: 'Approved', peers: approvedPeers },
      { label: 'Pending', peers: pendingPeers },
      { label: 'Rejected', peers: rejectedPeers }
    ];

    for (const group of statusGroups) {
      if (group.peers.length === 0) continue;

      console.log(`  [${group.label}]`);
      for (const peer of group.peers) {
        const aliasDisplay = peer.alias
          ? `${peer.alias} (${peer.displayName})`
          : `${peer.displayName} (no alias)`;
        const publicKeyShort = peer.publicKey.substring(0, 16);
        console.log(`    ${aliasDisplay}`);
        console.log(`      → ${publicKeyShort}... (${peer.publicKey.substring(0, 32)}...)`);
        console.log(`      ID: ${peer.id}`);
        console.log(`      Gateway: ${peer.gatewayUrl}`);
        console.log('');
      }
    }
  }
}

export async function federationRequest(peerUrl: string, peerId: string, alias?: string): Promise<boolean> {
  const config = requireConfig();
  const keypair = loadOrGenerateKeyPair();

  if (!await ensureLocalGatewayReachable(config, 'send federation requests')) {
    return false;
  }

  // BUILD-111: Use public key prefix as peer ID (port-agnostic identity)
  const ourPeerId = keypair.publicKey.substring(0, 16);

  let resolvedPeerUrl = normalizeGatewayUrl(peerUrl);
  let peerCard: FederationCard | null = null;

  try {
    const resolved = await resolvePeerGatewayUrl(resolvedPeerUrl, 'Preflight');
    resolvedPeerUrl = resolved.gatewayUrl;
    peerCard = resolved.card;
  } catch (error: any) {
    console.error(error.message);
    return false;
  }

  // Build our peer info
  const peer = {
    id: ourPeerId,  // Public key prefix, not hostname:port
    displayName: config.displayName,
    email: config.email,
    gatewayUrl: config.gatewayUrl,
    publicKey: keypair.publicKey,
    // Include enhanced identity if available
    ...(config.humanName ? { humanName: config.humanName } : {}),
    ...(config.agentName ? { agentName: config.agentName } : {}),
    ...(config.organization ? { organization: config.organization } : {}),
  };

  // Fetch our capabilities to include in the request (BUILD-110: intent negotiation)
  let ourIntents = loadIntents().map((i: { name: string }) => i.name);
  if (ourIntents.length === 0) {
    // Fallback to default intents if none registered
    ourIntents = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
  }

  // SECURITY (F-04): Send a signed canonical envelope. The receiver verifies
  // the signature against peer.publicKey from the payload — proves we hold
  // the private key for the publicKey we're announcing.
  const { signCanonical } = await import('../shared/signing.js');
  const { payloadStr, signature } = signCanonical(
    { peer, offeredIntents: ourIntents },
    keypair.privateKey
  );
  const requestBody = { payloadStr, signature };

  // Send request
  try {
    const response = await fetch(`${resolvedPeerUrl}/federation/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Request failed: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json() as { status?: string; message?: string };
    console.log('✓ Federation request sent');
    console.log(`  Status: ${result.status}`);
    console.log(`  Message: ${result.message}`);

    // Fetch their federation card to get their actual identity
    // Store them as a pending peer so we can send intents when approved
    try {
      const { addPeer } = await import('../daemon/peers.js');
      const card = peerCard;
      if (card) {
        const peerHostname = new URL(resolvedPeerUrl).hostname;
        const peerPort = new URL(resolvedPeerUrl).port || '18790';
        // BUILD-111: Use a 32-char public key prefix as canonical ID to avoid
        // duplicate short/full peer IDs across request/approve flows.
        const canonicalId = card.publicKey?.substring(0, 32) || `${peerHostname}:${peerPort}`;
        addPeer({
          id: canonicalId,
          displayName: card.displayName || peerId,
          email: card.email || '',
          gatewayUrl: resolvedPeerUrl,
          publicKey: card.publicKey || '',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          // Set alias if provided via --alias option
          alias: alias,
          // BUILD-115: Record which agent owns this federation relationship
          agentId: config.agentId
        });
      }
    } catch { /* non-fatal */ }

    return true;
  } catch (error) {
    console.error('Failed to send request:', error);
    return false;
  }
}

export interface ApproveOptions {
  intents?: string[];      // Intents to grant (e.g., ['message', 'agent-comms'])
  rate?: string;           // Rate limit string (e.g., '100/3600')
  topics?: string[];       // Topics for agent-comms
}

export async function federationApprove(peerId: string, options: ApproveOptions = {}): Promise<void> {
  const config = requireConfig();

  if (!await ensureLocalGatewayReachable(config, 'approve federation requests')) {
    return;
  }

  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status === 'approved') {
    console.log(`Peer ${peerId} is already approved.`);
    return;
  }

  let peerGatewayUrl = peer.gatewayUrl;
  try {
    peerGatewayUrl = await refreshPeerGatewayUrlForApproval(peer);
  } catch (error: any) {
    console.error(error.message);
    console.error('Ask the peer to fix their gatewayUrl and resend the federation request.');
    return;
  }

  // BUILD-110: Mirror peer's offered intents by default, with user confirmation
  const DEFAULT_INTENTS = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
  
  // If peer offered intents, use those as default (for symmetry)
  const peerOfferedIntents = peer.offeredIntents;
  if (!options.intents || options.intents.length === 0) {
    if (peerOfferedIntents && peerOfferedIntents.length > 0) {
      options.intents = peerOfferedIntents;
      console.log(`ℹ Auto-granting peer's offered intents: ${options.intents.join(', ')}`);
    } else {
      options.intents = DEFAULT_INTENTS;
      console.log(`ℹ Peer offered no intents; auto-granting defaults: ${options.intents.join(', ')}`);
    }
    console.log(`  (Use --intents to customize or override)`);
  }

  // Build scope grants if provided
  let scopeGrants: ScopeBundle | undefined;
  if (options.intents && options.intents.length > 0) {
    const rateLimit = options.rate ? parseRateLimit(options.rate) : DEFAULT_RATE_LIMIT;
    if (!rateLimit) {
      console.error(`Invalid rate limit format: ${options.rate} (expected: requests/seconds e.g., 100/3600)`);
      return;
    }

    const scopes: ScopeGrant[] = options.intents.map(intent => {
      const grant = createScopeGrant(intent, { rateLimit });
      // Add topics for agent-comms
      if (intent === 'agent-comms' && options.topics && options.topics.length > 0) {
        grant.topics = options.topics;
      }
      return grant;
    });

    scopeGrants = createScopeBundle(scopes);

    // Store the grants locally
    updatePeerGrantedScopes(peerId, scopeGrants);
    console.log(`✓ Granted scopes: ${options.intents.join(', ')}`);
    if (options.topics && options.topics.length > 0) {
      console.log(`  Topics: ${options.topics.join(', ')}`);
    }
    console.log(`  Rate limit: ${formatRateLimit(rateLimit)}`);
  }

  // BUILD-115: Set the agentId on the peer before approval
  if (config.agentId) {
    const { updatePeer } = await import('../daemon/peers.js');
    updatePeer(peerId, { agentId: config.agentId });
  }

  approvePeer(peerId);
  console.log(`✓ Approved peer: ${peerId}`);

  // BUILD-102: Auto-register existing local projects as agent-comms topics for this peer
  const { listProjectsForPeer } = await import('../daemon/projects.js');
  const { setPeerTopicPolicy } = await import('../daemon/peers.js');
  const projects = listProjectsForPeer(peerId);
  if (projects.length > 0) {
    for (const project of projects) {
      setPeerTopicPolicy(peerId, project.id, 'summary');
    }
    console.log(`✓ Auto-registered ${projects.length} project${projects.length > 1 ? 's' : ''} as agent-comms topic${projects.length > 1 ? 's' : ''}`);
  }

  // BUILD-103: Auto-enable "general" topic so agent-comms works out of the box
  setPeerTopicPolicy(peerId, 'general', 'summary');
  console.log(`✓ Agent-comms ready: topic "general" → summary (messages from this peer will reach your agent)`);
  console.log(`  To add more topics:  ogp agent-comms add-topic ${peerId} <topic> --level summary`);
  console.log(`  To restrict topics:  ogp agent-comms set-topic ${peerId} general off`);
  console.log(`  To review policies:  ogp agent-comms policies ${peerId}`);

  // Notify the peer — send both formats for maximum compatibility
  const keypair = loadOrGenerateKeyPair();
  const ourConfig = requireConfig();

  try {
    const nonce = crypto.randomUUID();
    // SECURITY (F-01): Approval is a canonical signed envelope.
    const { signCanonical } = await import('../shared/signing.js');
    const { payloadStr, signature } = signCanonical({
      // Package format
      peerId: peer.id,
      approved: true,
      // Fork format (for interoperability)
      fromGatewayId: `${new URL(ourConfig.gatewayUrl).hostname}:${ourConfig.daemonPort}`,
      fromDisplayName: ourConfig.displayName,
      fromGatewayUrl: ourConfig.gatewayUrl,
      fromPublicKey: keypair.publicKey,
      fromEmail: ourConfig.email,
      nonce,
      // v0.2.0: Include scope grants
      protocolVersion: '0.2.0',
      scopeGrants
    }, keypair.privateKey);
    await fetch(`${peerGatewayUrl}/federation/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payloadStr, signature })
    });
    console.log('✓ Notified peer of approval');
  } catch (error) {
    console.error('Failed to notify peer:', error);
  }

  // Check if this peer has a resync snapshot (gateway URL reused with new keys)
  const refreshedPeer = getPeer(peerId);
  if (refreshedPeer?.resyncSnapshot) {
    const snapshot = refreshedPeer.resyncSnapshot;
    console.log('\n📋 Federation resync available');
    console.log(`  This gateway previously had federation with different keys`);
    console.log(`  Old peer ID: ${snapshot.oldPeerId}`);
    if (snapshot.oldAlias) console.log(`  Old alias: ${snapshot.oldAlias}`);
    if (snapshot.oldProjects && snapshot.oldProjects.length > 0) {
      console.log(`  Old projects: ${snapshot.oldProjects.join(', ')}`);
    }

    // Send resync offer via agent-comms
    try {
      const resyncMessage = `Hey! We previously had a federation with your gateway (${refreshedPeer.gatewayUrl}) until ${new Date(snapshot.replacedAt).toLocaleDateString()}.

Previous setup:
${snapshot.oldAlias ? `- Alias: ${snapshot.oldAlias}` : ''}
${snapshot.oldProjects && snapshot.oldProjects.length > 0 ? `- Projects: ${snapshot.oldProjects.join(', ')}` : '- Projects: none'}
${snapshot.oldGrantedScopes ? `- Granted scopes: ${snapshot.oldGrantedScopes.scopes.map(s => s.intent).join(', ')}` : '- Granted scopes: none'}
${snapshot.oldReceivedScopes ? `- Received scopes: ${snapshot.oldReceivedScopes.scopes.map(s => s.intent).join(', ')}` : '- Received scopes: none'}

Would you like me to restore these settings? Reply with "yes" to restore or "no" to start fresh.`;

      const resyncNonce = crypto.randomUUID();
      const resyncPayload = {
        intent: 'agent-comms',
        from: keypair.publicKey.substring(0, 32),
        to: peerId,
        nonce: resyncNonce,
        timestamp: new Date().toISOString(),
        topic: 'federation-resync',
        message: resyncMessage,
        priority: 'normal'
      };

      const { payload: signedPayload, signature } = signObject(resyncPayload, keypair.privateKey);

      await fetch(`${peerGatewayUrl}/federation/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: signedPayload,
          signature
        })
      });

      console.log('✓ Sent resync offer to peer');
    } catch (error) {
      console.warn('Failed to send resync offer:', error);
    }
  }
}

export async function federationReject(peerId: string): Promise<void> {
  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  rejectPeer(peerId);
  console.log(`✓ Rejected peer: ${peerId}`);

  // Notify the peer
  try {
    await fetch(`${peer.gatewayUrl}/federation/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peerId: peer.id,
        approved: false
      })
    });
    console.log('✓ Notified peer of rejection');
  } catch (error) {
    console.error('Failed to notify peer:', error);
  }
}

export async function federationRemove(peerId: string): Promise<void> {
  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    process.exit(1);
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    process.exit(1);
  }

  // BUILD-113: Send removal notification to peer before removing
  try {
    const keypair = loadOrGenerateKeyPair();
    // BUILD-111: Use public key prefix as our ID (not hostname:port)
    const ourId = keypair.publicKey.substring(0, 32);
    const timestamp = new Date().toISOString();
    
    // Sign the removal payload
    const payload = { peerId: ourId, timestamp };
    const payloadStr = JSON.stringify(payload);
    const signature = sign(payloadStr, keypair.privateKey);
    
    const response = await fetch(`${peer.gatewayUrl}/federation/removed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peerId: ourId,
        timestamp,
        signature
      })
    });
    
    if (response.ok) {
      console.log(`✓ Notified peer of removal`);
    } else {
      console.warn(`⚠ Peer notification failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // Log network errors but don't fail the removal
    console.warn(`⚠ Could not notify peer of removal: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Update peer status to 'removed' instead of deleting (audit trail)
  const { removePeer } = await import('../daemon/peers.js');
  removePeer(peerId);
  console.log(`✓ Removed peer: ${peerId} (${peer.displayName})`);
}

export async function federationSend(
  peerId: string,
  intent: string,
  payloadJson: string,
  timeoutMs?: number
): Promise<any | null> {
  const config = requireConfig();

  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return null;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);

  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return null;
  }

  if (peer.status !== 'approved') {
    console.error(`Peer ${peerId} is not approved`);
    return null;
  }

  const payload = JSON.parse(payloadJson);

  const keypair = loadOrGenerateKeyPair();
  // BUILD-111: Use public key prefix as our ID (not hostname:port)
  const ourId = keypair.publicKey.substring(0, 32);

  const message = {
    intent,
    from: ourId,
    to: peerId,
    nonce: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    payload
  };

  const { payload: signedPayload, payloadStr, signature } = signObject(message, getPrivateKey());

  try {
    const controller = new AbortController();
    const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

    const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: signedPayload,
        messageStr: payloadStr,  // raw signed string for exact verification
        signature
      }),
      signal: controller.signal
    });

    if (timeoutId) clearTimeout(timeoutId);

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      if (result?.error) {
        console.error(`Send failed: ${response.status} ${response.statusText} - ${result.error}`);
        return result;
      }

      console.error(`Send failed: ${response.status} ${response.statusText}`);
      return {
        success: false,
        error: `Send failed: ${response.status} ${response.statusText}`,
        statusCode: response.status
      };
    }

    return result;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Request timed out after ${timeoutMs}ms`);
    } else {
      console.error('Failed to send message:', error);
    }
    return null;
  }
}

/**
 * Show scope grants for a peer
 */
export async function federationShowScopes(peerId: string): Promise<void> {
  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  console.log(`\nSCOPES FOR ${peer.displayName} (${peerId}):\n`);

  console.log('  Status:', peer.status);
  console.log('  Wire Protocol:', peer.protocolVersion || '0.1.0 (legacy)');
  console.log('');

  // What I grant TO this peer
  if (peer.grantedScopes) {
    console.log('  GRANTED TO PEER (what they can request from me):');
    for (const scope of peer.grantedScopes.scopes) {
      const status = scope.enabled ? '✓' : '✗';
      console.log(`    ${status} ${scope.intent}`);
      if (scope.rateLimit) {
        console.log(`      Rate: ${formatRateLimit(scope.rateLimit)}`);
      }
      if (scope.topics && scope.topics.length > 0) {
        console.log(`      Topics: ${scope.topics.join(', ')}`);
      }
      if (scope.expiresAt) {
        console.log(`      Expires: ${scope.expiresAt}`);
      }
    }
    console.log(`    Granted at: ${peer.grantedScopes.grantedAt}`);
  } else {
    console.log('  GRANTED TO PEER: None (v0.1 mode - default rate limits apply)');
  }

  console.log('');

  // What this peer grants TO me
  if (peer.receivedScopes) {
    console.log('  RECEIVED FROM PEER (what I can request from them):');
    for (const scope of peer.receivedScopes.scopes) {
      const status = scope.enabled ? '✓' : '✗';
      console.log(`    ${status} ${scope.intent}`);
      if (scope.rateLimit) {
        console.log(`      Rate: ${formatRateLimit(scope.rateLimit)}`);
      }
      if (scope.topics && scope.topics.length > 0) {
        console.log(`      Topics: ${scope.topics.join(', ')}`);
      }
    }
    console.log(`    Granted at: ${peer.receivedScopes.grantedAt}`);
  } else {
    console.log('  RECEIVED FROM PEER: None (awaiting their approval with scopes)');
  }

  console.log('');
}

/**
 * Update scope grants for an existing peer
 */
export async function federationUpdateGrants(
  peerId: string,
  options: ApproveOptions
): Promise<void> {
  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status !== 'approved') {
    console.error(`Peer ${peerId} is not approved. Use 'approve' to approve with scopes.`);
    return;
  }

  if (!options.intents || options.intents.length === 0) {
    console.error('No intents specified. Use --intents to specify intents to grant.');
    return;
  }

  const rateLimit = options.rate ? parseRateLimit(options.rate) : DEFAULT_RATE_LIMIT;
  if (!rateLimit) {
    console.error(`Invalid rate limit format: ${options.rate}`);
    return;
  }

  const scopes: ScopeGrant[] = options.intents.map(intent => {
    const grant = createScopeGrant(intent, { rateLimit });
    if (intent === 'agent-comms' && options.topics && options.topics.length > 0) {
      grant.topics = options.topics;
    }
    return grant;
  });

  const scopeGrants = createScopeBundle(scopes);
  updatePeerGrantedScopes(peerId, scopeGrants);

  console.log(`✓ Updated grants for ${peerId}:`);
  console.log(`  Intents: ${options.intents.join(', ')}`);
  if (options.topics && options.topics.length > 0) {
    console.log(`  Topics: ${options.topics.join(', ')}`);
  }
  console.log(`  Rate limit: ${formatRateLimit(rateLimit)}`);

  // Optionally notify peer of updated grants (they can re-fetch our card)
  console.log('\nNote: Peer will see updated capabilities on next card fetch.');
}

/**
 * Add tags to a peer (local categorization)
 */
export async function federationTagPeer(peerId: string, tags: string[]): Promise<void> {
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (!peer.tags) {
    peer.tags = [];
  }

  let added = 0;
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (!peer.tags.includes(trimmed)) {
      peer.tags.push(trimmed);
      added++;
    }
  }

  updatePeer(peerId, peer);

  if (added > 0) {
    console.log(`✓ Added ${added} tag(s) to ${peer.displayName}`);
    console.log(`  Current tags: ${peer.tags.join(', ')}`);
  } else {
    console.log('No new tags added (all tags already exist)');
  }
}

/**
 * Remove tags from a peer
 */
export async function federationUntagPeer(peerId: string, tags: string[]): Promise<void> {
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (!peer.tags || peer.tags.length === 0) {
    console.log('Peer has no tags to remove');
    return;
  }

  const before = peer.tags.length;
  peer.tags = peer.tags.filter(t => !tags.includes(t));
  const removed = before - peer.tags.length;

  updatePeer(peerId, peer);

  if (removed > 0) {
    console.log(`✓ Removed ${removed} tag(s) from ${peer.displayName}`);
    if (peer.tags.length > 0) {
      console.log(`  Remaining tags: ${peer.tags.join(', ')}`);
    } else {
      console.log('  No tags remaining');
    }
  } else {
    console.log('No tags removed (tags not found)');
  }
}

/**
 * Update identity information with an existing peer
 */
export async function federationUpdateIdentity(peerId: string): Promise<void> {
  const config = requireConfig();
  const keypair = loadOrGenerateKeyPair();

  // Resolve peer identifier
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status !== 'approved') {
    console.error(`Cannot update identity - peer ${peerId} is not approved (status: ${peer.status})`);
    return;
  }

  console.log(`Sending identity update to ${peer.displayName}...`);

  // Build identity payload
  const ourPeerId = keypair.publicKey.substring(0, 32);
  const identityUpdate = {
    id: ourPeerId,
    displayName: config.displayName,
    humanName: config.humanName,
    agentName: config.agentName,
    organization: config.organization,
    email: config.email,
    gatewayUrl: config.gatewayUrl,
    publicKey: keypair.publicKey,
  };

  const { sign } = await import('../shared/signing.js');
  const signature = sign(JSON.stringify(identityUpdate), keypair.privateKey);

  try {
    const response = await fetch(`${peer.gatewayUrl}/federation/update-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: identityUpdate, signature })
    });

    if (!response.ok) {
      console.error(`Identity update failed: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json() as { updated?: boolean; message?: string };

    if (result.updated) {
      console.log('✓ Identity update sent successfully');
      console.log(`  Peer ${peer.displayName} has been notified of your updated identity`);
    } else {
      console.log(`Note: ${result.message || 'Update acknowledged but peer may not support identity updates'}`);
    }
  } catch (error) {
    console.error('Failed to send identity update:', error instanceof Error ? error.message : error);
  }
}

/**
 * Send an agent-comms message to a peer
 */
export async function federationSendAgentComms(
  peerId: string,
  topic: string,
  messageText: string,
  options: {
    priority?: 'low' | 'normal' | 'high';
    conversationId?: string;
    waitForReply?: boolean;
    replyTimeout?: number;
  } = {}
): Promise<void> {
  const config = requireConfig();

  // Resolve peer identifier (alias, ID, or public key)
  const resolvedId = resolvePeerId(peerId);
  if (!resolvedId) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }
  peerId = resolvedId;

  const peer = getPeer(peerId);

  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status !== 'approved') {
    console.error(`Peer ${peerId} is not approved`);
    return;
  }

  const keypair = loadOrGenerateKeyPair();
  // Use 32-char public key prefix as our ID (avoids Ed25519 DER header collision with 16-char)
  const ourId = keypair.publicKey.substring(0, 32);
  const nonce = crypto.randomUUID();
  const conversationId = options.conversationId || nonce;

  // Build replyTo URL if we want to receive callbacks
  const replyTo = options.waitForReply
    ? `${config.gatewayUrl}/federation/reply/${nonce}`
    : undefined;

  const message = {
    intent: 'agent-comms',
    from: ourId,
    to: peerId,
    nonce,
    timestamp: new Date().toISOString(),
    replyTo,
    conversationId,
    payload: {
      topic,
      message: messageText,
      priority: options.priority || 'normal'
    }
  };

  const { payload: signedPayload, payloadStr, signature } = signObject(message, getPrivateKey());

  try {
    const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: signedPayload,
        messageStr: payloadStr,  // raw signed string for exact verification
        signature
      })
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 403) {
        console.error(`Access denied: ${body}`);
        console.log('Hint: Peer may not have granted you agent-comms scope for this topic.');
      } else if (response.status === 429) {
        console.error(`Rate limited: ${body}`);
      } else {
        console.error(`Send failed: ${response.status} ${response.statusText}`);
      }
      return;
    }

    const result = await response.json() as { received?: boolean; replyEndpoint?: string };

    logActivity({
      direction: 'out',
      peerId,
      peerName: peer.displayName,
      topic,
      message: messageText
    });

    await deliverLocalSessionText(
      `[OGP Agent-Comms Sent] To ${peer.displayName} (${topic}): ${messageText}`
    );

    console.log(`✓ Agent-comms sent to ${peer.displayName}`);
    console.log(`  Topic: ${topic}`);
    console.log(`  Message: ${messageText}`);

    // Poll for reply if requested
    if (options.waitForReply) {
      console.log('\nWaiting for reply...');
      const timeout = options.replyTimeout || 30000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const replyRes = await fetch(`${config.gatewayUrl}/federation/reply/${nonce}`);
          if (replyRes.ok) {
            const replyData = await replyRes.json() as { status?: string; reply?: any };
            if (replyData.status === 'complete' && replyData.reply) {
              console.log('\n✓ Reply received:');
              console.log(JSON.stringify(replyData.reply, null, 2));
              return;
            }
          }
        } catch {
          // Continue polling
        }
      }

      console.log('\n⏱ Reply timeout - no response received');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to send agent-comms:', error);
    process.exit(1);
  }
}

/**
 * Generate a federation invite token via the rendezvous server.
 *
 * Usage: ogp federation invite
 *
 * POSTs our pubkey + port to {rendezvous.url}/invite and prints the
 * resulting short token so we can share it with a peer.
 */
export async function federationInvite(): Promise<void> {
  const config = requireConfig();

  if (!config.rendezvous?.enabled || !config.rendezvous?.url) {
    console.error('Rendezvous is not enabled in your config.');
    console.error('Add "rendezvous": { "enabled": true, "url": "https://rendezvous.elelem.expert" } to ~/.ogp/config.json');
    process.exit(1);
  }

  const pubkey = getPublicKey();
  const port = config.daemonPort ?? 18790;

  try {
    const res = await fetch(`${config.rendezvous.url}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey, port }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`✗ Rendezvous invite failed: ${res.status} ${text}`);
      process.exit(1);
    }

    const data = await res.json() as { ok: boolean; token: string; expiresIn: number };
    console.log(`\nYour invite code: ${data.token}  (expires in 10 minutes)`);
    console.log(`\nShare this with your peer — they run: ogp federation accept ${data.token}\n`);
  } catch (err) {
    console.error('✗ Failed to create invite:', (err as Error).message);
    process.exit(1);
  }
}

/**
 * Accept a federation invite token from a peer.
 *
 * Usage: ogp federation accept <token>
 *
 * Looks up the token on the rendezvous server, then auto-connects using
 * the returned ip:port + pubkey.
 */
export async function federationAccept(token: string, alias?: string): Promise<void> {
  const config = requireConfig();

  if (!config.rendezvous?.enabled || !config.rendezvous?.url) {
    console.error('Rendezvous is not enabled in your config.');
    console.error('Add "rendezvous": { "enabled": true, "url": "https://rendezvous.elelem.expert" } to ~/.ogp/config.json');
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.rendezvous.url}/invite/${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      console.error('Invite code not found or expired. Ask your peer to generate a new one.');
      process.exit(1);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`✗ Rendezvous lookup failed: ${res.status} ${text}`);
      process.exit(1);
    }

    const data = await res.json() as { pubkey: string; ip: string; port: number };
    const peerUrl = `http://${data.ip}:${data.port}`;

    console.log(`✓ Resolved peer via rendezvous: ${data.pubkey.slice(0, 8)}... at ${peerUrl}`);
    console.log(`Sending federation request...`);

    const success = await federationRequest(peerUrl, data.pubkey, alias);

    if (success) {
      console.log(`\nConnected to ${data.pubkey.slice(0, 8)}... via rendezvous ✅`);
    } else {
      console.error(`\n✗ Failed to connect to ${data.pubkey.slice(0, 8)}...`);
      process.exit(1);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('✗ Rendezvous lookup timed out');
    } else {
      console.error('✗ Failed to accept invite:', (err as Error).message);
    }
    process.exit(1);
  }
}

/**
 * Connect to a peer by public key using rendezvous server discovery.
 *
 * Usage: ogp federation connect <pubkey>
 *
 * Looks up the peer URL from the rendezvous server, then sends a
 * federation request to that URL.
 */
export async function federationConnect(pubkey: string, alias?: string): Promise<void> {
  const config = requireConfig();

  if (!config.rendezvous?.enabled) {
    console.error('Rendezvous is not enabled in your config.');
    console.error('Add "rendezvous": { "enabled": true, "url": "https://rendezvous.elelem.expert" } to ~/.ogp/config.json');
    process.exit(1);
  }

  console.log(`Looking up peer ${pubkey.slice(0, 16)}... in rendezvous at ${config.rendezvous.url}`);

  const peerUrl = await lookupPeer(config.rendezvous, pubkey);

  if (!peerUrl) {
    console.error(`✗ Peer not found in rendezvous.`);
    console.error(`  Ask them to enable rendezvous or share their URL directly.`);
    console.error(`  Direct connect: ogp federation request <peer-url> ${pubkey}`);
    process.exit(1);
  }

  console.log(`✓ Found peer at ${peerUrl}`);
  console.log(`Sending federation request...`);

  await federationRequest(peerUrl, pubkey, alias);
}

/**
 * Set a user-friendly alias for a peer.
 *
 * Usage: ogp federation alias <peer-id> <alias>
 */
export async function federationSetAlias(peerId: string, alias: string): Promise<void> {
  const { updatePeer, getPeer } = await import('../daemon/peers.js');
  
  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    process.exit(1);
  }

  const success = updatePeer(peerId, { alias });
  if (success) {
    console.log(`✓ Set alias for ${peerId}: ${alias}`);
  } else {
    console.error(`Failed to set alias for ${peerId}`);
    process.exit(1);
  }
}
