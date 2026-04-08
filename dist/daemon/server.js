import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const OGP_VERSION = _require('../../package.json').version;
import { requireConfig, loadConfig, getConfigDir } from '../shared/config.js';
import { getPublicKey } from './keypair.js';
import { addPeer, getPeer, approvePeer, listPeers, updatePeer, removePeer, loadPeers, savePeers } from './peers.js';
import { handleMessage } from './message-handler.js';
import { verify } from '../shared/signing.js';
import { notifyOpenClaw } from './notify.js';
import { startDoormanCleanup, stopDoormanCleanup } from './doorman.js';
import { startReplyCleanup, stopReplyCleanup, getPendingReply, deletePendingReply, storePendingReply } from './reply-handler.js';
import { startRendezvous, stopRendezvous } from './rendezvous.js';
import { loadIntents } from './intent-registry.js';
let server = null;
/**
 * Get the daemon PID file path (computed dynamically based on OGP_HOME)
 */
function getDaemonPidFile() {
    return path.join(getConfigDir(), 'daemon.pid');
}
/**
 * Get the daemon log file path (computed dynamically based on OGP_HOME)
 */
function getDaemonLogFile() {
    return path.join(getConfigDir(), 'daemon.log');
}
export function startServer(config, background = false) {
    const cfg = config || requireConfig();
    // If background mode requested, fork and exit parent
    if (background) {
        const logStream = fs.openSync(getDaemonLogFile(), 'a');
        const child = spawn(process.execPath, [process.argv[1], 'start'], {
            detached: true,
            stdio: ['ignore', logStream, logStream]
        });
        child.unref();
        fs.writeFileSync(getDaemonPidFile(), child.pid.toString(), 'utf-8');
        console.log(`OGP daemon started (PID: ${child.pid})`);
        console.log(`Logs: ${getDaemonLogFile()}`);
        process.exit(0);
    }
    const app = express();
    app.use(express.json());
    // /.well-known/ogp - Discovery endpoint
    app.get('/.well-known/ogp', (req, res) => {
        // Get supported intents from registry
        const intents = loadIntents();
        const intentNames = intents.map(i => i.name);
        res.json({
            version: OGP_VERSION,
            displayName: cfg.displayName,
            email: cfg.email,
            gatewayUrl: cfg.gatewayUrl,
            publicKey: getPublicKey(),
            capabilities: {
                intents: intentNames,
                features: ['scope-negotiation', 'reply-callback']
            },
            endpoints: {
                request: `${cfg.gatewayUrl}/federation/request`,
                approve: `${cfg.gatewayUrl}/federation/approve`,
                message: `${cfg.gatewayUrl}/federation/message`,
                reply: `${cfg.gatewayUrl}/federation/reply/:nonce`
            }
        });
    });
    // POST /federation/request - Incoming federation request
    app.post('/federation/request', async (req, res) => {
        try {
            const { peer, signature } = req.body;
            if (!peer || !signature) {
                return res.status(400).json({ error: 'Missing peer or signature' });
            }
            // Derive peer ID from public key (BUILD-111: port-agnostic identity)
            // NEVER trust sender's peer.id - always use public key prefix
            // Use 32-char prefix to avoid collision on shared Ed25519 DER header (first 24 chars identical for ALL Ed25519 keys)
            const peerIdFromKey = peer.publicKey.substring(0, 32);
            // Check if peer already exists (by public key)
            const existingPeer = getPeer(peerIdFromKey);
            if (existingPeer) {
                // Allow re-federation if previously removed or rejected
                if (existingPeer.status === 'removed' || existingPeer.status === 'rejected') {
                    // Reset to pending so the request can be approved fresh
                    const prevStatus = existingPeer.status;
                    existingPeer.status = 'pending';
                    existingPeer.requestedAt = new Date().toISOString();
                    existingPeer.displayName = peer.displayName;
                    existingPeer.email = peer.email;
                    existingPeer.gatewayUrl = peer.gatewayUrl;
                    savePeers(loadPeers().map((p) => p.id === existingPeer.id ? existingPeer : p));
                    console.log(`[OGP] Re-federation request from ${peer.displayName} (${peerIdFromKey}) — reset from ${prevStatus} to pending`);
                }
                else {
                    return res.status(200).json({
                        received: true,
                        status: 'already-pending-or-approved',
                        peerId: peerIdFromKey
                    });
                }
            }
            const peerData = {
                id: peerIdFromKey, // Always use derived ID, never sender's
                displayName: peer.displayName,
                email: peer.email,
                gatewayUrl: peer.gatewayUrl,
                publicKey: peer.publicKey,
                status: 'pending',
                requestedAt: new Date().toISOString(),
                // BUILD-115: Record which agent owns this federation relationship
                agentId: cfg.agentId
            };
            // Store offered intents if provided (BUILD-110: intent negotiation)
            const offeredIntents = req.body.offeredIntents;
            if (offeredIntents && offeredIntents.length > 0) {
                peerData.offeredIntents = offeredIntents;
                console.log(`[OGP] Peer ${peer.displayName} offers intents: ${offeredIntents.join(', ')}`);
            }
            // BUILD-111 CRITICAL FIX: Actually persist the peer to disk!
            // This was missing - the peer was created but never saved
            addPeer(peerData);
            console.log(`[OGP] Peer ${peer.displayName} (${peerIdFromKey}) added to peers.json`);
            console.log(`[OGP] Federation request from ${peer.displayName} (${peerIdFromKey})`);
            // BUILD-77: Fire immediate OpenClaw notification to agent session
            const offeredIntentsList = peerData.offeredIntents ? peerData.offeredIntents.join(', ') : 'message, agent-comms, project.* (defaults)';
            const notificationText = `[OGP Federation Request] ${peer.displayName} (${peerIdFromKey}) requests federation approval\n` +
                `Gateway: ${peer.gatewayUrl}\n` +
                `Email: ${peer.email}\n` +
                `Type: Bidirectional (two-way) federation\n` +
                `Intents Offered: ${offeredIntentsList}\n` +
                `Action: Review and approve/reject using: ogp federation approve ${peerIdFromKey}`;
            // Send notification with metadata for agent processing
            const notificationPayload = {
                text: notificationText,
                sessionKey: 'agent:main:main', // Default main agent session
                metadata: {
                    ogp: {
                        type: 'federation_request',
                        peer: {
                            id: peer.id,
                            displayName: peer.displayName,
                            email: peer.email,
                            gatewayUrl: peer.gatewayUrl
                        },
                        requestedAt: peerData.requestedAt,
                        federationType: 'bidirectional',
                        offeredIntents: peerData.offeredIntents || ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'],
                        approvalCommand: `ogp federation approve ${peer.id}`
                    }
                }
            };
            // Fire notification immediately (not via heartbeat)
            try {
                const notified = await notifyOpenClaw(notificationPayload);
                if (notified) {
                    console.log(`[OGP] Agent session notified of federation request from ${peer.displayName}`);
                }
                else {
                    console.warn(`[OGP] Failed to notify agent session of federation request from ${peer.displayName}`);
                }
            }
            catch (error) {
                console.error(`[OGP] Error notifying agent session:`, error);
            }
            res.json({
                received: true,
                status: 'pending',
                message: 'Federation request received and pending approval'
            });
        }
        catch (error) {
            console.error('[OGP] Error handling federation request:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // POST /federation/approve - Peer approves our request
    // Accepts both package format {peerId, approved} and fork format {fromGatewayId, fromGatewayUrl, ...}
    // v0.2.0: Also accepts scopeGrants for scope negotiation
    app.post('/federation/approve', async (req, res) => {
        try {
            const body = req.body || {};
            // Fork format: full identity card sent as approval signal
            const fromGatewayId = body.fromGatewayId;
            const fromGatewayUrl = body.fromGatewayUrl;
            const fromDisplayName = body.fromDisplayName;
            const fromPublicKey = body.fromPublicKey;
            const fromEmail = body.fromEmail;
            // Package format: simple peerId + approved flag
            const peerId = body.peerId;
            // v0.2.0: Scope grants from the approving peer
            const scopeGrants = body.scopeGrants;
            const protocolVersion = body.protocolVersion || (scopeGrants ? '0.2.0' : '0.1.0');
            // Derive peer ID from public key (BUILD-111: port-agnostic identity)
            const peerIdFromKey = fromPublicKey ? fromPublicKey.substring(0, 32) : (peerId || fromGatewayId);
            // Find the peer to approve — try multiple strategies
            let peer = null;
            if (peerIdFromKey)
                peer = getPeer(peerIdFromKey);
            if (!peer && fromGatewayUrl) {
                const allPeers = listPeers();
                peer = allPeers.find((p) => p.gatewayUrl === fromGatewayUrl) || null;
            }
            // Last resort: match by public key prefix
            if (!peer && fromPublicKey) {
                const allPeers = listPeers();
                peer = allPeers.find((p) => p.publicKey.startsWith(fromPublicKey.substring(0, 16))) || null;
            }
            // Final fallback: approve any pending peer
            if (!peer) {
                const allPeers = listPeers();
                peer = allPeers.find((p) => p.status === 'pending') || null;
            }
            if (!peer) {
                return res.status(404).json({ error: 'No pending peer found' });
            }
            // Update peer info if fork sent richer data
            const peerUpdates = {};
            if (fromDisplayName)
                peerUpdates.displayName = fromDisplayName;
            if (fromPublicKey)
                peerUpdates.publicKey = fromPublicKey;
            if (fromEmail)
                peerUpdates.email = fromEmail;
            peerUpdates.protocolVersion = protocolVersion;
            // BUILD-115: Record which agent owns this federation relationship
            peerUpdates.agentId = cfg.agentId;
            // Store received scopes (what this peer grants TO us)
            if (scopeGrants) {
                peerUpdates.receivedScopes = scopeGrants;
                console.log(`[OGP] Received scope grants from ${peer.displayName}:`, scopeGrants.scopes.map(s => s.intent).join(', '));
            }
            // Update peer with new info
            if (Object.keys(peerUpdates).length > 0) {
                updatePeer(peer.id, peerUpdates);
            }
            approvePeer(peer.id);
            console.log(`[OGP] Federation approved by ${peer.displayName} (v${protocolVersion})`);
            // BUILD-99/100: Auto-grant default scopes back to the approving peer if they have none yet
            // This ensures bidirectional scope negotiation happens in a single handshake
            const { updatePeerGrantedScopes } = await import('./peers.js');
            const { createScopeBundle, createScopeGrant, DEFAULT_RATE_LIMIT } = await import('./scopes.js');
            const { getPrivateKey: _getPrivateKey } = await import('./keypair.js');
            const { signObject: _signObject } = await import('../shared/signing.js');
            const freshPeer = getPeer(peer.id);
            if (freshPeer && !freshPeer.grantedScopes) {
                const defaultIntents = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
                const scopes = defaultIntents.map(intent => createScopeGrant(intent, { rateLimit: DEFAULT_RATE_LIMIT }));
                const bundle = createScopeBundle(scopes);
                updatePeerGrantedScopes(peer.id, bundle);
                console.log(`[OGP] Auto-granted default scopes to ${peer.displayName}: ${defaultIntents.join(', ')}`);
                // Send our grants back to the approving peer
                try {
                    const ourConfig = requireConfig();
                    const keypair = (await import('./keypair.js')).loadOrGenerateKeyPair();
                    await fetch(`${freshPeer.gatewayUrl}/federation/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fromGatewayId: `${new URL(ourConfig.gatewayUrl).hostname}:${ourConfig.daemonPort}`,
                            fromDisplayName: ourConfig.displayName,
                            fromGatewayUrl: ourConfig.gatewayUrl,
                            fromPublicKey: keypair.publicKey,
                            fromEmail: ourConfig.email,
                            timestamp: new Date().toISOString(),
                            protocolVersion: '0.2.0',
                            scopeGrants: bundle
                        })
                    });
                    console.log(`[OGP] Sent auto-grant confirmation back to ${peer.displayName}`);
                }
                catch (e) {
                    console.warn(`[OGP] Could not send auto-grant back to ${peer.displayName}:`, e);
                }
            }
            res.json({ received: true });
        }
        catch (error) {
            console.error('[OGP] Error handling approval:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // POST /federation/removed - Receive tear-down notification from removing peer
    // BUILD-113: Orphaned federation cleanup (asymmetric removal)
    app.post('/federation/removed', async (req, res) => {
        try {
            const { peerId, timestamp, signature } = req.body;
            // Validate required fields
            if (!peerId || !timestamp || !signature) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: peerId, timestamp, signature'
                });
            }
            // Find the peer
            const peer = getPeer(peerId);
            if (!peer) {
                return res.status(404).json({
                    success: false,
                    error: 'Unknown peer'
                });
            }
            // Verify signature from the removing peer
            // The message to verify is the JSON string of the payload
            const payload = { peerId, timestamp };
            const payloadStr = JSON.stringify(payload);
            const isValidSignature = verify(payloadStr, signature, peer.publicKey);
            if (!isValidSignature) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid signature'
                });
            }
            // Check timestamp freshness (allow 5 minute window)
            const now = Date.now();
            const removalTime = new Date(timestamp).getTime();
            const fiveMinutes = 5 * 60 * 1000;
            if (isNaN(removalTime) || Math.abs(now - removalTime) > fiveMinutes) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or stale timestamp'
                });
            }
            // Update peer status to 'removed'
            const removed = removePeer(peer.id);
            if (!removed) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update peer status'
                });
            }
            console.log(`[OGP] Federation removed by ${peer.displayName} (${peer.id})`);
            // BUILD-113: Notify OpenClaw that a peer has removed us
            const notificationText = `[OGP Federation Removed] ${peer.displayName} (${peer.id}) has removed your gateway from their federation\n` +
                `Your gateway is no longer federated with ${peer.displayName}.\n` +
                `You can re-establish federation by sending a new request if needed.`;
            const notificationPayload = {
                text: notificationText,
                sessionKey: 'agent:main:main',
                metadata: {
                    ogp: {
                        type: 'federation_removed',
                        peer: {
                            id: peer.id,
                            displayName: peer.displayName,
                            email: peer.email,
                            gatewayUrl: peer.gatewayUrl
                        },
                        removedAt: new Date().toISOString(),
                        removalType: 'asymmetric'
                    }
                }
            };
            // Fire notification (best effort - no retry needed as removal is already processed)
            try {
                const notified = await notifyOpenClaw(notificationPayload);
                if (notified) {
                    console.log(`[OGP] Agent session notified of federation removal by ${peer.displayName}`);
                }
                else {
                    console.warn(`[OGP] Failed to notify agent session of federation removal by ${peer.displayName} (logged but not retried)`);
                }
            }
            catch (error) {
                console.error(`[OGP] Error notifying agent session of removal:`, error);
                // No retry - removal is already processed, notification is best-effort
            }
            res.json({
                success: true,
                peerId: peer.id,
                status: 'removed'
            });
        }
        catch (error) {
            console.error('[OGP] Error handling removal notification:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });
    // GET /federation/ping - Simple liveness + identity check (no auth required)
    app.get('/federation/ping', (req, res) => {
        res.json({
            pong: true,
            displayName: cfg.displayName,
            gatewayUrl: cfg.gatewayUrl,
            timestamp: new Date().toISOString()
        });
    });
    // POST /federation/message - Receive federated message
    app.post('/federation/message', async (req, res) => {
        try {
            const { message, messageStr, signature } = req.body;
            if (!message || !signature) {
                return res.status(400).json({ error: 'Missing message or signature' });
            }
            const result = await handleMessage(message, signature, messageStr);
            if (result.success) {
                // Return full result including success flag so callers can check response.success
                res.json({ success: true, nonce: result.nonce, response: result.response });
            }
            else {
                res.status(result.statusCode || 400).json({ success: false, error: result.error });
            }
        }
        catch (error) {
            console.error('[OGP] Error handling message:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // GET /federation/reply/:nonce - Poll for reply to a message
    app.get('/federation/reply/:nonce', (req, res) => {
        const { nonce } = req.params;
        const reply = getPendingReply(nonce);
        if (!reply) {
            return res.status(404).json({
                nonce,
                status: 'pending',
                message: 'Reply not yet available'
            });
        }
        // Delete after retrieval
        deletePendingReply(nonce);
        res.json({
            nonce,
            status: 'complete',
            reply: {
                success: reply.success,
                data: reply.data,
                error: reply.error,
                timestamp: reply.timestamp
            }
        });
    });
    // POST /federation/reply/:nonce - Receive reply callback from remote gateway
    app.post('/federation/reply/:nonce', (req, res) => {
        const { nonce } = req.params;
        const body = req.body || {};
        // The reply can come in different formats
        const reply = body.reply || body;
        const replyPayload = {
            nonce,
            success: reply.success ?? true,
            data: reply.data,
            error: reply.error,
            timestamp: reply.timestamp || new Date().toISOString()
        };
        // Store for later retrieval
        storePendingReply(nonce, replyPayload);
        console.log(`[OGP] Received reply callback for nonce ${nonce}`);
        res.json({ received: true });
    });
    server = app.listen(cfg.daemonPort, () => {
        console.log(`[OGP] Daemon listening on port ${cfg.daemonPort}`);
        console.log(`[OGP] Public key: ${getPublicKey()}`);
        // Start cleanup timers
        startDoormanCleanup();
        startReplyCleanup();
        console.log(`[OGP] Started doorman and reply cleanup timers`);
        // Start rendezvous registration (if configured)
        if (cfg.rendezvous?.enabled) {
            startRendezvous(cfg.rendezvous, getPublicKey(), cfg.daemonPort).catch((err) => {
                console.warn(`[OGP] Rendezvous startup error: ${err.message}`);
            });
        }
    });
    // Handle graceful shutdown — deregister from rendezvous
    const gracefulShutdown = async () => {
        await stopRendezvous();
    };
    process.once('SIGTERM', () => { gracefulShutdown().catch(() => { }); });
    process.once('SIGINT', () => { gracefulShutdown().catch(() => { }); });
}
export function stopServer() {
    // Stop cleanup timers
    stopDoormanCleanup();
    stopReplyCleanup();
    // Deregister from rendezvous (fire-and-forget)
    stopRendezvous().catch(() => { });
    const pidFile = getDaemonPidFile();
    // Check for PID file
    if (!fs.existsSync(pidFile)) {
        console.log('OGP daemon is not running');
        return;
    }
    try {
        const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) {
            console.error('Invalid PID in daemon.pid file');
            fs.unlinkSync(pidFile);
            return;
        }
        // Check if process is running
        try {
            process.kill(pid, 0); // Signal 0 checks if process exists
        }
        catch (error) {
            console.log('OGP daemon is not running (stale PID file)');
            fs.unlinkSync(pidFile);
            return;
        }
        // Send SIGTERM
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(pidFile);
        console.log('OGP daemon stopped');
    }
    catch (error) {
        console.error('Failed to stop daemon:', error);
    }
}
export async function getDaemonStatus() {
    const config = loadConfig();
    const port = config?.daemonPort ?? 18790;
    const pidFile = getDaemonPidFile();
    // Check PID file first
    let pidRunning = false;
    let pid;
    if (fs.existsSync(pidFile)) {
        try {
            const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
            const parsedPid = parseInt(pidStr, 10);
            if (!isNaN(parsedPid)) {
                try {
                    process.kill(parsedPid, 0);
                    pidRunning = true;
                    pid = parsedPid;
                }
                catch {
                    fs.unlinkSync(pidFile);
                }
            }
            else {
                fs.unlinkSync(pidFile);
            }
        }
        catch {
            // ignore
        }
    }
    if (pidRunning) {
        return { running: true, pid };
    }
    // PID file absent or stale — check if something is actually listening on the port
    // Use net.createServer to attempt binding; if it fails with EADDRINUSE the port is taken
    try {
        const net = await import('node:net');
        const portInUse = await new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', (err) => {
                resolve(err.code === 'EADDRINUSE');
            });
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port);
        });
        if (portInUse) {
            return { running: true, portDetected: true };
        }
    }
    catch {
        // ignore detection errors
    }
    return { running: false };
}
//# sourceMappingURL=server.js.map