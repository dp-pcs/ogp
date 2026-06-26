import { listPeers, updatePeer, derivePeerIdFromPublicKey, deriveFederationState, type Peer, type FederationState } from './peers.js';
import { loadConfig, type HealthCheckConfig } from '../shared/config.js';
import { getPublicKey } from './keypair.js';

let heartbeatTimer: NodeJS.Timeout | null = null;

// Default values (can be overridden by config or env vars)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 10000; // 10 seconds
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3; // Mark unhealthy after 3 consecutive failures
const DEFAULT_RECENCY_MULTIPLIER = 2; // Issue #3: "recent" = 2× heartbeat interval

// Active configuration (resolved from defaults, config file, and env vars)
let activeConfig = {
  intervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  timeoutMs: DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
  maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
  recencyMultiplier: DEFAULT_RECENCY_MULTIPLIER
};

export type HealthState = NonNullable<Peer['healthState']>;

/**
 * Derive directional health state from local data alone (Issue #3) plus, when
 * available, the authoritative inbound report from the peer (Issue #5).
 *
 * Pure function — exported for testing.
 *
 * Resolution order for the inbound side:
 *   1. `inboundHealthReport` if recent — authoritative (the peer told us
 *      whether they can reach us).
 *   2. `lastInboundContactAt` recency — inferred from cryptographically
 *      attributed inbound traffic.
 *   3. No inbound signal at all — fall back to outbound-only.
 *
 * @param peer       The peer being evaluated.
 * @param now        Current time in ms since epoch.
 * @param recencyMs  Threshold beyond which inbound signals count as stale.
 *                   Typically `intervalMs * recencyMultiplier`.
 */
export function deriveHealthState(
  peer: Pick<Peer, 'healthy' | 'lastInboundContactAt' | 'inboundHealthReport'>,
  now: number,
  recencyMs: number
): HealthState {
  const outboundOk = peer.healthy !== false;

  // Issue #5: prefer the authoritative report when it's recent.
  if (peer.inboundHealthReport) {
    const reportAge = now - new Date(peer.inboundHealthReport.receivedAt).getTime();
    if (reportAge >= 0 && reportAge < recencyMs) {
      const inboundOk = peer.inboundHealthReport.healthy;
      if (outboundOk && inboundOk) return 'established';
      if (outboundOk && !inboundOk) return 'degraded-inbound';
      if (!outboundOk && inboundOk) return 'degraded-outbound';
      return 'down';
    }
  }

  if (!peer.lastInboundContactAt) {
    // No inbound history yet — fall back to the legacy outbound-only judgment to
    // avoid flagging fresh peers as `degraded-inbound` indefinitely.
    return outboundOk ? 'established' : 'down';
  }

  const inboundAge = now - new Date(peer.lastInboundContactAt).getTime();
  const inboundRecent = inboundAge >= 0 && inboundAge < recencyMs;

  if (outboundOk && inboundRecent) return 'established';
  if (outboundOk && !inboundRecent) return 'degraded-inbound';
  if (!outboundOk && inboundRecent) return 'degraded-outbound';
  return 'down';
}

/**
 * Load health check configuration from config file and environment variables.
 * Priority: ENV > config file > defaults
 */
