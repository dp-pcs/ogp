import express from 'express';
const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const TTL_MS = 90_000; // 90 seconds
const CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60 seconds
const INVITE_TTL_MS = 600_000; // 10 minutes
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
 * Extract caller IP from request.
 * Respects x-forwarded-for (set by ALB/proxies).
 */
function getCallerIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        // x-forwarded-for can be a comma-separated list; take the first (original client)
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return first.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
}
// ─────────────────────────────────────────────
// GET / — health check
// ─────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({ ok: true, peers: peers.size });
});
// ─────────────────────────────────────────────
// POST /register — register or refresh a peer
// ─────────────────────────────────────────────
app.post('/register', (req, res) => {
    const { pubkey, port, timestamp } = req.body;
    if (typeof pubkey !== 'string' || !pubkey) {
        res.status(400).json({ error: 'pubkey is required and must be a string' });
        return;
    }
    if (typeof port !== 'number' || port < 1 || port > 65535) {
        res.status(400).json({ error: 'port is required and must be a number (1-65535)' });
        return;
    }
    if (typeof timestamp !== 'number') {
        res.status(400).json({ error: 'timestamp is required and must be a number' });
        return;
    }
    const ip = getCallerIp(req);
    const now = Date.now();
    peers.set(pubkey, { pubkey, ip, port, lastSeen: now });
    console.log(`[rendezvous] Registered ${pubkey.slice(0, 8)}... from ${ip}:${port}`);
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
// ─────────────────────────────────────────────
app.post('/invite', (req, res) => {
    const { pubkey, port } = req.body;
    if (typeof pubkey !== 'string' || !pubkey) {
        res.status(400).json({ error: 'pubkey is required and must be a string' });
        return;
    }
    if (typeof port !== 'number' || port < 1 || port > 65535) {
        res.status(400).json({ error: 'port is required and must be a number (1-65535)' });
        return;
    }
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
app.listen(PORT, () => {
    console.log(`[rendezvous] OGP Rendezvous Server listening on port ${PORT}`);
    console.log(`[rendezvous] Peer TTL: ${TTL_MS / 1000}s | Invite TTL: ${INVITE_TTL_MS / 1000}s | Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);
});
//# sourceMappingURL=index.js.map