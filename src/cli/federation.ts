import { listPeers, getPeer, approvePeer, rejectPeer, updatePeerGrantedScopes, type Peer } from '../daemon/peers.js';
import { requireConfig } from '../shared/config.js';
import { getPublicKey, getPrivateKey, loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { signObject } from '../shared/signing.js';
import * as crypto from 'node:crypto';
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

export async function federationList(status?: 'pending' | 'approved' | 'rejected'): Promise<void> {
  const peers = listPeers(status);

  if (peers.length === 0) {
    console.log('No peers found.');
    return;
  }

  console.log(`\n${status ? status.toUpperCase() : 'ALL'} PEERS:\n`);
  peers.forEach(peer => {
    console.log(`  ${peer.id}`);
    console.log(`    Name: ${peer.displayName}`);
    console.log(`    Status: ${peer.status}`);
    console.log(`    Gateway: ${peer.gatewayUrl}`);
    console.log(`    Public key: ${peer.publicKey.substring(0, 32)}...`);
    console.log('');
  });
}

export async function federationRequest(peerUrl: string, peerId: string): Promise<void> {
  const config = requireConfig();

  // Build our peer info
  const ourPeerInfo = {
    id: peerId,
    displayName: config.displayName,
    email: config.email,
    gatewayUrl: config.gatewayUrl,
    publicKey: getPublicKey()
  };

  const keypair = loadOrGenerateKeyPair();

  const peer = {
    id: `${new URL(config.gatewayUrl).hostname}:${config.daemonPort}`,
    displayName: config.displayName,
    email: config.email,
    gatewayUrl: config.gatewayUrl,
    publicKey: keypair.publicKey,
  };

  const { sign } = await import('../shared/signing.js');
  const signature = sign(JSON.stringify(peer), keypair.privateKey);

  const requestBody = { peer, signature };

  // Send request
  try {
    const response = await fetch(`${peerUrl}/federation/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Request failed: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json() as { status?: string; message?: string };
    console.log('✓ Federation request sent');
    console.log(`  Status: ${result.status}`);
    console.log(`  Message: ${result.message}`);

    // Fetch their federation card to get their actual identity
    // Store them as a pending peer so we can send intents when approved
    try {
      const { addPeer } = await import('../daemon/peers.js');
      const cardRes = await fetch(`${peerUrl}/.well-known/ogp`);
      if (cardRes.ok) {
        const card = await cardRes.json() as { displayName?: string; email?: string; publicKey?: string };
        const peerHostname = new URL(peerUrl).hostname;
        const peerPort = new URL(peerUrl).port || '18790';
        addPeer({
          id: `${peerHostname}:${peerPort}`,
          displayName: card.displayName || peerId,
          email: card.email || '',
          gatewayUrl: peerUrl,
          publicKey: card.publicKey || '',
          status: 'pending',
          requestedAt: new Date().toISOString()
        });
      }
    } catch { /* non-fatal */ }
  } catch (error) {
    console.error('Failed to send request:', error);
  }
}

export interface ApproveOptions {
  intents?: string[];      // Intents to grant (e.g., ['message', 'agent-comms'])
  rate?: string;           // Rate limit string (e.g., '100/3600')
  topics?: string[];       // Topics for agent-comms
}

export async function federationApprove(peerId: string, options: ApproveOptions = {}): Promise<void> {
  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status === 'approved') {
    console.log(`Peer ${peerId} is already approved.`);
    return;
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

  approvePeer(peerId);
  console.log(`✓ Approved peer: ${peerId}`);

  // Notify the peer — send both formats for maximum compatibility
  try {
    const keypair = loadOrGenerateKeyPair();
    const ourConfig = requireConfig();
    const nonce = crypto.randomUUID();
    await fetch(`${peer.gatewayUrl}/federation/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Package format
        peerId: peer.id,
        approved: true,
        // Fork format (for interoperability)
        fromGatewayId: `${new URL(ourConfig.gatewayUrl).hostname}:${ourConfig.daemonPort}`,
        fromDisplayName: ourConfig.displayName,
        fromGatewayUrl: ourConfig.gatewayUrl,
        fromPublicKey: keypair.publicKey,
        fromEmail: ourConfig.email,
        timestamp: new Date().toISOString(),
        nonce,
        // v0.2.0: Include scope grants
        protocolVersion: '0.2.0',
        scopeGrants
      })
    });
    console.log('✓ Notified peer of approval');
  } catch (error) {
    console.error('Failed to notify peer:', error);
  }
}

export async function federationReject(peerId: string): Promise<void> {
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

export async function federationSend(
  peerId: string,
  intent: string,
  payloadJson: string
): Promise<any | null> {
  const config = requireConfig();
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
  const ourId = `${new URL(config.gatewayUrl).hostname}:${config.daemonPort}`;

  const message = {
    intent,
    from: ourId,
    to: peerId,
    nonce: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    payload
  };

  const { payload: signedPayload, signature } = signObject(message, getPrivateKey());

  try {
    const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: signedPayload,
        signature
      })
    });

    if (!response.ok) {
      console.error(`Send failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = await response.json();
    console.log('✓ Message sent');
    console.log('  Response:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Failed to send message:', error);
    return null;
  }
}

/**
 * Show scope grants for a peer
 */
export async function federationShowScopes(peerId: string): Promise<void> {
  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  console.log(`\nSCOPES FOR ${peer.displayName} (${peerId}):\n`);

  console.log('  Status:', peer.status);
  console.log('  Protocol:', peer.protocolVersion || '0.1.0 (legacy)');
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
  const ourId = `${new URL(config.gatewayUrl).hostname}:${config.daemonPort}`;
  const nonce = crypto.randomUUID();

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
    conversationId: options.conversationId,
    payload: {
      topic,
      message: messageText,
      priority: options.priority || 'normal'
    }
  };

  const { payload: signedPayload, signature } = signObject(message, getPrivateKey());

  try {
    const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: signedPayload,
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
    }
  } catch (error) {
    console.error('Failed to send agent-comms:', error);
  }
}
