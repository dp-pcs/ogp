import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { verifyCanonical } from './verify.js';
import { RelayCore } from './relay-core.js';
const app = express();
app.use(express.json());
// SECURITY (F-06): Configure proxy trust explicitly so req.ip reflects the
// real client, and X-Forwarded-For from non-trusted hops is ignored.
// Default: trust 1 hop (typical: cloudflared / ALB / nginx in front of us).
// Override via TRUST_PROXY_HOPS env var (number of hops, or 'false' to use
// the socket address only).
const trustProxyEnv = (process.env.TRUST_PROXY_HOPS ?? '1').trim();
const trustProxySetting = trustProxyEnv === 'false' ? false : (Number.isFinite(Number(trustProxyEnv)) ? Number(trustProxyEnv) : 1);
app.set('trust proxy', trustProxySetting);
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const TTL_MS = 90_000; // 90 seconds
const CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60 seconds
const INVITE_TTL_MS = 600_000; // 10 minutes
/**
 * Validate an optional transport descriptor parsed from an already-signature-
 * verified payload. Returns the normalized descriptor, `undefined` if absent
 * (⇒ direct), or an error string if malformed.
 */
export function validateTransportDescriptor(raw) {
    if (raw === undefined || raw === null)
        return { ok: true }; // absent ⇒ direct
    if (typeof raw !== 'object') {
        return { ok: false, error: 'transport must be an object' };
    }
    const t = raw;
    const mode = t.transport;
    if (mode === 'direct') {
        if (t.gatewayUrl !== undefined && typeof t.gatewayUrl !== 'string') {
            return { ok: false, error: 'transport.gatewayUrl must be a string' };
        }
        return { ok: true, descriptor: { transport: 'direct', ...(typeof t.gatewayUrl === 'string' ? { gatewayUrl: t.gatewayUrl } : {}) } };
    }
    if (mode === 'relay') {
        if (typeof t.relayUrl !== 'string' || !t.relayUrl) {
            return { ok: false, error: 'transport.relayUrl is required for relay mode' };
        }
        return { ok: true, descriptor: { transport: 'relay', relayUrl: t.relayUrl } };
    }
    if (mode === 'iroh') {
        if (typeof t.nodeId !== 'string' || !t.nodeId) {
            return { ok: false, error: 'transport.nodeId is required for iroh mode' };
        }
        if (t.relayUrl !== undefined && typeof t.relayUrl !== 'string') {
            return { ok: false, error: 'transport.relayUrl must be a string' };
        }
        return { ok: true, descriptor: { transport: 'iroh', nodeId: t.nodeId, ...(typeof t.relayUrl === 'string' ? { relayUrl: t.relayUrl } : {}) } };
    }
    return { ok: false, error: `unknown transport mode: ${String(mode)}` };
}
/**
 * Validate an optional transport LIST (bd-maas) from an already-verified payload.
 * Each entry is validated by validateTransportDescriptor. Absent ⇒ undefined.
 * The list rides inside the signed payload, so the rendezvous can't reorder/forge it.
 */
export function validateTransportList(raw) {
    if (raw === undefined || raw === null)
        return { ok: true };
    if (!Array.isArray(raw))
        return { ok: false, error: 'transports must be an array' };
    const out = [];
    for (const entry of raw) {
        const r = validateTransportDescriptor(entry);
        if (!r.ok)
            return { ok: false, error: `transports[]: ${r.error}` };
        if (r.descriptor)
            out.push(r.descriptor);
    }
    return { ok: true, transports: out.length > 0 ? out : undefined };
}
export function validateCard(raw, registrationPubkey) {
    if (raw === undefined || raw === null)
        return { ok: true };
    if (typeof raw !== 'object')
        return { ok: false, error: 'card must be an object' };
    const c = raw;
    if (typeof c.publicKey !== 'string' || !c.publicKey) {
        return { ok: false, error: 'card.publicKey is required' };
    }
    // TRUST: the card identity must match the key that signed the registration.
    if (c.publicKey !== registrationPubkey) {
        return { ok: false, error: 'card.publicKey does not match registration pubkey' };
    }
    const card = { publicKey: c.publicKey };
    if (typeof c.displayName === 'string')
        card.displayName = c.displayName;
    if (typeof c.email === 'string')
        card.email = c.email;
    if (typeof c.gatewayUrl === 'string')
        card.gatewayUrl = c.gatewayUrl;
    if (Array.isArray(c.offeredIntents) && c.offeredIntents.every((x) => typeof x === 'string')) {
        card.offeredIntents = c.offeredIntents;
    }
    return { ok: true, card };
}
const peers = new Map();
const invites = new Map();
/** Generate a random 6-char alphanumeric token */
function generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}
// Periodic cleanup of expired peers and invites
setInterval(() => {
    const now = Date.now();
    let cleanedPeers = 0;
    for (const [key, peer] of peers.entries()) {
        if (now - peer.lastSeen > TTL_MS) {
            peers.delete(key);
            cleanedPeers++;
        }
    }
    if (cleanedPeers > 0) {
        console.log(`[rendezvous] Cleaned up ${cleanedPeers} expired peer(s). Active peers: ${peers.size}`);
    }
    let cleanedInvites = 0;
    for (const [token, invite] of invites.entries()) {
        if (now - invite.createdAt > INVITE_TTL_MS) {
            invites.delete(token);
            cleanedInvites++;
        }
    }
    if (cleanedInvites > 0) {
        console.log(`[rendezvous] Cleaned up ${cleanedInvites} expired invite(s). Active invites: ${invites.size}`);
    }
}, CLEANUP_INTERVAL_MS);
/**
 * SECURITY (F-06): Use req.ip (Express-derived, respects the configured
 * `trust proxy` setting). Previously this hand-parsed X-Forwarded-For with
 * no validation, letting any client spoof their published gateway IP.
 *
 * `req.ip` returns the leftmost untrusted value in X-Forwarded-For if the
 * request came through a configured trusted hop, otherwise the socket
 * address. With trust proxy off it's always the socket.
 */
