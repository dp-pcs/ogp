import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const OGP_VERSION = _require('../../package.json').version;
import { requireConfig, loadConfig, getConfigDir, synthesizePersonas } from '../shared/config.js';
import { getPublicKey } from './keypair.js';
import { addPeer, createPendingPeerRecord, derivePeerIdFromPublicKey, findBestPeerForApproval, getPeer, getPeerByUrl, listPeers, removePeer, replacePeersByIdentity, updatePeer } from './peers.js';
import { listProjectsForPeer } from './projects.js';
import { handleMessage } from './message-handler.js';
import { verify } from '../shared/signing.js';
import { notifyOpenClaw } from './notify.js';
import { startDoormanCleanup, stopDoormanCleanup } from './doorman.js';
import { startReplyCleanup, stopReplyCleanup, getPendingReply, deletePendingReply, storePendingReply } from './reply-handler.js';
import { startRendezvous, stopRendezvous } from './rendezvous.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';
import { connectBridge, disconnectBridge } from './openclaw-bridge.js';
import { loadIntents } from './intent-registry.js';
let server = null;
let shutdownInProgress = false;
export function verifySignedPeerIdHeader(headers, publicKey, verifyImpl, opts = {}) {
    const { peerId, timestamp, signature } = headers;
    if (!peerId || !timestamp || !signature || !publicKey)
        return false;
    const tsMs = Date.parse(timestamp);
    if (Number.isNaN(tsMs))
        return false;
    const now = opts.now ?? Date.now();
    const maxAgeMs = opts.maxAgeMs ?? 5 * 60 * 1000;
    if (Math.abs(now - tsMs) > maxAgeMs)
        return false;
    const message = JSON.stringify({ peerId, timestamp });
    return verifyImpl(message, signature, publicKey);
}
export function validateSignedRequest(body, deps) {
    const { payloadStr, signature } = (body || {});
    if (typeof payloadStr !== 'string' || !payloadStr || typeof signature !== 'string' || !signature) {
        return { ok: false, status: 400, error: 'Missing payloadStr or signature' };
    }
    let parsed;
    try {
        parsed = JSON.parse(payloadStr);
    }
    catch {
        return { ok: false, status: 400, error: 'payloadStr is not valid JSON' };
    }
    const peer = parsed?.peer;
    if (!peer || typeof peer !== 'object' || typeof peer.publicKey !== 'string' || !peer.publicKey) {
        return { ok: false, status: 400, error: 'Missing peer.publicKey in payload' };
    }
    // Verify against the publicKey announced in the body — this is what proves
    // possession of the corresponding private key.
    const verifyResult = deps.verifyEnvelope({ payloadStr, signature }, peer.publicKey);
    if (!verifyResult.ok) {
        return { ok: false, status: 401, error: `Signature verification failed: ${verifyResult.reason}` };
    }
    // Coerce optional identity fields to empty strings so downstream code (which
    // expects required strings on the Peer record) doesn't have to defensively
    // re-handle undefineds. The signature has already authenticated whatever
    // was in the payload, so empty defaults are safe.
    parsed.peer = {
        displayName: typeof peer.displayName === 'string' ? peer.displayName : '',
        email: typeof peer.email === 'string' ? peer.email : '',
        gatewayUrl: typeof peer.gatewayUrl === 'string' ? peer.gatewayUrl : '',
        publicKey: peer.publicKey,
        ...(typeof peer.humanName === 'string' ? { humanName: peer.humanName } : {}),
        ...(typeof peer.agentName === 'string' ? { agentName: peer.agentName } : {}),
        ...(typeof peer.organization === 'string' ? { organization: peer.organization } : {})
    };
    return { ok: true, parsed };
}
export function validateSignedApproval(body, storedPublicKey, deps) {
    const { payloadStr, signature } = (body || {});
    if (typeof payloadStr !== 'string' || !payloadStr || typeof signature !== 'string' || !signature) {
        return { ok: false, status: 400, error: 'Missing payloadStr or signature' };
    }
    let parsed;
    try {
        parsed = JSON.parse(payloadStr);
    }
    catch {
        return { ok: false, status: 400, error: 'payloadStr is not valid JSON' };
    }
    const verifyResult = deps.verifyEnvelope({ payloadStr, signature }, storedPublicKey);
    if (!verifyResult.ok) {
        return { ok: false, status: 401, error: `Signature verification failed: ${verifyResult.reason}` };
    }
    if (parsed.fromPublicKey && parsed.fromPublicKey !== storedPublicKey) {
        return {
            ok: false,
            status: 403,
            error: 'fromPublicKey does not match stored peer publicKey'
        };
    }
    return { ok: true, parsed };
}
/**
 * Build the `/.well-known/ogp` response body. Pure function, exported for tests
 * and potential reuse from non-Express transports.
 *
 * v0.7.0 (B0032) additions:
 *  - `multi-agent-personas` capability flag (always advertised)
 *  - `agents[]` array (synthesized via `synthesizePersonas` for legacy configs;
 *    populated verbatim when explicitly configured via `OGPConfig.agents`)
 */
