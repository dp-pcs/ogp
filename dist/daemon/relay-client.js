// Daemon-side relay transport client (bd-b7em Phase 2).
//
// Two responsibilities, one module:
//  1. RECEIVER — when this daemon runs transport.mode='relay', hold a persistent
//     outbound WS to the relay so peers can reach us with no inbound port. Inbound
//     `deliver` frames run through handleMessage() (transport-agnostic) and the
//     MessageResponse is sent back as a `response` frame.
//  2. SENDER — deliverViaRelay() ships a signed envelope to a relay-mode peer and
//     awaits their response. Reuses the live receiver socket when on the same relay;
//     otherwise opens a short-lived sender socket just for the response leg.
//
// The relay is UNTRUSTED. E2E Ed25519 is inside the forwarded `frame`; auth only
// proves pubkey ownership for routing. Mirrors the rendezvous heartbeat/reconnect
// shape (src/daemon/rendezvous.ts) and graceful-shutdown contract (server.ts).
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { HEARTBEAT_MS, MAX_FRAME_BYTES, parseFrame, isChallengeFrame, } from '../shared/relay-protocol.js';
const AUTH_TIMEOUT_MS = 10_000;
const PONG_GRACE_MS = 10_000;
const DEFAULT_DELIVER_TIMEOUT_MS = 30_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** A single authenticated relay connection (receiver or sender). */
class RelaySocket {
    relayUrl;
    role;
    pubkey;
    privateKey;
    onDeliver;
    onClosed;
    ws = null;
    pingTimer = null;
    pongTimer = null;
    authed = false;
    pending = new Map();
    constructor(relayUrl, role, pubkey, privateKey, onDeliver, onClosed) {
        this.relayUrl = relayUrl;
        this.role = role;
        this.pubkey = pubkey;
        this.privateKey = privateKey;
        this.onDeliver = onDeliver;
        this.onClosed = onClosed;
    }
    /** Open the socket and complete the Ed25519 challenge handshake. */
    connect() {
        return new Promise((resolve, reject) => {
            let settled = false;
            const ws = new WebSocket(this.relayUrl, { maxPayload: MAX_FRAME_BYTES });
            this.ws = ws;
            const authTimer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    ws.terminate();
                    reject(new Error('relay auth timeout'));
                }
            }, AUTH_TIMEOUT_MS);
            ws.on('message', (data) => {
                const frame = parseFrame(data.toString());
                if (!frame)
                    return;
                // Handshake: answer the server challenge by signing the nonce.
                if (!this.authed && isChallengeFrame(frame)) {
                    void this.sendAuth(frame.challengeId, frame.nonce);
                    return;
                }
                if (!this.authed && frame.type === 'auth-ok') {
                    this.authed = true;
                    clearTimeout(authTimer);
                    this.startHeartbeat();
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                    return;
                }
                if (!this.authed && frame.type === 'auth-err') {
                    clearTimeout(authTimer);
                    ws.terminate();
                    if (!settled) {
                        settled = true;
                        reject(new Error(`relay auth rejected: ${frame.reason}`));
                    }
                    return;
                }
                if (frame.type === 'pong') {
                    this.clearPong();
                    return;
                }
                if (frame.type === 'ping') {
                    this.safeSend({ type: 'pong' });
                    return;
                }
                if (frame.type === 'deliver') {
                    // Inbound delivery for us — hand to the receiver dispatch.
                    if (this.onDeliver)
                        this.onDeliver(frame.reqId, frame.frame);
                    return;
                }
                if (frame.type === 'response') {
                    const p = this.pending.get(frame.reqId);
                    if (p) {
                        clearTimeout(p.timer);
                        this.pending.delete(frame.reqId);
                        p.resolve(frame.result);
                    }
                    return;
                }
                if (frame.type === 'error') {
                    if (frame.reqId) {
                        const p = this.pending.get(frame.reqId);
                        if (p) {
                            clearTimeout(p.timer);
                            this.pending.delete(frame.reqId);
                            p.reject(new Error(`${frame.code}: ${frame.message}`));
                        }
                    }
                    return;
                }
            });
            ws.on('close', () => {
                clearTimeout(authTimer);
                this.teardown();
                if (!settled) {
                    settled = true;
                    reject(new Error('relay socket closed during auth'));
                }
                if (this.onClosed)
                    this.onClosed();
            });
            ws.on('error', (err) => {
                clearTimeout(authTimer);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });
        });
    }
    async sendAuth(challengeId, nonce) {
        const { signCanonical } = await import('../shared/signing.js');
        const payload = { pubkey: this.pubkey, challengeId, nonce, role: this.role };
        const { payloadStr, signature } = signCanonical(payload, this.privateKey);
        this.safeSend({ type: 'auth', pubkey: this.pubkey, challengeId, payloadStr, signature });
    }
    /** Send a deliver request and await the peer's MessageResponse (or error). */
    deliver(toPubkey, frame, timeoutMs) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('relay socket not open'));
                return;
            }
            const reqId = crypto.randomUUID();
            const timer = setTimeout(() => {
                this.pending.delete(reqId);
                reject(new Error('relay deliver timeout'));
            }, timeoutMs);
            this.pending.set(reqId, { resolve, reject, timer });
            this.safeSend({ type: 'deliver', reqId, to: toPubkey, frame });
        });
    }
    /** Send a response frame back to the relay (receiver leg). */
    sendResponse(reqId, result) {
        this.safeSend({ type: 'response', reqId, result });
    }
    startHeartbeat() {
        this.pingTimer = setInterval(() => {
            this.safeSend({ type: 'ping' });
            this.clearPong();
            this.pongTimer = setTimeout(() => {
                // No pong in time — force a reconnect by tearing the socket down.
                this.ws?.terminate();
            }, PONG_GRACE_MS);
        }, HEARTBEAT_MS);
    }
    clearPong() {
        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
    }
    safeSend(obj) {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN)
                this.ws.send(JSON.stringify(obj));
        }
        catch {
            // best effort; close/error handlers drive recovery
        }
    }
    teardown() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        this.clearPong();
        for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error('relay socket closed'));
        }
        this.pending.clear();
    }
    close() {
        this.teardown();
        try {
            this.ws?.close(1000);
        }
        catch { /* ignore */ }
        this.ws = null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Persistent receiver (module singleton, mirrors rendezvous.ts lifecycle)
// ─────────────────────────────────────────────────────────────────────────────
let receiver = null;
let receiverRelayUrl = null;
let reconnectTimer = null;
let backoffMs = BACKOFF_START_MS;
let stopped = false;
let identity = null;
/** Dispatch an inbound delivery through the transport-agnostic message handler. */
async function dispatchInbound(sock, reqId, frame) {
    try {
        const { handleMessage } = await import('./message-handler.js');
        const result = await handleMessage(frame.message, frame.signature, frame.messageStr);
        sock.sendResponse(reqId, result);
    }
    catch (err) {
        sock.sendResponse(reqId, { success: false, nonce: '', error: `relay receive failed: ${err.message}`, statusCode: 500 });
    }
}
/**
 * Start the persistent receiver socket. Call from server.ts startup ONLY when
 * transport.mode === 'relay'. Idempotent; reconnects with backoff on drop.
 */
export async function startRelayClient(relayUrl) {
    const { getPublicKey, getPrivateKey } = await import('./keypair.js');
    identity = { pubkey: getPublicKey(), privateKey: getPrivateKey() };
    stopped = false;
    receiverRelayUrl = relayUrl;
    await connectReceiver();
}
async function connectReceiver() {
    if (stopped || !identity || !receiverRelayUrl)
        return;
    const sock = new RelaySocket(receiverRelayUrl, 'receiver', identity.pubkey, identity.privateKey, (reqId, frame) => { void dispatchInbound(sock, reqId, frame); }, () => scheduleReconnect());
    try {
        await sock.connect();
        receiver = sock;
        backoffMs = BACKOFF_START_MS; // reset after a clean auth
        console.log(`[OGP] Relay receiver connected (${receiverRelayUrl}) as ${identity.pubkey.slice(0, 8)}...`);
    }
    catch (err) {
        console.warn(`[OGP] Relay receiver connect failed: ${err.message}`);
        scheduleReconnect();
    }
}
function scheduleReconnect() {
    if (stopped)
        return;
    if (receiver) {
        receiver = null;
    }
    if (reconnectTimer)
        return; // already scheduled
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectReceiver();
    }, delay);
}
/** Stop the receiver and reject any in-flight work. Returns when torn down. */
export async function stopRelayClient() {
    stopped = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (receiver) {
        receiver.close();
        receiver = null;
    }
    receiverRelayUrl = null;
    backoffMs = BACKOFF_START_MS;
}
// ─────────────────────────────────────────────────────────────────────────────
// Sender leg
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Deliver a signed envelope to a relay-mode peer and await their MessageResponse.
 * Reuses the live receiver socket when it's on the same relay; otherwise opens a
 * short-lived sender socket just for this exchange. Throws on timeout or
 * peer-not-connected (callers map that to a failed-send result).
 */
export async function deliverViaRelay(relayUrl, toPubkey, frame, timeoutMs = DEFAULT_DELIVER_TIMEOUT_MS) {
    // Fast path: piggyback on our persistent receiver if it targets the same relay.
    if (receiver && receiver.ws && receiver.ws.readyState === WebSocket.OPEN && receiverRelayUrl === relayUrl) {
        return receiver.deliver(toPubkey, frame, timeoutMs);
    }
    // Slow path: open a transient sender socket (even a direct-mode daemon needs a
    // live socket to receive the response leg back from the relay).
    const { getPublicKey, getPrivateKey } = await import('./keypair.js');
    const sock = new RelaySocket(relayUrl, 'sender', getPublicKey(), getPrivateKey(), null, null);
    try {
        await sock.connect();
        return await sock.deliver(toPubkey, frame, timeoutMs);
    }
    finally {
        sock.close();
    }
}
//# sourceMappingURL=relay-client.js.map