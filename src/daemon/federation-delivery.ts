/**
 * Federation message delivery primitives (bd-8rd.3).
 *
 * Lives in the daemon layer so the CLI and the daemon outbox retry scheduler can
 * share the same transport-resolution and delivery logic without circular
 * imports between src/cli and src/daemon.
 */
import { lookupPeerTransports, type ResolvedTransport } from './rendezvous.js';
import { deliverViaRelay } from './relay-client.js';
import type { Peer } from './peers.js';
import type { OGPConfig } from '../shared/config.js';

/** Deliver `frame` to `peer.gatewayUrl` over direct HTTP. Byte-identical to the
 * original send. Throws only on network/abort (caller maps that to try-next). */
export async function deliverDirect(
  peer: Peer,
  frame: { message: unknown; messageStr: string; signature: string },
  timeoutMs?: number
): Promise<{ ok: boolean; status?: number; result: any }> {
  const controller = new AbortController();
  const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${peer.gatewayUrl}/federation/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: frame.message,
        messageStr: frame.messageStr,  // raw signed string for exact verification
        signature: frame.signature
      }),
      signal: controller.signal
    });
    if (timeoutId) clearTimeout(timeoutId);
    let result: any = null;
    try { result = await response.json(); } catch { result = null; }
    return { ok: response.ok, status: response.status, result };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Deliver `frame` to a peer over a relay WebSocket. Throws on relay/connection
 * failure (caller maps that to a synthesized failure). */
export async function deliverRelay(
  relayUrl: string,
  toPubkey: string,
  frame: { message: unknown; messageStr: string; signature: string },
  timeoutMs?: number
): Promise<{ ok: boolean; status?: number; result: any }> {
  const result = await deliverViaRelay(relayUrl, toPubkey, frame, timeoutMs);
  const r = result as { success?: boolean; statusCode?: number };
  return { ok: r?.success !== false, status: r?.statusCode, result };
}

export interface DeliverOptions {
  timeoutMs?: number;
  config: OGPConfig;
}

export async function deliverFederationMessage(
  peer: Peer,
  frame: { message: unknown; messageStr: string; signature: string },
  opts: DeliverOptions
): Promise<{ ok: boolean; status?: number; result: any }> {
  // bd-maas: resolve the peer's advertised transport LIST and walk it by
  // preference, using the first transport that delivers. Any rendezvous failure
  // (disabled, lookup throws, empty list) ⇒ a single direct attempt, so the
  // default path can never be broken by a flaky rendezvous.
  let transports: ResolvedTransport[] = [];
  if (opts.config.rendezvous?.enabled && peer.publicKey) {
    try {
      transports = await lookupPeerTransports(opts.config.rendezvous, peer.publicKey);
    } catch {
      transports = []; // fall through to direct
    }
  }

  // No advertised list ⇒ exactly the original single direct send (byte-identical).
  if (transports.length === 0) {
    return deliverDirect(peer, frame, opts.timeoutMs);
  }

  // Walk the preference order; the first transport that delivers wins. A failed
  // attempt (throw, or a relay error) falls through to the next entry; the last
  // failure is returned so callers' existing error handling still fires.
  let last: { ok: boolean; status?: number; result: any } | null = null;
  for (const t of transports) {
    try {
      if (t.mode === 'relay') {
        last = await deliverRelay(t.relayUrl, peer.publicKey as string, frame, opts.timeoutMs);
      } else if (t.mode === 'direct') {
        // Prefer the advertised direct url, else the peer record's gatewayUrl.
        const target = t.url ? { ...peer, gatewayUrl: t.url } : peer;
        last = await deliverDirect(target, frame, opts.timeoutMs);
      } else {
        continue; // iroh not deliverable yet (Phase 3) — skip this leg
      }
      if (last.ok) return last;
      // Non-ok response (e.g. peer-not-connected via relay) ⇒ try the next leg.
    } catch (err) {
      last = {
        ok: false,
        result: { success: false, error: `${t.mode} delivery failed: ${(err as Error).message}` }
      };
    }
  }

  return last ?? deliverDirect(peer, frame, opts.timeoutMs);
}