function getCallerIp(req) {
    return req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
}
export function validateSignedRegistration(body, verifyImpl = verifyCanonical) {
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
    const { pubkey, port, publicUrl } = parsed;
    if (typeof pubkey !== 'string' || !pubkey) {
        return { ok: false, status: 400, error: 'pubkey is required and must be a string' };
    }
    if (typeof port !== 'number' || port < 1 || port > 65535) {
        return { ok: false, status: 400, error: 'port is required and must be a number (1-65535)' };
    }
    const verifyResult = verifyImpl({ payloadStr, signature }, pubkey);
    if (!verifyResult.ok) {
        return { ok: false, status: 401, error: `Signature verification failed: ${verifyResult.reason}` };
    }
    // Transport descriptor/list/card (bd-b7em/bd-maas): parsed ONLY from the now-
    // verified inner payload. Fields outside payloadStr are never read, so the
    // rendezvous can't be tricked into advertising an unsigned transport or card.
    const transportResult = validateTransportDescriptor(parsed.transport);
    if (!transportResult.ok) {
        return { ok: false, status: 400, error: transportResult.error };
    }
    const transportsResult = validateTransportList(parsed.transports);
    if (!transportsResult.ok) {
        return { ok: false, status: 400, error: transportsResult.error };
    }
    const cardResult = validateCard(parsed.card, pubkey);
    if (!cardResult.ok) {
        return { ok: false, status: 400, error: cardResult.error };
    }
    return {
        ok: true,
        pubkey,
        port,
        ...(typeof publicUrl === 'string' && publicUrl ? { publicUrl } : {}),
        ...(transportResult.descriptor ? { transport: transportResult.descriptor } : {}),
        ...(transportsResult.transports ? { transports: transportsResult.transports } : {}),
        ...(cardResult.card ? { card: cardResult.card } : {})
    };
}
// ─────────────────────────────────────────────
// GET / — health check
// ─────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ ok: true, peers: peers.size });
});
// ─────────────────────────────────────────────
// POST /register — register or refresh a peer
// SECURITY (F-02): requires a signed envelope; the signature proves the
// caller holds the private key matching the announced pubkey.
// ─────────────────────────────────────────────
app.post('/register', (req, res) => {
    const validation = validateSignedRegistration(req.body);
    if (!validation.ok) {
        res.status(validation.status).json({ error: validation.error });
        return;
    }
    const { pubkey, port, transport, transports, card } = validation;
    const ip = getCallerIp(req);
    const now = Date.now();
    peers.set(pubkey, {
        pubkey, ip, port, lastSeen: now,
        ...(transport ? { transport } : {}),
        ...(transports ? { transports } : {}),
        ...(card ? { card } : {})
    });
    const transportLabel = transports
        ? transports.map((t) => t.transport).join('+')
        : (transport ? transport.transport : 'direct');
    console.log(`[rendezvous] Registered ${pubkey.slice(0, 8)}... from ${ip}:${port} (transport: ${transportLabel}${card ? ', card' : ''})`);
    res.json({ ok: true, yourIp: ip });
});
// ─────────────────────────────────────────────
// GET /peer/:pubkey — look up a peer
// ─────────────────────────────────────────────
app.get('/peer/:pubkey', (req, res) => {
    const { pubkey } = req.params;
    const peer = peers.get(pubkey);
    if (!peer) {
        res.status(404).json({ error: 'Peer not found' });
        return;
    }
    const age = Date.now() - peer.lastSeen;
    if (age > TTL_MS) {
        peers.delete(pubkey);
        res.status(404).json({ error: 'Peer registration expired' });
        return;
    }
    res.json({
        pubkey: peer.pubkey,
        ip: peer.ip,
        port: peer.port,
        lastSeen: peer.lastSeen,
        ...(peer.transport ? { transport: peer.transport } : {}),
        ...(peer.transports ? { transports: peer.transports } : {}),
        ...(peer.card ? { card: peer.card } : {}),
    });
});
// ─────────────────────────────────────────────
// DELETE /peer/:pubkey — deregister immediately
// ─────────────────────────────────────────────
app.delete('/peer/:pubkey', (req, res) => {
    const { pubkey } = req.params;
    const existed = peers.has(pubkey);
    peers.delete(pubkey);
    if (existed) {
        console.log(`[rendezvous] Deregistered ${pubkey.slice(0, 8)}...`);
        res.json({ ok: true });
    }
    else {
        res.status(404).json({ error: 'Peer not found' });
    }
});
// ─────────────────────────────────────────────
// POST /invite — create a federation invite token
// SECURITY (F-02): requires a signed envelope; same shape as /register.
// ─────────────────────────────────────────────
app.post('/invite', (req, res) => {
    const validation = validateSignedRegistration(req.body);
    if (!validation.ok) {
        res.status(validation.status).json({ error: validation.error });
        return;
    }
    const { pubkey, port } = validation;
    const ip = getCallerIp(req);
    const createdAt = Date.now();
    // Generate a unique token (retry on collision)
    let token;
    let attempts = 0;
    do {
        token = generateToken();
        attempts++;
    } while (invites.has(token) && attempts < 10);
    invites.set(token, { token, pubkey, ip, port, createdAt });
    console.log(`[rendezvous] Invite created: ${token} for ${pubkey.slice(0, 8)}... from ${ip}:${port}`);
    res.json({ ok: true, token, expiresIn: 600 });
});
// ─────────────────────────────────────────────
// GET /invite/:token — look up an invite token
// ─────────────────────────────────────────────
app.get('/invite/:token', (req, res) => {
    const { token } = req.params;
    const invite = invites.get(token);
    if (!invite) {
        res.status(404).json({ error: 'Invite not found or expired' });
        return;
    }
    const age = Date.now() - invite.createdAt;
    if (age > INVITE_TTL_MS) {
        invites.delete(token);
        res.status(404).json({ error: 'Invite not found or expired' });
        return;
    }
    // Does NOT consume the token — allow multiple accepts
    res.json({
        pubkey: invite.pubkey,
        ip: invite.ip,
        port: invite.port,
    });
});
// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
// bd-b7em Phase 2: mount the relay routing core on a WebSocket upgrade at /relay,
// alongside the existing HTTP routes (which are completely untouched — register/
// peer/invite stay byte-identical). The relay is UNTRUSTED: it forwards opaque,
// end-to-end-signed envelopes by recipient pubkey and authenticates sockets with
// the SAME Ed25519 proof (verifyCanonical) used by /register. Single-process
// in-memory routing table — fine for one Fargate task; multi-task scale-out needs
// a shared table (Redis pub/sub), deferred per docs/TRANSPORT-MODES-DESIGN.md.
const relay = new RelayCore({
    verifyCanonical,
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    randomNonce: () => crypto.randomBytes(32).toString('hex'),
    log: (msg) => console.log(`[relay] ${msg}`),
});
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
let nextSocketId = 1;
server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/relay') {
        socket.destroy();
        return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        const id = nextSocketId++;
        const r = {
            id,
            send: (data) => { try {
                ws.send(data);
            }
            catch { /* ignore */ } },
            close: (code) => { try {
                ws.close(code);
            }
            catch { /* ignore */ } },
        };
        relay.onConnection(r);
        ws.on('message', (data) => relay.onMessage(r, data.toString()));
        ws.on('close', () => relay.onClose(r));
        ws.on('error', () => relay.onClose(r));
    });
});
server.listen(PORT, () => {
    console.log(`[rendezvous] OGP Rendezvous Server listening on port ${PORT}`);
    console.log(`[rendezvous] Peer TTL: ${TTL_MS / 1000}s | Invite TTL: ${INVITE_TTL_MS / 1000}s | Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);
    console.log(`[rendezvous] Relay WebSocket endpoint: /relay`);
});
//# sourceMappingURL=index.js.map