import crypto from 'node:crypto';

export interface KeyPair {
  publicKey: string;  // hex-encoded
  privateKey: string; // hex-encoded
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  return {
    publicKey: publicKey.toString('hex'),
    privateKey: privateKey.toString('hex')
  };
}

export function sign(message: string, privateKeyHex: string): string {
  const privateKeyDer = Buffer.from(privateKeyHex, 'hex');
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKey);
  return signature.toString('hex');
}

export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const publicKeyDer = Buffer.from(publicKeyHex, 'hex');
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });

    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf-8'), publicKey, signature);
  } catch (error) {
    return false;
  }
}

export function signObject(obj: any, privateKeyHex: string): { payload: any; payloadStr: string; signature: string } {
  const payloadStr = JSON.stringify(obj);
  const signature = sign(payloadStr, privateKeyHex);
  return { payload: obj, payloadStr, signature };
}

/**
 * Verify a signed object. If payloadStr is provided (the original JSON string used to sign),
 * use that directly to avoid JSON key-order drift across serialization boundaries.
 */
export function verifyObject(payload: any, signature: string, publicKeyHex: string, payloadStr?: string): boolean {
  const message = payloadStr ?? JSON.stringify(payload);
  return verify(message, signature, publicKeyHex);
}

/**
 * Canonical signed envelope used for federation handshake endpoints.
 * The payload always carries a `timestamp` (ISO-8601). Receivers verify
 * the signature against `payloadStr` (the exact bytes that were signed)
 * AND check the timestamp falls within `maxAgeMs` of now.
 *
 * This is the single source of truth for handshake authentication —
 * `/federation/request`, `/federation/approve`, `/federation/reply/:nonce`
 * (POST), and the `X-OGP-Peer-ID` proof on `/.well-known/ogp` all use it.
 */
export interface SignedEnvelope<T> {
  payload: T & { timestamp: string };
  payloadStr: string;
  signature: string;
}

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

export interface SignCanonicalOptions {
  /** Override the timestamp instead of using new Date().toISOString(). For tests. */
  timestamp?: string;
}

/**
 * Sign a canonical envelope. Adds `timestamp` if absent, returns the exact
 * JSON bytes that were signed alongside the signature.
 */
export function signCanonical<T extends object>(
  payload: T,
  privateKeyHex: string,
  opts: SignCanonicalOptions = {}
): SignedEnvelope<T> {
  const timestamp =
    opts.timestamp ??
    (typeof (payload as { timestamp?: unknown }).timestamp === 'string'
      ? ((payload as { timestamp: string }).timestamp)
      : new Date().toISOString());
  const stamped = { ...(payload as object), timestamp } as T & { timestamp: string };
  const payloadStr = JSON.stringify(stamped);
  const signature = sign(payloadStr, privateKeyHex);
  return { payload: stamped, payloadStr, signature };
}

/**
 * Verify a canonical envelope. Returns a structured `{ok, reason}` so each
 * route can map specific failures to the right HTTP status (401 for
 * bad-signature, 401 for stale-timestamp, 400 for missing fields).
 *
 * If both `payload` and `payloadStr` are present, `payloadStr` is the
 * canonical truth — the timestamp is parsed from those bytes, not from
 * the convenience `payload` object, so a sender cannot disagree with their
 * own signed bytes.
 */
export function verifyCanonical(
  envelope: { payload?: unknown; payloadStr?: string; signature?: string } | null | undefined,
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

  if (!verify(message, signature, publicKeyHex)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true };
}
