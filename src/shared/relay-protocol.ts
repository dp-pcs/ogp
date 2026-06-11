// Relay transport wire protocol (bd-b7em Phase 2).
//
// Frames are JSON text over a WebSocket between a daemon and the relay server.
// The relay is UNTRUSTED: it routes opaque `frame` payloads (the exact body a
// daemon would POST to /federation/message) by recipient pubkey and never
// inspects or forges them. End-to-end Ed25519 lives entirely inside `frame`.
//
// Auth proves pubkey ownership via a server-issued challenge nonce signed with
// signCanonical (src/shared/signing.ts). See docs/TRANSPORT-MODES-DESIGN.md.

/** The opaque, end-to-end-signed unit the relay forwards verbatim. Identical to
 *  the JSON body posted to POST /federation/message in direct mode. */
export interface RelayFrame {
  message: unknown;     // FederationMessage (src/daemon/message-handler.ts)
  messageStr: string;   // exact signed bytes
  signature: string;    // hex Ed25519 over messageStr
}

/** Whether a daemon's socket is a persistent receiver (registered in the relay
 *  routing table) or a transient sender (opened only to await a response leg). */
export type RelayRole = 'receiver' | 'sender';

/** Error codes the relay may return in an `error` frame. */
export type RelayErrorCode =
  | 'peer-not-connected'   // destination has no live receiver socket
  | 'unauthorized'         // auth handshake failed / frame sent before auth-ok
  | 'bad-frame'            // malformed/oversized/unknown frame
  | 'payload-too-large'    // frame exceeded MAX_FRAME_BYTES
  | 'challenge-expired';   // auth arrived after the challenge TTL

/** Max accepted frame size. Envelopes are small; this caps abuse. */
export const MAX_FRAME_BYTES = 256 * 1024;

/** App-level heartbeat period (must stay < ALB 60s idle timeout). */
export const HEARTBEAT_MS = 35_000;

/** How long a server-issued auth challenge stays valid. */
export const CHALLENGE_TTL_MS = 10_000;

// ── Frames ───────────────────────────────────────────────────────────────────

/** (1) S→C, on socket open. */
export interface ChallengeFrame {
  type: 'challenge';
  challengeId: string;
  nonce: string;        // 32-byte hex, anti-replay
  serverTime: string;   // ISO-8601
}

/** (2) C→S. payloadStr/signature = signCanonical({pubkey, challengeId, nonce, role}). */
export interface AuthFrame {
  type: 'auth';
  pubkey: string;       // full hex public key (routing key)
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
  to?: string;          // recipient pubkey (sender→relay)
  from?: string;        // sender pubkey, logging only (relay→recipient)
  frame: RelayFrame;
}

/** (6) C→S / (7) S→C response leg. `result` is the recipient's MessageResponse. */
export interface ResponseFrame {
  type: 'response';
  reqId: string;
  result: unknown;      // MessageResponse (src/daemon/message-handler.ts)
}

/** (8) S→C error. */
export interface ErrorFrame {
  type: 'error';
  reqId?: string;
  code: RelayErrorCode;
  message: string;
}

/** (9) app-level keepalive, either direction. */
export interface PingFrame { type: 'ping'; }
export interface PongFrame { type: 'pong'; }

export type RelayClientFrame = AuthFrame | DeliverFrame | ResponseFrame | PingFrame | PongFrame;
export type RelayServerFrame =
  | ChallengeFrame | AuthOkFrame | AuthErrFrame | DeliverFrame | ResponseFrame | ErrorFrame | PingFrame | PongFrame;
export type RelayAnyFrame = RelayClientFrame | RelayServerFrame;

// ── Parsing / guards ─────────────────────────────────────────────────────────

/** Parse a raw WS text frame into a typed object, or null if not a `{type}` object. */
export function parseFrame(raw: string): RelayAnyFrame | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || typeof (obj as { type?: unknown }).type !== 'string') {
    return null;
  }
  return obj as RelayAnyFrame;
}

export function isChallengeFrame(f: RelayAnyFrame): f is ChallengeFrame {
  return f.type === 'challenge'
    && typeof (f as ChallengeFrame).challengeId === 'string'
    && typeof (f as ChallengeFrame).nonce === 'string';
}

export function isAuthFrame(f: RelayAnyFrame): f is AuthFrame {
  const a = f as AuthFrame;
  return f.type === 'auth'
    && typeof a.pubkey === 'string'
    && typeof a.challengeId === 'string'
    && typeof a.payloadStr === 'string'
    && typeof a.signature === 'string';
}

export function isDeliverFrame(f: RelayAnyFrame): f is DeliverFrame {
  const d = f as DeliverFrame;
  return f.type === 'deliver'
    && typeof d.reqId === 'string'
    && !!d.frame && typeof d.frame === 'object'
    && typeof d.frame.messageStr === 'string'
    && typeof d.frame.signature === 'string';
}

export function isResponseFrame(f: RelayAnyFrame): f is ResponseFrame {
  return f.type === 'response' && typeof (f as ResponseFrame).reqId === 'string';
}

/** The canonical payload a daemon signs to answer an auth challenge. The nonce
 *  is INSIDE the signed bytes so the signature covers it (replay resistance). */
export interface AuthChallengePayload {
  pubkey: string;
  challengeId: string;
  nonce: string;
  role: RelayRole;
}
