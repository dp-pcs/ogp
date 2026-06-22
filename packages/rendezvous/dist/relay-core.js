// Relay routing core (bd-b7em Phase 2).
//
// Transport-agnostic, dependency-injected so it can be unit-tested with fake
// sockets and later mounted into the rendezvous server (PR3) by passing that
// workspace's own `verifyCanonical`. Holds NO crypto and NO `ws` import — the
// WebSocket adapter lives in server.ts.
//
// The relay is UNTRUSTED: it routes opaque `frame` payloads by recipient pubkey.
// AUTH only proves pubkey ownership (Ed25519 challenge) for routing; it never
// inspects or forges the end-to-end-signed envelope inside `frame`.
const MAX_FRAME_BYTES = 256 * 1024;
const CHALLENGE_TTL_MS = 10_000;
export class RelayCore {
    deps;
    /** pubkey → live receiver socket. In-process; SINGLE Fargate task for the pilot.
     *  Multi-task scale-out needs a shared table (Redis pub/sub) — deferred. */
    routing = new Map();
    challenges = new Map();
    conns = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    log(msg) { this.deps.log?.(msg); }
    /** Call when a new socket connects. Issues the auth challenge immediately. */
    onConnection(socket) {
        const challengeId = this.deps.randomId();
        const nonce = this.deps.randomNonce();
        this.challenges.set(challengeId, { nonce, socket, createdAt: this.deps.now() });
        this.conns.set(socket.id, { socket, challengeId });
        this.sweepChallenges();
        socket.send(JSON.stringify({
            type: 'challenge', challengeId, nonce, serverTime: new Date(this.deps.now()).toISOString(),
        }));
    }
    /** Call for each text frame received on `socket`. */
    onMessage(socket, raw) {
        if (raw.length > MAX_FRAME_BYTES) {
            socket.send(JSON.stringify({ type: 'error', code: 'payload-too-large', message: 'frame exceeds 256KB' }));
            return;
        }
        let frame;
        try {
            frame = JSON.parse(raw);
        }
        catch {
            socket.send(JSON.stringify({ type: 'error', code: 'bad-frame', message: 'invalid JSON' }));
            return;
        }
        if (!frame || typeof frame.type !== 'string') {
            socket.send(JSON.stringify({ type: 'error', code: 'bad-frame', message: 'missing type' }));
            return;
        }
        const conn = this.conns.get(socket.id);
        switch (frame.type) {
            case 'auth': return this.handleAuth(socket, conn, frame);
            case 'ping': return socket.send(JSON.stringify({ type: 'pong' }));
            case 'pong': return; // keepalive ack
            case 'deliver': return this.handleDeliver(socket, conn, frame);
            case 'federation': return this.handleFederation(socket, conn, frame);
            case 'response': return this.handleResponse(conn, frame);
            default:
                socket.send(JSON.stringify({ type: 'error', code: 'bad-frame', message: `unknown type ${frame.type}` }));
        }
    }
    /** Call when a socket closes. Removes it from routing and cleans state. */
    onClose(socket) {
        const conn = this.conns.get(socket.id);
        if (conn?.pubkey && this.routing.get(conn.pubkey) === socket) {
            this.routing.delete(conn.pubkey);
            this.log(`relay: receiver ${conn.pubkey.slice(0, 8)}… disconnected`);
        }
        if (conn?.challengeId)
            this.challenges.delete(conn.challengeId);
        this.conns.delete(socket.id);
    }
    // ── handlers ────────────────────────────────────────────────────────────────
    handleAuth(socket, conn, frame) {
        const result = this.verifyAuthFrame(frame);
        if (!result.ok) {
            socket.send(JSON.stringify({ type: 'auth-err', reason: result.reason }));
            socket.close(1008);
            return;
        }
        const { pubkey, role, challengeId } = result;
        this.challenges.delete(challengeId);
        if (conn) {
            conn.pubkey = pubkey;
            conn.role = role;
        }
        if (role === 'receiver') {
            // last-writer-wins: drop any prior socket for this pubkey
            const prior = this.routing.get(pubkey);
            if (prior && prior !== socket) {
                try {
                    prior.close(1000);
                }
                catch { /* ignore */ }
            }
            this.routing.set(pubkey, socket);
            this.log(`relay: receiver ${pubkey.slice(0, 8)}… authenticated (routing=${this.routing.size})`);
        }
        // sender role: authenticated but NOT registered (transient response leg only)
        socket.send(JSON.stringify({ type: 'auth-ok', pubkey }));
    }
    /**
     * Pure auth check: validates the auth frame against its stored challenge and
     * the Ed25519 signature over the canonical payload. Exposed for unit tests.
     */
    verifyAuthFrame(frame) {
        const pubkey = frame.pubkey;
        const challengeId = frame.challengeId;
        const payloadStr = frame.payloadStr;
        const signature = frame.signature;
        if (typeof pubkey !== 'string' || typeof challengeId !== 'string'
            || typeof payloadStr !== 'string' || typeof signature !== 'string') {
            return { ok: false, reason: 'malformed-auth' };
        }
        const challenge = this.challenges.get(challengeId);
        if (!challenge)
            return { ok: false, reason: 'challenge-expired' };
        if (this.deps.now() - challenge.createdAt > CHALLENGE_TTL_MS) {
            this.challenges.delete(challengeId);
            return { ok: false, reason: 'challenge-expired' };
        }
        // The signed payload must bind pubkey + challengeId + the server nonce.
        let parsed;
        try {
            parsed = JSON.parse(payloadStr);
        }
        catch {
            return { ok: false, reason: 'bad-payload' };
        }
        if (parsed.pubkey !== pubkey || parsed.challengeId !== challengeId || parsed.nonce !== challenge.nonce) {
            return { ok: false, reason: 'challenge-mismatch' };
        }
        const role = parsed.role === 'sender' ? 'sender' : 'receiver';
        const v = this.deps.verifyCanonical({ payloadStr, signature }, pubkey);
        if (!v.ok)
            return { ok: false, reason: v.reason ?? 'bad-signature' };
        return { ok: true, pubkey, role, challengeId };
    }
    handleDeliver(socket, conn, frame) {
        if (!conn?.pubkey) {
            socket.send(JSON.stringify({ type: 'error', reqId: frame.reqId, code: 'unauthorized', message: 'auth required' }));
            return;
        }
        const reqId = frame.reqId;
        const to = frame.to;
        if (typeof reqId !== 'string' || typeof to !== 'string' || !frame.frame) {
            socket.send(JSON.stringify({ type: 'error', reqId: typeof reqId === 'string' ? reqId : undefined, code: 'bad-frame', message: 'malformed deliver' }));
            return;
        }
        this.routeDeliver(conn.pubkey, reqId, to, frame.frame, socket);
    }
    /**
     * Route a deliver from `fromPubkey` to `to`'s live receiver socket, tagging it
     * so the response leg can be returned. Errors back to `replyTo` if `to` is not
     * connected. Exposed for unit tests.
     */
    routeDeliver(fromPubkey, reqId, to, innerFrame, replyTo) {
        const dest = this.routing.get(to);
        if (!dest) {
            replyTo.send(JSON.stringify({ type: 'error', reqId, code: 'peer-not-connected', message: `peer ${to.slice(0, 8)}… not connected` }));
            return;
        }
        // Remember which socket to return the response to, keyed by reqId on the dest.
        this.responseRoute.set(reqId, { replyTo, expiresAt: this.deps.now() + 60_000 });
        dest.send(JSON.stringify({ type: 'deliver', reqId, from: fromPubkey, frame: innerFrame }));
    }
    /**
     * Federation handshake over relay (bd-63bs). Same untrusted forward-by-pubkey +
     * reqId↔response path as deliver, but the forwarded frame keeps its `op` so the
     * receiver routes it to the request vs approve handler. The relay never inspects
     * `frame` (the signed handshake envelope). Exposed for unit tests.
     */
    handleFederation(socket, conn, frame) {
        if (!conn?.pubkey) {
            socket.send(JSON.stringify({ type: 'error', reqId: frame.reqId, code: 'unauthorized', message: 'auth required' }));
            return;
        }
        const reqId = frame.reqId;
        const to = frame.to;
        const op = frame.op;
        if (typeof reqId !== 'string' || typeof to !== 'string' || !frame.frame
            || (op !== 'request' && op !== 'approve')) {
            socket.send(JSON.stringify({ type: 'error', reqId: typeof reqId === 'string' ? reqId : undefined, code: 'bad-frame', message: 'malformed federation' }));
            return;
        }
        this.routeFederation(conn.pubkey, op, reqId, to, frame.frame, socket);
    }
    /** Route a federation frame to `to`'s receiver, preserving `op`. Exposed for tests. */
    routeFederation(fromPubkey, op, reqId, to, innerFrame, replyTo) {
        const dest = this.routing.get(to);
        if (!dest) {
            replyTo.send(JSON.stringify({ type: 'error', reqId, code: 'peer-not-connected', message: `peer ${to.slice(0, 8)}… not connected` }));
            return;
        }
        this.responseRoute.set(reqId, { replyTo, expiresAt: this.deps.now() + 60_000 });
        dest.send(JSON.stringify({ type: 'federation', op, reqId, from: fromPubkey, frame: innerFrame }));
    }
    responseRoute = new Map();
    handleResponse(conn, frame) {
        if (!conn?.pubkey)
            return; // only authed receivers answer
        const reqId = frame.reqId;
        if (typeof reqId !== 'string')
            return;
        const route = this.responseRoute.get(reqId);
        this.responseRoute.delete(reqId);
        if (!route)
            return; // sender gone / expired — drop
        route.replyTo.send(JSON.stringify({ type: 'response', reqId, result: frame.result }));
    }
    sweepChallenges() {
        const cutoff = this.deps.now() - CHALLENGE_TTL_MS;
        for (const [id, c] of this.challenges) {
            if (c.createdAt < cutoff)
                this.challenges.delete(id);
        }
        // also expire stale response routes
        const now = this.deps.now();
        for (const [id, r] of this.responseRoute) {
            if (r.expiresAt < now)
                this.responseRoute.delete(id);
        }
    }
}
//# sourceMappingURL=relay-core.js.map