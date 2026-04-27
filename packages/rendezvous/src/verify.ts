/**
 * Minimal Ed25519 verify helper for the rendezvous server.
 *
 * Vendored from the main OGP package's `shared/signing.ts` so this workspace
 * stays dependency-free (no @dp-pcs/ogp at runtime). Uses only Node's
 * built-in crypto.
 *
 * Single API: verifyCanonical(envelope, publicKey, opts) → { ok, reason }
 * Mirrors the same shape used by the rest of the federation handshake.
 */

import crypto from 'node:crypto';

export type VerifyReason =
  | 'missing-signature'
  | 'missing-payload'
  | 'missing-timestamp'
  | 'bad-timestamp'
  | 'stale-timestamp'
  | 'bad-signature';

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyReason;
}

export interface VerifyCanonicalInput {
  payload?: unknown;
  payloadStr?: string;
  signature?: string;
}

function verifyEd25519(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const publicKeyDer = Buffer.from(publicKeyHex, 'hex');
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });
    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf-8'), publicKey, signature);
  } catch {
    return false;
  }
}

export function verifyCanonical(
  envelope: VerifyCanonicalInput | null | undefined,
  publicKeyHex: string,
  opts: { maxAgeMs?: number; now?: number } = {}
): VerifyResult {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'missing-payload' };
  }
  const { signature, payload, payloadStr } = envelope;
  if (!signature || typeof signature !== 'string') {
    return { ok: false, reason: 'missing-signature' };
  }

  let message: string;
  let timestamp: unknown;
  if (typeof payloadStr === 'string' && payloadStr.length > 0) {
    message = payloadStr;
    try {
      const parsed = JSON.parse(payloadStr) as { timestamp?: unknown };
      timestamp = parsed?.timestamp;
    } catch {
      return { ok: false, reason: 'bad-timestamp' };
    }
  } else if (payload && typeof payload === 'object') {
    message = JSON.stringify(payload);
    timestamp = (payload as { timestamp?: unknown }).timestamp;
  } else {
    return { ok: false, reason: 'missing-payload' };
  }

  if (typeof timestamp !== 'string' || timestamp.length === 0) {
    return { ok: false, reason: 'missing-timestamp' };
  }
  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs)) {
    return { ok: false, reason: 'bad-timestamp' };
  }
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? 5 * 60 * 1000;
  if (Math.abs(now - tsMs) > maxAgeMs) {
    return { ok: false, reason: 'stale-timestamp' };
  }

  if (!verifyEd25519(message, signature, publicKeyHex)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true };
}
