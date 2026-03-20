import { listPeers, getPeer, approvePeer, rejectPeer, type Peer } from '../daemon/peers.js';
import { requireConfig } from '../shared/config.js';
import { getPublicKey, getPrivateKey, loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { signObject } from '../shared/signing.js';
import * as crypto from 'node:crypto';

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

export async function federationApprove(peerId: string): Promise<void> {
  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Peer not found: ${peerId}`);
    return;
  }

  if (peer.status === 'approved') {
    console.log(`Peer ${peerId} is already approved.`);
    return;
  }

  approvePeer(peerId);
  console.log(`✓ Approved peer: ${peerId}`);

  // Notify the peer
  try {
    await fetch(`${peer.gatewayUrl}/federation/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peerId: peer.id,
        approved: true
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

  const payload = JSON.parse(payloadJson);

  const message = {
    intent,
    from: config.email,  // or another identifier
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
      return;
    }

    const result = await response.json();
    console.log('✓ Message sent');
    console.log('  Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}