export function loadHealthCheckConfig(): void {
  const config = loadConfig();
  const configHealthCheck = config?.healthCheck || {};

  // Start with defaults
  let intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
  let timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  let maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES;
  let recencyMultiplier = DEFAULT_RECENCY_MULTIPLIER;

  // Apply config file values
  if (configHealthCheck.intervalMs !== undefined) {
    intervalMs = configHealthCheck.intervalMs;
  }
  if (configHealthCheck.timeoutMs !== undefined) {
    timeoutMs = configHealthCheck.timeoutMs;
  }
  if (configHealthCheck.maxConsecutiveFailures !== undefined) {
    maxConsecutiveFailures = configHealthCheck.maxConsecutiveFailures;
  }
  if (configHealthCheck.recencyMultiplier !== undefined) {
    recencyMultiplier = configHealthCheck.recencyMultiplier;
  }

  // Apply environment variable overrides (highest priority)
  if (process.env.OGP_HEARTBEAT_INTERVAL_MS) {
    intervalMs = parseInt(process.env.OGP_HEARTBEAT_INTERVAL_MS, 10);
  }
  if (process.env.OGP_HEARTBEAT_TIMEOUT_MS) {
    timeoutMs = parseInt(process.env.OGP_HEARTBEAT_TIMEOUT_MS, 10);
  }
  if (process.env.OGP_HEARTBEAT_MAX_FAILURES) {
    maxConsecutiveFailures = parseInt(process.env.OGP_HEARTBEAT_MAX_FAILURES, 10);
  }
  if (process.env.OGP_HEARTBEAT_RECENCY_MULTIPLIER) {
    recencyMultiplier = parseFloat(process.env.OGP_HEARTBEAT_RECENCY_MULTIPLIER);
  }

  activeConfig = { intervalMs, timeoutMs, maxConsecutiveFailures, recencyMultiplier };
}

export interface HealthCheckResult {
  reachable: boolean;
  /**
   * Issue #5: authoritative inbound report parsed from the peer's
   * /.well-known/ogp response body when they recognised our
   * X-OGP-Peer-ID header.
   */
  peerStatus?: {
    healthy: boolean;
    healthState?: Peer['healthState'];
    lastCheckedAt?: string;
    lastCheckFailedAt?: string;
    healthCheckFailures?: number;
  };
}

export function buildFederationStateReason(
  newState: FederationState,
  prevFailures: number | undefined,
  nextFailures: number | undefined,
  // bd-w6jm: the granular pre-collapse healthState lets us report WHICH side is
  // degraded. `healthCheckFailures` only counts heartbeat-probe (/.well-known/ogp)
  // reachability failures — it is NOT wired to the federation send path, so a peer
  // whose probe still succeeds but whose message sends are 502-ing reports
  // `failures: 0`. Labeling that 0 as "outbound failures" was the misnomer: the
  // degraded state is almost always inbound-staleness, not outbound trouble.
  healthState?: Peer['healthState']
): string {
  const failures = nextFailures ?? prevFailures ?? 0;
  switch (newState) {
    case 'established': return failures === 0 ? 'outbound + inbound healthy' : 'failures cleared';
    case 'degraded':
      // Distinguish direction from the granular healthState rather than mislabeling
      // a probe-only counter as "outbound failures".
      if (healthState === 'degraded-inbound') return 'inbound stale (probe reachable)';
      if (healthState === 'degraded-outbound') {
        return failures > 0
          ? `outbound probe failures: ${failures}`
          : 'outbound probe failing';
      }
      return failures > 0 ? `probe failures: ${failures}` : 'partial health';
    case 'down': return failures > 0 ? `${failures} consecutive failures` : 'no recent contact';
    case 'twoWay': return 'awaiting first bidirectional health check';
    default: return '';
  }
}

function getLocalPeerId(): string | null {
  try {
    return derivePeerIdFromPublicKey(getPublicKey());
  } catch {
    // Keypair may be unavailable in some test/setup paths — degrade silently.
    return null;
  }
}

/**
 * Check if a single peer is healthy by fetching their /.well-known/ogp endpoint.
 *
 * Issue #5: sends X-OGP-Peer-ID so the responder can include their view of our
 * health in `peerStatus`, parsed and returned alongside the boolean reachability.
 */
