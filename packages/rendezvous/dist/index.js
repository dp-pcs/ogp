import express from 'express';
const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const TTL_MS = 90_000; // 90 seconds
const CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60 seconds
const peers = new Map();
// Periodic cleanup of expired peers
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, peer] of peers.entries()) {
        if (now - peer.lastSeen > TTL_MS) {
            peers.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[rendezvous] Cleaned up ${cleaned} expired peer(s). Active peers: ${peers.size}`);
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
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[rendezvous] OGP Rendezvous Server listening on port ${PORT}`);
    console.log(`[rendezvous] Peer TTL: ${TTL_MS / 1000}s | Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);
});
//# sourceMappingURL=index.js.map