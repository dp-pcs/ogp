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
import {
  HEARTBEAT_MS,
  MAX_FRAME_BYTES,
  parseFrame,
  isChallengeFrame,
  type RelayFrame,
  type FederationRelayFrame,
  type RelayRole,
  type AuthChallengePayload,
} from '../shared/relay-protocol.js';

const AUTH_TIMEOUT_MS = 10_000;
const PONG_GRACE_MS = 10_000;
const DEFAULT_DELIVER_TIMEOUT_MS = 30_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** A single authenticated relay connection (receiver or sender). */
class RelaySocket {
  ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private authed = false;
  readonly pending = new Map<string, Pending>();

  constructor(
    readonly relayUrl: string,
    readonly role: RelayRole,
    private readonly pubkey: string,
    private readonly privateKey: string,
    private readonly onDeliver: ((reqId: string, frame: RelayFrame) => void) | null,
    private readonly onClosed: (() => void) | null,
    private readonly onFederation: ((op: 'request' | 'approve', reqId: string, frame: FederationRelayFrame) => void) | null = null,
  ) {}

  /** Open the socket and complete the Ed25519 challenge handshake. */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.relayUrl, { maxPayload: MAX_FRAME_BYTES });
      this.ws = ws;

      const authTimer = setTimeout(() => {
        if (!settled) { settled = true; ws.terminate(); reject(new Error('relay auth timeout')); }
      }, AUTH_TIMEOUT_MS);

      ws.on('message', (data) => {
        const frame = parseFrame(data.toString());
        if (!frame) return;

        // Handshake: answer the server challenge by signing the nonce.
        if (!this.authed && isChallengeFrame(frame)) {
          void this.sendAuth(frame.challengeId, frame.nonce);
          return;
        }
        if (!this.authed && frame.type === 'auth-ok') {
          this.authed = true;
          clearTimeout(authTimer);
          this.startHeartbeat();
          if (!settled) { settled = true; resolve(); }
          return;
        }
        if (!this.authed && frame.type === 'auth-err') {
          clearTimeout(authTimer);
          ws.terminate();
          if (!settled) { settled = true; reject(new Error(`relay auth rejected: ${frame.reason}`)); }
          return;
        }

        if (frame.type === 'pong') { this.clearPong(); return; }
        if (frame.type === 'ping') { this.safeSend({ type: 'pong' }); return; }

        if (frame.type === 'deliver') {
          // Inbound delivery for us — hand to the receiver dispatch.
          if (this.onDeliver) this.onDeliver(frame.reqId, frame.frame);
          return;
        }
        if (frame.type === 'federation') {
          // Inbound federation handshake (bd-63bs) — dispatch by op.
          if (this.onFederation) this.onFederation(frame.op, frame.reqId, frame.frame);
          return;
        }
        if (frame.type === 'response') {
          const p = this.pending.get(frame.reqId);
          if (p) { clearTimeout(p.timer); this.pending.delete(frame.reqId); p.resolve(frame.result); }
          return;
        }
        if (frame.type === 'error') {
          if (frame.reqId) {
            const p = this.pending.get(frame.reqId);
            if (p) { clearTimeout(p.timer); this.pending.delete(frame.reqId); p.reject(new Error(`${frame.code}: ${frame.message}`)); }
          }
          return;
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimer);
        this.teardown();
        if (!settled) { settled = true; reject(new Error('relay socket closed during auth')); }
        if (this.onClosed) this.onClosed();
      });
      ws.on('error', (err) => {
        clearTimeout(authTimer);
        if (!settled) { settled = true; reject(err as Error); }
      });
    });
  }

  private async sendAuth(challengeId: string, nonce: string): Promise<void> {
    const { signCanonical } = await import('../shared/signing.js');
    const payload: AuthChallengePayload = { pubkey: this.pubkey, challengeId, nonce, role: this.role };
    const { payloadStr, signature } = signCanonical(payload, this.privateKey);
    this.safeSend({ type: 'auth', pubkey: this.pubkey, challengeId, payloadStr, signature });
  }

  /** Send a deliver request and await the peer's MessageResponse (or error). */
  deliver(toPubkey: string, frame: RelayFrame, timeoutMs: number): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
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

  /** Send a federation handshake frame (request/approve) and await the response. */
  sendFederation(op: 'request' | 'approve', toPubkey: string, frame: FederationRelayFrame, timeoutMs: number): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('relay socket not open'));
        return;
      }
      const reqId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('relay federation timeout'));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      this.safeSend({ type: 'federation', op, reqId, to: toPubkey, frame });
    });
  }

  /** Send a response frame back to the relay (receiver leg). */
  sendResponse(reqId: string, result: unknown): void {
    this.safeSend({ type: 'response', reqId, result });
  }

  private startHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      this.safeSend({ type: 'ping' });
      this.clearPong();
      this.pongTimer = setTimeout(() => {
        // No pong in time — force a reconnect by tearing the socket down.
        this.ws?.terminate();
      }, PONG_GRACE_MS);
    }, HEARTBEAT_MS);
  }

  private clearPong(): void {
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }

  private safeSend(obj: unknown): void {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    } catch {
      // best effort; close/error handlers drive recovery
    }
  }

  private teardown(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.clearPong();
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('relay socket closed')); }
    this.pending.clear();
  }

  close(): void {
    this.teardown();
    try { this.ws?.close(1000); } catch { /* ignore */ }
    this.ws = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent receiver (module singleton, mirrors rendezvous.ts lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

let receiver: RelaySocket | null = null;
let receiverRelayUrl: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = BACKOFF_START_MS;
let stopped = false;
let identity: { pubkey: string; privateKey: string } | null = null;

/** Dispatch an inbound delivery through the transport-agnostic message handler. */
async function dispatchInbound(sock: RelaySocket, reqId: string, frame: RelayFrame): Promise<void> {
  try {
    const { handleMessage } = await import('./message-handler.js');
    const result = await handleMessage(frame.message as never, frame.signature, frame.messageStr);
    sock.sendResponse(reqId, result);
  } catch (err) {
    sock.sendResponse(reqId, { success: false, nonce: '', error: `relay receive failed: ${(err as Error).message}`, statusCode: 500 });
  }
}

/**
 * Dispatch an inbound federation handshake frame (bd-63bs) through the same
 * transport-agnostic cores the HTTP routes use. The relay forwarded a signed
 * { payloadStr, signature } envelope; we run the request/approve core and send the
 * {statusCode, body} back as the response frame. E2E Ed25519 is verified inside
 * the core exactly as on the HTTP path.
 */
async function dispatchFederationInbound(
  sock: RelaySocket,
  op: 'request' | 'approve',
  reqId: string,
  frame: FederationRelayFrame
): Promise<void> {
  try {
    const { requireConfig } = await import('../shared/config.js');
    const { verifyCanonical } = await import('../shared/signing.js');
    const { handleFederationRequestCore, handleFederationApproveCore } = await import('./server.js');
    const deps = {
      cfg: requireConfig(),
      verifyEnvelope: (env: { payloadStr?: string; signature?: string }, pk: string) =>
        verifyCanonical(env as { payloadStr: string; signature: string }, pk)
    };
    const body = { payloadStr: frame.payloadStr, signature: frame.signature };
    const result = op === 'request'
      ? await handleFederationRequestCore(body, deps)
      : await handleFederationApproveCore(body, deps);
    sock.sendResponse(reqId, result);
  } catch (err) {
    sock.sendResponse(reqId, { statusCode: 500, body: { error: `relay federation handler failed: ${(err as Error).message}` } });
  }
}

/**
 * Start the persistent receiver socket. Call from server.ts startup ONLY when
 * transport.mode === 'relay'. Idempotent; reconnects with backoff on drop.
 */
export async function startRelayClient(relayUrl: string): Promise<void> {
  const { getPublicKey, getPrivateKey } = await import('./keypair.js');
  identity = { pubkey: getPublicKey(), privateKey: getPrivateKey() };
  stopped = false;
  receiverRelayUrl = relayUrl;
  await connectReceiver();
}

async function connectReceiver(): Promise<void> {
  if (stopped || !identity || !receiverRelayUrl) return;
  const sock = new RelaySocket(
    receiverRelayUrl, 'receiver', identity.pubkey, identity.privateKey,
    (reqId, frame) => { void dispatchInbound(sock, reqId, frame); },
    () => scheduleReconnect(),
    (op, reqId, frame) => { void dispatchFederationInbound(sock, op, reqId, frame); },
  );
  try {
    await sock.connect();
    receiver = sock;
    backoffMs = BACKOFF_START_MS; // reset after a clean auth
    console.log(`[OGP] Relay receiver connected (${receiverRelayUrl}) as ${identity.pubkey.slice(0, 8)}...`);
  } catch (err) {
    console.warn(`[OGP] Relay receiver connect failed: ${(err as Error).message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (stopped) return;
  if (receiver) { receiver = null; }
  if (reconnectTimer) return; // already scheduled
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectReceiver();
  }, delay);
}

/** Stop the receiver and reject any in-flight work. Returns when torn down. */
export async function stopRelayClient(): Promise<void> {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (receiver) { receiver.close(); receiver = null; }
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
export async function deliverViaRelay(
  relayUrl: string,
  toPubkey: string,
  frame: RelayFrame,
  timeoutMs: number = DEFAULT_DELIVER_TIMEOUT_MS,
): Promise<unknown> {
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
  } finally {
    sock.close();
  }
}

/**
 * Send a signed federation handshake envelope (request or approve) to a relay-mode
 * peer over the relay and await their {statusCode, body} (bd-63bs). Lets two
 * relay-only peers federate with no public HTTP gateway. Reuses the live receiver
 * socket on the same relay; otherwise opens a transient sender socket. Throws on
 * timeout / peer-not-connected (callers map that to a failed handshake).
 */
export async function federationViaRelay(
  relayUrl: string,
  toPubkey: string,
  op: 'request' | 'approve',
  frame: FederationRelayFrame,
  timeoutMs: number = DEFAULT_DELIVER_TIMEOUT_MS,
): Promise<unknown> {
  // Fast path: piggyback on the persistent receiver if it's on the same relay.
  if (receiver && receiver.ws && receiver.ws.readyState === WebSocket.OPEN && receiverRelayUrl === relayUrl) {
    return receiver.sendFederation(op, toPubkey, frame, timeoutMs);
  }

  // Slow path: transient sender socket for this exchange.
  const { getPublicKey, getPrivateKey } = await import('./keypair.js');
  const sock = new RelaySocket(relayUrl, 'sender', getPublicKey(), getPrivateKey(), null, null);
  try {
    await sock.connect();
    return await sock.sendFederation(op, toPubkey, frame, timeoutMs);
  } finally {
    sock.close();
  }
}