async function checkPeerHealth(peer: Peer): Promise<HealthCheckResult> {
  // bd-uiwr: a relay-only peer has no reachable HTTP gateway, so the direct probe
  // below would always fail and show them perpetually "unhealthy" even when they
  // are reachable via the relay. If the peer is currently registered at rendezvous
  // advertising a relay descriptor, treat that registration (fresh by the server's
  // 90s TTL) as the liveness signal instead of probing their dead gatewayUrl.
  try {
    const cfg = loadConfig();
    if (cfg?.rendezvous?.enabled && peer.publicKey) {
      const { lookupPeerTransports } = await import('./rendezvous.js');
      const resolved = await lookupPeerTransports(cfg.rendezvous, peer.publicKey);
      // bd-maas: a peer is reachable if ANY advertised transport is reachable.
      // A relay entry means they're registered (TTL-fresh) and holding a relay
      // socket ⇒ reachable without probing their (possibly absent) gateway.
      if (resolved.some((t) => t.mode === 'relay')) {
        return { reachable: true };
      }
    }
  } catch {
    // Rendezvous unavailable or lookup failed — fall through to the HTTP probe so
    // a flaky rendezvous never makes a directly-reachable peer look unhealthy.
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), activeConfig.timeoutMs);

    const headers: Record<string, string> = {
      'User-Agent': 'OGP-Heartbeat/1.0'
    };
    const localPeerId = getLocalPeerId();
    if (localPeerId) {
      headers['X-OGP-Peer-ID'] = localPeerId;
      // SECURITY (F-12): Sign the peer-id assertion with our private key so
      // the responder can verify we actually own this peerId before exposing
      // their view of our health. Unsigned X-OGP-Peer-ID was a topology probe.
      try {
        const { sign } = await import('../shared/signing.js');
        const { getPrivateKey } = await import('./keypair.js');
        const timestamp = new Date().toISOString();
        const message = JSON.stringify({ peerId: localPeerId, timestamp });
        headers['X-OGP-Timestamp'] = timestamp;
        headers['X-OGP-Signature'] = sign(message, getPrivateKey());
      } catch {
        // If keypair is unavailable just send the unsigned peer-id; responder
        // will fall through to the unauthenticated discovery path.
      }
    }

    const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`, {
      signal: controller.signal,
      headers
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { reachable: false };
    }

    let peerStatus: HealthCheckResult['peerStatus'];
    try {
      const body = await response.json() as { peerStatus?: HealthCheckResult['peerStatus'] };
      if (body && body.peerStatus && typeof body.peerStatus === 'object' && typeof body.peerStatus.healthy === 'boolean') {
        peerStatus = {
          healthy: body.peerStatus.healthy,
          healthState: body.peerStatus.healthState,
          lastCheckedAt: body.peerStatus.lastCheckedAt ?? undefined,
          lastCheckFailedAt: body.peerStatus.lastCheckFailedAt ?? undefined,
          healthCheckFailures: typeof body.peerStatus.healthCheckFailures === 'number'
            ? body.peerStatus.healthCheckFailures
            : undefined
        };
      }
    } catch {
      // Non-JSON or malformed body — peer reachable but no peerStatus available.
    }

    return { reachable: true, peerStatus };
  } catch {
    // Network errors, timeouts, etc. = unhealthy
    return { reachable: false };
  }
}

/**
 * Run health checks on all approved peers
 */
async function runHealthChecks(): Promise<void> {
  const peers = listPeers('approved');

  if (peers.length === 0) {
    return;
  }

  console.log(`[OGP Heartbeat] Checking health of ${peers.length} peer(s)...`);

  const recencyMs = activeConfig.intervalMs * activeConfig.recencyMultiplier;

  // Check all peers in parallel
  const healthCheckPromises = peers.map(async (peer) => {
    const result = await checkPeerHealth(peer);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const nowMs = nowDate.getTime();

    let nextHealthy: boolean;
    let updates: Partial<Peer>;
    let nextInboundReport: Peer['inboundHealthReport'] = peer.inboundHealthReport;

    if (result.reachable) {
      if (peer.healthy === false) {
        console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) is now healthy`);
      }
      nextHealthy = true;
      updates = {
        lastSeenAt: now,
        lastOutboundCheckAt: now,
        healthy: true,
        healthCheckFailures: 0
      };

      // Issue #5: store the authoritative inbound report when the peer
      // returned one (i.e. they recognised our X-OGP-Peer-ID).
      if (result.peerStatus) {
        const previous = peer.inboundHealthReport;
        nextInboundReport = {
          healthy: result.peerStatus.healthy,
          healthState: result.peerStatus.healthState,
          lastCheckedAt: result.peerStatus.lastCheckedAt,
          lastCheckFailedAt: result.peerStatus.lastCheckFailedAt,
          healthCheckFailures: result.peerStatus.healthCheckFailures,
          receivedAt: now
        };
        updates.inboundHealthReport = nextInboundReport;

        if (!previous || previous.healthy !== nextInboundReport.healthy) {
          console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}): inbound report = ${nextInboundReport.healthy ? 'healthy' : 'unhealthy'} (peer's view of us)`);
        }
      }
    } else {
      const failures = (peer.healthCheckFailures || 0) + 1;
      const wasHealthy = peer.healthy !== false;
      const isNowUnhealthy = failures >= activeConfig.maxConsecutiveFailures;

      if (wasHealthy && isNowUnhealthy) {
        console.warn(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) marked as unhealthy after ${failures} consecutive failures`);
      }

      nextHealthy = isNowUnhealthy ? false : peer.healthy !== false;
      updates = {
        lastOutboundCheckFailedAt: now,
        healthy: isNowUnhealthy ? false : peer.healthy,
        healthCheckFailures: failures
      };
    }

    // Issues #3 + #5: derive directional health state from the post-update view of the peer.
    const newState = deriveHealthState(
      {
        healthy: nextHealthy,
        lastInboundContactAt: peer.lastInboundContactAt,
        inboundHealthReport: nextInboundReport
      },
      nowMs,
      recencyMs
    );
    if (newState !== peer.healthState) {
      console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}): healthState ${peer.healthState ?? 'unknown'} → ${newState}`);
      updates.healthState = newState;
      updates.healthStateChangedAt = now;
    }

    // Issue #4: derive lifecycle federationState from the post-update view.
    const newFederationState = deriveFederationState({
      status: peer.status,
      healthState: newState,
      lastOutboundCheckAt: result.reachable ? now : peer.lastOutboundCheckAt,
      lastOutboundCheckFailedAt: result.reachable ? peer.lastOutboundCheckFailedAt : now,
      lastInboundContactAt: peer.lastInboundContactAt,
      inboundHealthReport: nextInboundReport
    });
    if (newFederationState !== peer.federationState) {
      const reason = buildFederationStateReason(newFederationState, peer.healthCheckFailures, updates.healthCheckFailures, newState);
      console.log(`[OGP Federation] ${peer.displayName} (${peer.id}): ${peer.federationState ?? 'unknown'} → ${newFederationState}${reason ? ` (${reason})` : ''}`);
      updates.federationState = newFederationState;
      updates.federationStateChangedAt = now;
      if (reason) updates.federationStateReason = reason;
    }

    updatePeer(peer.id, updates);
  });

  await Promise.allSettled(healthCheckPromises);
  console.log(`[OGP Heartbeat] Health check completed`);

  // Cleanup expired resync snapshots (older than 7 days)
  cleanupExpiredSnapshots();

  // bd-53c: periodic contribution backfill (anti-entropy). Pull peers' signed
  // contributions and union-merge by id so fragmented mirrors converge over time.
  // Idempotent (re-pulls are no-op duplicates); best-effort; capped per pass.
  await runContributionBackfill().catch((err) => {
    console.warn(`[OGP Backfill] error: ${(err as Error).message}`);
  });
}

