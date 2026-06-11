/** The opaque, end-to-end-signed unit the relay forwards verbatim. Identical to
 *  the JSON body posted to POST /federation/message in direct mode. */
export interface RelayFrame {
    message: unknown;
    messageStr: string;
    signature: string;
}
/** Whether a daemon's socket is a persistent receiver (registered in the relay
 *  routing table) or a transient sender (opened only to await a response leg). */
export type RelayRole = 'receiver' | 'sender';
/** Error codes the relay may return in an `error` frame. */
export type RelayErrorCode = 'peer-not-connected' | 'unauthorized' | 'bad-frame' | 'payload-too-large' | 'challenge-expired';
/** Max accepted frame size. Envelopes are small; this caps abuse. */
export declare const MAX_FRAME_BYTES: number;
/** App-level heartbeat period (must stay < ALB 60s idle timeout). */
export declare const HEARTBEAT_MS = 35000;
/** How long a server-issued auth challenge stays valid. */
export declare const CHALLENGE_TTL_MS = 10000;
/** (1) S→C, on socket open. */
export interface ChallengeFrame {
    type: 'challenge';
    challengeId: string;
    nonce: string;
    serverTime: string;
}
/** (2) C→S. payloadStr/signature = signCanonical({pubkey, challengeId, nonce, role}). */
export interface AuthFrame {
    type: 'auth';
    pubkey: string;
    challengeId: string;
    payloadStr: string;
    signature: string;
}
/** (3) S→C success. */
export interface AuthOkFrame {
    type: 'auth-ok';
    pubkey: string;
}
/** (3) S→C failure (socket closes after). */
export interface AuthErrFrame {
    type: 'auth-err';
    reason: string;
}
/** (4) C→S deliver request / (5) S→C forwarded deliver.
 *  `to` is set by the sender; `from` is added by the relay for logging only
 *  (never trusted — the signed `frame` is the trust unit). */
export interface DeliverFrame {
    type: 'deliver';
    reqId: string;
    to?: string;
    from?: string;
    frame: RelayFrame;
}
/** (6) C→S / (7) S→C response leg. `result` is the recipient's MessageResponse. */
export interface ResponseFrame {
    type: 'response';
    reqId: string;
    result: unknown;
}
/** (8) S→C error. */
export interface ErrorFrame {
    type: 'error';
    reqId?: string;
    code: RelayErrorCode;
    message: string;
}
/** (9) app-level keepalive, either direction. */
export interface PingFrame {
    type: 'ping';
}
export interface PongFrame {
    type: 'pong';
}
export type RelayClientFrame = AuthFrame | DeliverFrame | ResponseFrame | PingFrame | PongFrame;
export type RelayServerFrame = ChallengeFrame | AuthOkFrame | AuthErrFrame | DeliverFrame | ResponseFrame | ErrorFrame | PingFrame | PongFrame;
export type RelayAnyFrame = RelayClientFrame | RelayServerFrame;
/** Parse a raw WS text frame into a typed object, or null if not a `{type}` object. */
export declare function parseFrame(raw: string): RelayAnyFrame | null;
export declare function isChallengeFrame(f: RelayAnyFrame): f is ChallengeFrame;
export declare function isAuthFrame(f: RelayAnyFrame): f is AuthFrame;
export declare function isDeliverFrame(f: RelayAnyFrame): f is DeliverFrame;
export declare function isResponseFrame(f: RelayAnyFrame): f is ResponseFrame;
/** The canonical payload a daemon signs to answer an auth challenge. The nonce
 *  is INSIDE the signed bytes so the signature covers it (replay resistance). */
export interface AuthChallengePayload {
    pubkey: string;
    challengeId: string;
    nonce: string;
    role: RelayRole;
}
//# sourceMappingURL=relay-protocol.d.ts.map