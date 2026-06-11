// Relay transport wire protocol (bd-b7em Phase 2).
//
// Frames are JSON text over a WebSocket between a daemon and the relay server.
// The relay is UNTRUSTED: it routes opaque `frame` payloads (the exact body a
// daemon would POST to /federation/message) by recipient pubkey and never
// inspects or forges them. End-to-end Ed25519 lives entirely inside `frame`.
//
// Auth proves pubkey ownership via a server-issued challenge nonce signed with
// signCanonical (src/shared/signing.ts). See docs/TRANSPORT-MODES-DESIGN.md.
/** Max accepted frame size. Envelopes are small; this caps abuse. */
export const MAX_FRAME_BYTES = 256 * 1024;
/** App-level heartbeat period (must stay < ALB 60s idle timeout). */
export const HEARTBEAT_MS = 35_000;
/** How long a server-issued auth challenge stays valid. */
export const CHALLENGE_TTL_MS = 10_000;
// ── Parsing / guards ─────────────────────────────────────────────────────────
/** Parse a raw WS text frame into a typed object, or null if not a `{type}` object. */
export function parseFrame(raw) {
    let obj;
    try {
        obj = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') {
        return null;
    }
    return obj;
}
export function isChallengeFrame(f) {
    return f.type === 'challenge'
        && typeof f.challengeId === 'string'
        && typeof f.nonce === 'string';
}
export function isAuthFrame(f) {
    const a = f;
    return f.type === 'auth'
        && typeof a.pubkey === 'string'
        && typeof a.challengeId === 'string'
        && typeof a.payloadStr === 'string'
        && typeof a.signature === 'string';
}
export function isDeliverFrame(f) {
    const d = f;
    return f.type === 'deliver'
        && typeof d.reqId === 'string'
        && !!d.frame && typeof d.frame === 'object'
        && typeof d.frame.messageStr === 'string'
        && typeof d.frame.signature === 'string';
}
export function isResponseFrame(f) {
    return f.type === 'response' && typeof f.reqId === 'string';
}
//# sourceMappingURL=relay-protocol.js.map