/**
 * Periodic anti-entropy pass (bd-53c). For each local project, pull contributions
 * from the project's other members (approved peers) over the signed project.query
 * path and union-merge by id. Capped fan-out so large projects can't flood a tick.
 */
async function runContributionBackfill(): Promise<void> {
  const cfg = loadConfig();
  if (cfg?.backfill?.enabled === false) return;

  const maxPeers = cfg?.backfill?.maxPeersPerPass ?? 10;
  const limit = cfg?.backfill?.limit ?? 500;

  const { listProjects } = await import('./projects.js');
  const { upsertContribution } = await import('./projects.js');
  const { backfillContributionsFromPeer } = await import('./contribution-backfill.js');
  const projects = listProjects();
  if (projects.length === 0) return;

  const selfId = getLocalPeerId();
  const approved = new Set(listPeers('approved').map((p) => p.id));

  // Build the (project, peer) work list, capped at maxPeers total this pass.
  const work: Array<{ projectId: string; peerId: string }> = [];
  for (const project of projects) {
    for (const member of project.members) {
      if (member === selfId) continue;
      if (!approved.has(member)) continue;
      work.push({ projectId: project.id, peerId: member });
      if (work.length >= maxPeers) break;
    }
    if (work.length >= maxPeers) break;
  }
  if (work.length === 0) return;

  const deps = {
    query: async (peerId: string, projectId: string, lim: number) => {
      const { federationSend } = await import('../cli/federation.js');
      const res = await federationSend(peerId, 'project.query', JSON.stringify({ projectId, limit: lim }), 30000);
      return res as any;
    },
    upsert: (projectId: string, record: any) => upsertContribution(projectId, record),
  };

  let merged = 0;
  for (const { projectId, peerId } of work) {
    const r = await backfillContributionsFromPeer(peerId, projectId, deps, { limit });
    merged += r.inserted;
  }
  if (merged > 0) {
    console.log(`[OGP Backfill] merged ${merged} new contribution(s) across ${work.length} peer-project pull(s)`);
  }
}