export function buildWellKnownResponse(args) {
    const { cfg, intentNames, publicKey, peerStatus } = args;
    return {
        version: OGP_VERSION,
        displayName: cfg.displayName,
        email: cfg.email,
        gatewayUrl: cfg.gatewayUrl,
        publicKey,
        capabilities: {
            intents: intentNames,
            features: ['scope-negotiation', 'reply-callback', 'bidirectional-health', 'multi-agent-personas']
        },
        endpoints: {
            request: `${cfg.gatewayUrl}/federation/request`,
            approve: `${cfg.gatewayUrl}/federation/approve`,
            message: `${cfg.gatewayUrl}/federation/message`,
            reply: `${cfg.gatewayUrl}/federation/reply/:nonce`
        },
        agents: synthesizePersonas(cfg),
        ...(peerStatus ? { peerStatus } : {})
    };
}
export function createGracefulShutdownHandler(deps) {
    return async (signal) => {
        if (shutdownInProgress) {
            return;
        }
        shutdownInProgress = true;
        deps.disconnectBridge();
        deps.stopDoormanCleanup();
        deps.stopReplyCleanup();
        deps.stopHeartbeat();
        await deps.stopRendezvous().catch(() => { });
        const activeServer = deps.getServer();
        if (!activeServer) {
            deps.exit(0);
            return;
        }
        const forceExitTimer = deps.setTimer(() => {
            deps.exit(1);
        }, 5000);
        forceExitTimer.unref?.();
        activeServer.close((error) => {
            deps.clearTimer(forceExitTimer);
            if (error) {
                deps.logError(`[OGP] Error during ${signal} shutdown:`, error);
                deps.exit(1);
                return;
            }
            deps.exit(0);
        });
    };
}
export function resetGracefulShutdownStateForTests() {
    shutdownInProgress = false;
}
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
    shutdownInProgress = false;
    const cfg = config || requireConfig();
    // If background mode requested, fork and exit parent
    if (background) {
        const logStream = fs.openSync(getDaemonLogFile(), 'a');
        const child = spawn(process.execPath, [process.argv[1], 'start'], {
            detached: true,
            stdio: ['ignore', logStream, logStream],
            env: { ...process.env }
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
    app.get('/.well-known/ogp', async (req, res) => {
        // Get supported intents from registry
        const intents = loadIntents();
        const intentNames = intents.map(i => i.name);
        // Issue #5 + SECURITY (F-12): bidirectional health status exchange.
        // If the requester identifies themselves via X-OGP-Peer-ID, the header
        // must also carry X-OGP-Signature + X-OGP-Timestamp, signing
        // {peerId, timestamp} with the requester's private key. Without that
        // proof, anyone could enumerate the federation graph and probe the
        // health of other peers by spoofing the header. We omit `peerStatus`
        // on any failure so the discovery endpoint stays unauthenticated.
        let peerStatus;
        const requesterIdRaw = req.header('x-ogp-peer-id');
        const requesterTimestampRaw = req.header('x-ogp-timestamp');
        const requesterSignatureRaw = req.header('x-ogp-signature');
        if (requesterIdRaw && requesterTimestampRaw && requesterSignatureRaw) {
            const peerId = String(requesterIdRaw).trim();
            const timestamp = String(requesterTimestampRaw).trim();
            const signature = String(requesterSignatureRaw).trim();
            const requester = getPeer(peerId);
            if (requester && requester.status === 'approved' && requester.publicKey) {
                const { verify } = await import('../shared/signing.js');
                if (verifySignedPeerIdHeader({ peerId, timestamp, signature }, requester.publicKey, verify)) {
                    peerStatus = {
                        peerId: requester.id,
                        healthy: requester.healthy !== false,
                        healthState: requester.healthState ?? null,
                        lastCheckedAt: requester.lastOutboundCheckAt ?? null,
                        lastCheckFailedAt: requester.lastOutboundCheckFailedAt ?? null,
                        healthCheckFailures: requester.healthCheckFailures ?? 0
                    };
                }
            }
        }
        res.json(buildWellKnownResponse({
            cfg,
            intentNames,
            publicKey: getPublicKey(),
            peerStatus
        }));
    });
    // POST /federation/request - Incoming federation request
    app.post('/federation/request', async (req, res) => {
        try {
            // SECURITY (F-04): Body must be a signed canonical envelope:
            //   { payloadStr: "<JSON>", signature: "<hex>" }
            // payloadStr contains { peer: {...}, offeredIntents?: [...], timestamp }.
            // We verify against peer.publicKey from the body — that proves the
            // caller possesses the private key for the publicKey they announce.
            const { verifyCanonical } = await import('../shared/signing.js');
            const validation = validateSignedRequest(req.body, {
                verifyEnvelope: (env, pk) => verifyCanonical(env, pk)
            });
            if (!validation.ok) {
                if (validation.status === 401) {
                    console.error(`[OGP] Federation request rejected: ${validation.error}`);
                }
                return res.status(validation.status).json({ error: validation.error });
            }
            const peer = validation.parsed.peer;
            const offeredIntents = validation.parsed.offeredIntents;
            // Derive peer ID from public key (BUILD-111: port-agnostic identity)
            // NEVER trust sender's peer.id - always use public key prefix
            // Use 32-char prefix to avoid collision on shared Ed25519 DER header (first 24 chars identical for ALL Ed25519 keys)
            const peerIdFromKey = derivePeerIdFromPublicKey(peer.publicKey);
            // Check for gateway URL collision (same URL, different keys = resync scenario)
            const existingByUrl = getPeerByUrl(peer.gatewayUrl);
            let resyncSnapshot;
            if (existingByUrl && existingByUrl.publicKey !== peer.publicKey) {
                // Different keys for same gateway URL - create snapshot for later resync offer
                const oldProjects = listProjectsForPeer(existingByUrl.id);
                const now = new Date().toISOString();
                const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
                resyncSnapshot = {
                    oldPeerId: existingByUrl.id,
                    oldPublicKey: existingByUrl.publicKey,
                    oldAlias: existingByUrl.alias,
                    oldGrantedScopes: existingByUrl.grantedScopes,
                    oldReceivedScopes: existingByUrl.receivedScopes,
                    oldProjects: oldProjects.map(p => p.id),
                    oldResponsePolicy: existingByUrl.responsePolicy,
                    replacedAt: now,
                    expiresAt
                };
                console.log(`[OGP] Gateway URL collision detected: ${peer.gatewayUrl}`);
                console.log(`[OGP] Old peer ID: ${existingByUrl.id} (${existingByUrl.status})`);
                console.log(`[OGP] New peer ID: ${peerIdFromKey} (pending)`);
                console.log(`[OGP] Created resync snapshot - will offer to restore config after approval`);
                // Remove the old peer to avoid duplicates
                removePeer(existingByUrl.id);
            }
            // Check if peer already exists (by public key)
            const existingPeer = getPeer(peerIdFromKey);
            if (existingPeer) {
                // Allow re-federation if previously removed or rejected
                if (existingPeer.status !== 'removed' && existingPeer.status !== 'rejected') {
                    return res.status(200).json({
                        received: true,
                        status: 'already-pending-or-approved',
                        peerId: peerIdFromKey
                    });
                }
            }
            // Store offered intents (BUILD-110: intent negotiation) — extracted from
            // signed payloadStr above, so we know they were authored by the peer.
            const peerData = createPendingPeerRecord({
                id: peerIdFromKey, // Always use derived ID, never sender's
                displayName: peer.displayName,
                email: peer.email,
                gatewayUrl: peer.gatewayUrl,
                publicKey: peer.publicKey,
                // Enhanced identity fields (backward compatible)
                humanName: peer.humanName,
                agentName: peer.agentName,
                organization: peer.organization,
                offeredIntents,
                // BUILD-115: Record which agent owns this federation relationship
                agentId: cfg.agentId
            });
            // Attach resync snapshot if we're replacing an existing peer with different keys
            if (resyncSnapshot) {
                peerData.resyncSnapshot = resyncSnapshot;
            }
            if (offeredIntents && offeredIntents.length > 0) {
                console.log(`[OGP] Peer ${peer.displayName} offers intents: ${offeredIntents.join(', ')}`);
            }
            addPeer(peerData);
            if (existingPeer && (existingPeer.status === 'removed' || existingPeer.status === 'rejected')) {
                console.log(`[OGP] Re-federation request from ${peer.displayName} (${peerIdFromKey}) — reset from ${existingPeer.status} to pending with fresh peer state`);
            }
            else {
                console.log(`[OGP] Peer ${peer.displayName} (${peerIdFromKey}) added to peers.json`);
            }
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
                peerId: peerData.id,
                peerDisplayName: peerData.displayName,
                intent: 'federation-request',
                topic: 'federation',
                messageClass: 'approval-request',
                metadata: {
                    ogp: {
                        type: 'federation_request',
                        peer: {
                            id: peerData.id,
                            displayName: peer.displayName,
                            email: peer.email,
                            gatewayUrl: peer.gatewayUrl
                        },
                        requestedAt: peerData.requestedAt,
                        federationType: 'bidirectional',
                        offeredIntents: peerData.offeredIntents || ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'],
                        approvalCommand: `ogp federation approve ${peerData.id}`
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
    // POST /federation/update-identity - Peer sends updated identity information
    app.post('/federation/update-identity', async (req, res) => {
        try {
            const { identity, signature } = req.body;
            if (!identity || !signature) {
                return res.status(400).json({ error: 'Missing identity or signature' });
            }
            // Verify signature
            const { verify } = await import('../shared/signing.js');
            const isValid = verify(JSON.stringify(identity), signature, identity.publicKey);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
            // Derive peer ID from public key
            const peerIdFromKey = derivePeerIdFromPublicKey(identity.publicKey);
            // Find existing peer
            const existingPeer = getPeer(peerIdFromKey);
            if (!existingPeer) {
                return res.status(404).json({ error: 'Peer not found - no existing federation' });
            }
            if (existingPeer.status !== 'approved') {
                return res.status(403).json({ error: 'Cannot update identity - peer is not approved' });
            }
            // Update peer identity fields
            existingPeer.displayName = identity.displayName;
            existingPeer.humanName = identity.humanName;
            existingPeer.agentName = identity.agentName;
            existingPeer.organization = identity.organization;
            existingPeer.email = identity.email;
            updatePeer(peerIdFromKey, existingPeer);
            console.log(`[OGP] Updated identity for peer ${identity.displayName} (${peerIdFromKey})`);
            if (identity.humanName || identity.agentName) {
                console.log(`[OGP]   Human: ${identity.humanName || '-'}, Agent: ${identity.agentName || '-'}, Org: ${identity.organization || '-'}`);
            }
            res.json({
                updated: true,
                message: 'Identity updated successfully'
            });
        }
        catch (error) {
            console.error('[OGP] Error handling identity update:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // POST /federation/approve - Peer approves our request
    // SECURITY (F-01): Body must be a signed canonical envelope:
    //   { payloadStr: "<JSON>", signature: "<hex>" }
    // where payloadStr is the JSON of:
    //   { fromGatewayId, fromGatewayUrl, fromDisplayName, fromPublicKey,
    //     fromEmail, peerId?, scopeGrants?, protocolVersion?, timestamp }
    // Verification is against the *stored* pending peer's publicKey, not
    // body.fromPublicKey. fromPublicKey may not differ from the stored value;
    // this prevents a third party from racing the legitimate peer to "approve"
    // and replacing the publicKey of a pending federation.
    app.post('/federation/approve', async (req, res) => {
        try {
            const body = req.body || {};
            const { payloadStr, signature } = body;
            // Pre-validation peer lookup uses unverified hints from payloadStr to find
            // the pending record. Signature verification then authenticates against
            // peer.publicKey (the stored value), so even if payloadStr claims a
            // different publicKey, the unsigned hints can only narrow the search —
            // they cannot grant approval.
            let peerHints = {};
            if (typeof payloadStr === 'string') {
                try {
                    const preview = JSON.parse(payloadStr);
                    peerHints = {
                        fromGatewayUrl: preview.fromGatewayUrl,
                        fromPublicKey: preview.fromPublicKey,
                        peerId: preview.peerId,
                        fromGatewayId: preview.fromGatewayId
                    };
                }
                catch { /* validation will reject below */ }
            }
            const peerIdFromKey = peerHints.fromPublicKey
                ? derivePeerIdFromPublicKey(peerHints.fromPublicKey)
                : (peerHints.peerId || peerHints.fromGatewayId);
            const peer = findBestPeerForApproval({
                peerId: peerIdFromKey,
                gatewayUrl: peerHints.fromGatewayUrl,
                publicKey: peerHints.fromPublicKey
            });
            if (!peer) {
                return res.status(404).json({ error: 'No pending peer found' });
            }
            // SECURITY (F-01): Verify against peer.publicKey (the stored value),
            // and reject any attempt to overwrite that publicKey via fromPublicKey.
            const { verifyCanonical } = await import('../shared/signing.js');
            const validation = validateSignedApproval(body, peer.publicKey, {
                verifyEnvelope: (env, pk) => verifyCanonical(env, pk)
            });
            if (!validation.ok) {
                if (validation.status === 401 || validation.status === 403) {
                    console.error(`[OGP] Approval rejected for peer ${peer.id}: ${validation.error}`);
                }
                return res.status(validation.status).json({ error: validation.error });
            }
            const parsed = validation.parsed;
            const fromGatewayUrl = parsed.fromGatewayUrl;
            const fromDisplayName = parsed.fromDisplayName;
            const fromPublicKey = parsed.fromPublicKey;
            const fromEmail = parsed.fromEmail;
            const scopeGrants = parsed.scopeGrants;
            const protocolVersion = parsed.protocolVersion || (scopeGrants ? '0.2.0' : '0.1.0');
            // Update peer info if fork sent richer data
            const peerUpdates = {};
            if (fromDisplayName)
                peerUpdates.displayName = fromDisplayName;
            if (fromGatewayUrl)
                peerUpdates.gatewayUrl = fromGatewayUrl;
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
            const approvedAt = new Date().toISOString();
            const approvedPeer = {
                ...peer,
                ...peerUpdates,
                id: fromPublicKey ? derivePeerIdFromPublicKey(fromPublicKey) : peer.id,
                status: 'approved',
                approvedAt
            };
            const persisted = replacePeersByIdentity({
                peerId: peer.id,
                gatewayUrl: fromGatewayUrl || peer.gatewayUrl,
                publicKey: fromPublicKey || peer.publicKey
            }, approvedPeer);
            if (!persisted) {
                return res.status(500).json({ error: 'Failed to persist approved peer state' });
            }
            console.log(`[OGP] Federation approved by ${approvedPeer.displayName} (wire protocol: v${protocolVersion})`);
            const approvalNotificationText = `[OGP Federation Approved] ${approvedPeer.displayName} (${approvedPeer.id}) approved your federation request\n` +
                `Gateway: ${approvedPeer.gatewayUrl}\n` +
                `Status: Federation is now active.`;
            const approvalNotificationPayload = {
                text: approvalNotificationText,
                sessionKey: 'agent:main:main',
                peerId: approvedPeer.id,
                peerDisplayName: approvedPeer.displayName,
                intent: 'status-update',
                topic: 'federation',
                messageClass: 'status-update',
                metadata: {
                    ogp: {
                        type: 'federation_approved',
                        peer: {
                            id: approvedPeer.id,
                            displayName: approvedPeer.displayName,
                            email: approvedPeer.email,
                            gatewayUrl: approvedPeer.gatewayUrl
                        },
                        approvedAt,
                        protocolVersion,
                        scopeGrantsReceived: Boolean(scopeGrants)
                    }
                }
            };
            try {
                const notified = await notifyOpenClaw(approvalNotificationPayload);
                if (notified) {
                    console.log(`[OGP] Agent session proactively notified of federation approval by ${approvedPeer.displayName}`);
                }
                else {
                    console.warn(`[OGP] Failed to proactively notify agent session of federation approval by ${approvedPeer.displayName}`);
                }
            }
            catch (error) {
                console.error(`[OGP] Error notifying agent session of approval:`, error);
            }
            // BUILD-99/100: Auto-grant default scopes back to the approving peer if they have none yet
            // This ensures bidirectional scope negotiation happens in a single handshake
            const { updatePeerGrantedScopes } = await import('./peers.js');
            const { createScopeBundle, createScopeGrant, DEFAULT_RATE_LIMIT } = await import('./scopes.js');
            const { getPrivateKey: _getPrivateKey } = await import('./keypair.js');
            const { signObject: _signObject } = await import('../shared/signing.js');
            const freshPeer = getPeer(approvedPeer.id);
            if (freshPeer && !freshPeer.grantedScopes) {
                const defaultIntents = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
                const scopes = defaultIntents.map(intent => createScopeGrant(intent, { rateLimit: DEFAULT_RATE_LIMIT }));
                const bundle = createScopeBundle(scopes);
                updatePeerGrantedScopes(approvedPeer.id, bundle);
                console.log(`[OGP] Auto-granted default scopes to ${approvedPeer.displayName}: ${defaultIntents.join(', ')}`);
                // Send our grants back to the approving peer (signed envelope per F-01)
                try {
                    const ourConfig = requireConfig();
                    const keypair = (await import('./keypair.js')).loadOrGenerateKeyPair();
                    const { signCanonical } = await import('../shared/signing.js');
                    const { payloadStr: gpayloadStr, signature: gsignature } = signCanonical({
                        fromGatewayId: `${new URL(ourConfig.gatewayUrl).hostname}:${ourConfig.daemonPort}`,
                        fromDisplayName: ourConfig.displayName,
                        fromGatewayUrl: ourConfig.gatewayUrl,
                        fromPublicKey: keypair.publicKey,
                        fromEmail: ourConfig.email,
                        protocolVersion: '0.2.0',
                        scopeGrants: bundle
                    }, keypair.privateKey);
                    await fetch(`${freshPeer.gatewayUrl}/federation/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payloadStr: gpayloadStr, signature: gsignature })
                    });
                    console.log(`[OGP] Sent auto-grant confirmation back to ${approvedPeer.displayName}`);
                }
                catch (e) {
                    console.warn(`[OGP] Could not send auto-grant back to ${approvedPeer.displayName}:`, e);
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
                peerId: peer.id,
                peerDisplayName: peer.displayName,
                intent: 'status-update',
                topic: 'federation',
                messageClass: 'status-update',
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
                res.status(result.statusCode || 400).json({
                    success: false,
                    error: result.error,
                    statusCode: result.statusCode || 400,
                    ...(result.retryAfter !== undefined ? { retryAfter: result.retryAfter } : {}),
                    ...(result.response !== undefined ? { response: result.response } : {})
                });
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
    // SECURITY (F-05): Verify the reply is signed by SOME approved peer. We
    // iterate approved peers and accept the first whose publicKey verifies the
    // signature. This is acceptable because:
    //   - Only approved peers can produce a valid signature.
    //   - The nonce is a random UUID known only to the peer we sent it to
    //     (other approved peers don't see it in normal federation traffic).
    // We don't pin the nonce to a specific peer because the CLI process (which
    // generates the nonce) and the daemon process (which receives the reply)
    // don't share memory; a per-nonce tracker would need disk-backed IPC and
    // the additional hardening it buys is not worth the complexity here.
    app.post('/federation/reply/:nonce', async (req, res) => {
        const { nonce } = req.params;
        const body = req.body || {};
        const reply = body.reply;
        const replyStr = body.replyStr;
        const signature = body.signature;
        if (!reply || typeof signature !== 'string' || !signature) {
            return res.status(400).json({ error: 'Missing reply or signature' });
        }
        const { verifyObject } = await import('../shared/signing.js');
        const approvedPeers = listPeers('approved');
        let signingPeer = null;
        for (const candidate of approvedPeers) {
            if (!candidate.publicKey)
                continue;
            if (verifyObject(reply, signature, candidate.publicKey, typeof replyStr === 'string' ? replyStr : undefined)) {
                signingPeer = candidate;
                break;
            }
        }
        if (!signingPeer) {
            console.error(`[OGP] Reply signature verification failed for nonce ${nonce} — no approved peer matched`);
            return res.status(401).json({ error: 'Invalid signature' });
        }
        const replyPayload = {
            nonce,
            success: reply.success ?? true,
            data: reply.data,
            error: reply.error,
            timestamp: reply.timestamp || new Date().toISOString()
        };
        storePendingReply(nonce, replyPayload);
        console.log(`[OGP] Received signed reply for nonce ${nonce} from peer ${signingPeer.id}`);
        res.json({ received: true });
    });
    server = app.listen(cfg.daemonPort, () => {
        console.log(`[OGP] Daemon listening on port ${cfg.daemonPort}`);
        console.log(`[OGP] Public key: ${getPublicKey()}`);
        // Start cleanup timers
        startDoormanCleanup();
        startReplyCleanup();
        startHeartbeat();
        console.log(`[OGP] Started doorman and reply cleanup timers`);
        console.log(`[OGP] Started peer heartbeat monitoring`);
        // Start OpenClaw WebSocket bridge (if using OpenClaw platform)
        if (cfg.platform === 'openclaw' || !cfg.platform) {
            connectBridge();
        }
        // Start rendezvous registration (if configured)
        if (cfg.rendezvous?.enabled) {
            startRendezvous(cfg.rendezvous, getPublicKey(), cfg.daemonPort).catch((err) => {
                console.warn(`[OGP] Rendezvous startup error: ${err.message}`);
            });
        }
    });
    // Handle graceful shutdown — deregister from rendezvous, stop timers, and
    // close the HTTP listener so the daemon actually exits.
    const gracefulShutdown = createGracefulShutdownHandler({
        disconnectBridge,
        stopDoormanCleanup,
        stopReplyCleanup,
        stopRendezvous,
        stopHeartbeat,
        getServer: () => server,
        exit: (code) => process.exit(code),
        setTimer: setTimeout,
        clearTimer: clearTimeout,
        logError: console.error
    });
    process.once('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(() => process.exit(1)); });
    process.once('SIGINT', () => { gracefulShutdown('SIGINT').catch(() => process.exit(1)); });
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