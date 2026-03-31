import { listPeers, loadPeers, savePeers, getPeer, approvePeer, rejectPeer, updatePeerGrantedScopes } from '../daemon/peers.js';
import { requireConfig } from '../shared/config.js';
import { lookupPeer } from '../daemon/rendezvous.js';
import { getPublicKey, getPrivateKey, loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { signObject } from '../shared/signing.js';
import * as crypto from 'node:crypto';
import { createScopeBundle, createScopeGrant, parseRateLimit, formatRateLimit, DEFAULT_RATE_LIMIT } from '../daemon/scopes.js';
export async function federationList(status) {
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
export async function federationRequest(peerUrl, peerId) {
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
            return false;
        }
        const result = await response.json();
        console.log('✓ Federation request sent');
        console.log(`  Status: ${result.status}`);
        console.log(`  Message: ${result.message}`);
        // Fetch their federation card to get their actual identity
        // Store them as a pending peer so we can send intents when approved
        try {
            const { addPeer } = await import('../daemon/peers.js');
            const cardRes = await fetch(`${peerUrl}/.well-known/ogp`);
            if (cardRes.ok) {
                const card = await cardRes.json();
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
        }
        catch { /* non-fatal */ }
        return true;
    }
    catch (error) {
        console.error('Failed to send request:', error);
        return false;
    }
}
export async function federationApprove(peerId, options = {}) {
    const peer = getPeer(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    if (peer.status === 'approved') {
        console.log(`Peer ${peerId} is already approved.`);
        return;
    }
    // BUILD-99/100: Default to full standard scopes if no intents specified
    const DEFAULT_INTENTS = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
    if (!options.intents || options.intents.length === 0) {
        options.intents = DEFAULT_INTENTS;
        console.log(`ℹ Auto-granting default scopes: ${DEFAULT_INTENTS.join(', ')}`);
        console.log(`  (Use --intents to specify custom scopes)`);
    }
    // Build scope grants if provided
    let scopeGrants;
    if (options.intents && options.intents.length > 0) {
        const rateLimit = options.rate ? parseRateLimit(options.rate) : DEFAULT_RATE_LIMIT;
        if (!rateLimit) {
            console.error(`Invalid rate limit format: ${options.rate} (expected: requests/seconds e.g., 100/3600)`);
            return;
        }
        const scopes = options.intents.map(intent => {
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
    // BUILD-102: Auto-register existing local projects as agent-comms topics for this peer
    const { listProjects } = await import('../daemon/projects.js');
    const { setPeerTopicPolicy } = await import('../daemon/peers.js');
    const projects = listProjects();
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
    }
    catch (error) {
        console.error('Failed to notify peer:', error);
    }
}
export async function federationReject(peerId) {
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
    }
    catch (error) {
        console.error('Failed to notify peer:', error);
    }
}
export async function federationRemove(peerId) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        process.exit(1);
    }
    const filtered = peers.filter(p => p.id !== peerId);
    savePeers(filtered);
    console.log(`✓ Removed peer: ${peerId} (${peer.displayName})`);
}
export async function federationSend(peerId, intent, payloadJson, timeoutMs) {
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
    const { payload: signedPayload, payloadStr, signature } = signObject(message, getPrivateKey());
    try {
        const controller = new AbortController();
        const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: signedPayload,
                messageStr: payloadStr, // raw signed string for exact verification
                signature
            }),
            signal: controller.signal
        });
        if (timeoutId)
            clearTimeout(timeoutId);
        if (!response.ok) {
            console.error(`Send failed: ${response.status} ${response.statusText}`);
            return null;
        }
        const result = await response.json();
        return result;
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.error(`Request timed out after ${timeoutMs}ms`);
        }
        else {
            console.error('Failed to send message:', error);
        }
        return null;
    }
}
/**
 * Show scope grants for a peer
 */
export async function federationShowScopes(peerId) {
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
    }
    else {
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
    }
    else {
        console.log('  RECEIVED FROM PEER: None (awaiting their approval with scopes)');
    }
    console.log('');
}
/**
 * Update scope grants for an existing peer
 */
export async function federationUpdateGrants(peerId, options) {
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
    const scopes = options.intents.map(intent => {
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
export async function federationSendAgentComms(peerId, topic, messageText, options = {}) {
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
            }
            else if (response.status === 429) {
                console.error(`Rate limited: ${body}`);
            }
            else {
                console.error(`Send failed: ${response.status} ${response.statusText}`);
            }
            return;
        }
        const result = await response.json();
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
                        const replyData = await replyRes.json();
                        if (replyData.status === 'complete' && replyData.reply) {
                            console.log('\n✓ Reply received:');
                            console.log(JSON.stringify(replyData.reply, null, 2));
                            return;
                        }
                    }
                }
                catch {
                    // Continue polling
                }
            }
            console.log('\n⏱ Reply timeout - no response received');
        }
    }
    catch (error) {
        console.error('Failed to send agent-comms:', error);
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
export async function federationInvite() {
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
        const data = await res.json();
        console.log(`\nYour invite code: ${data.token}  (expires in 10 minutes)`);
        console.log(`\nShare this with your peer — they run: ogp federation accept ${data.token}\n`);
    }
    catch (err) {
        console.error('✗ Failed to create invite:', err.message);
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
export async function federationAccept(token) {
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
        const data = await res.json();
        const peerUrl = `http://${data.ip}:${data.port}`;
        console.log(`✓ Resolved peer via rendezvous: ${data.pubkey.slice(0, 8)}... at ${peerUrl}`);
        console.log(`Sending federation request...`);
        const success = await federationRequest(peerUrl, data.pubkey);
        if (success) {
            console.log(`\nConnected to ${data.pubkey.slice(0, 8)}... via rendezvous ✅`);
        }
        else {
            console.error(`\n✗ Failed to connect to ${data.pubkey.slice(0, 8)}...`);
            process.exit(1);
        }
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            console.error('✗ Rendezvous lookup timed out');
        }
        else {
            console.error('✗ Failed to accept invite:', err.message);
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
export async function federationConnect(pubkey) {
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
    await federationRequest(peerUrl, pubkey);
}
//# sourceMappingURL=federation.js.map