/**
 * Remove expired resync snapshots from peers
 */
function cleanupExpiredSnapshots(): void {
  const peers = listPeers();
  const now = Date.now();
  let cleanedCount = 0;

  for (const peer of peers) {
    if (peer.resyncSnapshot) {
      const expiresAt = new Date(peer.resyncSnapshot.expiresAt).getTime();
      if (now > expiresAt) {
        updatePeer(peer.id, { resyncSnapshot: undefined });
        cleanedCount++;
        console.log(`[OGP Heartbeat] Cleaned up expired resync snapshot for ${peer.displayName}`);
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`[OGP Heartbeat] Cleaned up ${cleanedCount} expired resync snapshot(s)`);
  }
}

/**
 * Start the periodic heartbeat timer
 */
export function startHeartbeat(): void {
  if (heartbeatTimer) {
    console.warn('[OGP Heartbeat] Heartbeat already running');
    return;
  }

  // Load configuration (config file + env vars)
  loadHealthCheckConfig();

  console.log(`[OGP Heartbeat] Starting heartbeat (interval: ${activeConfig.intervalMs / 1000}s, timeout: ${activeConfig.timeoutMs / 1000}s, max failures: ${activeConfig.maxConsecutiveFailures})`);

  // Run initial health check after a short delay (30 seconds) to avoid startup congestion
  setTimeout(() => {
    runHealthChecks().catch((error) => {
      console.error('[OGP Heartbeat] Error during initial health check:', error);
    });
  }, 30000);

  // Then run periodically
  heartbeatTimer = setInterval(() => {
    runHealthChecks().catch((error) => {
      console.error('[OGP Heartbeat] Error during health check:', error);
    });
  }, activeConfig.intervalMs);
}

/**
 * Stop the periodic heartbeat timer
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('[OGP Heartbeat] Heartbeat stopped');
  }
}

/**
 * Get heartbeat configuration
 */
export function getHeartbeatConfig() {
  return {
    ...activeConfig,
    isRunning: heartbeatTimer !== null
  };
}

/**
 * Manually trigger a health check (for testing/debugging)
 */
export async function triggerHealthCheck(): Promise<void> {
  await runHealthChecks();
}
