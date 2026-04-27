export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateKeyPair(): KeyPair;
export declare function sign(message: string, privateKeyHex: string): string;
export declare function verify(message: string, signatureHex: string, publicKeyHex: string): boolean;
export declare function signObject(obj: any, privateKeyHex: string): {
    payload: any;
    payloadStr: string;
    signature: string;
};
/**
 * Verify a signed object. If payloadStr is provided (the original JSON string used to sign),
 * use that directly to avoid JSON key-order drift across serialization boundaries.
 */
export declare function verifyObject(payload: any, signature: string, publicKeyHex: string, payloadStr?: string): boolean;
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
    payload: T & {
        timestamp: string;
    };
    payloadStr: string;
    signature: string;
}
export type VerifyReason = 'missing-signature' | 'missing-payload' | 'missing-timestamp' | 'bad-timestamp' | 'stale-timestamp' | 'bad-signature';
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
export declare function signCanonical<T extends object>(payload: T, privateKeyHex: string, opts?: SignCanonicalOptions): SignedEnvelope<T>;
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
export declare function verifyCanonical(envelope: {
    payload?: unknown;
    payloadStr?: string;
    signature?: string;
} | null | undefined, publicKeyHex: string, opts?: {
    maxAgeMs?: number;
    now?: number;
}): VerifyResult;
//# sourceMappingURL=signing.d.ts.map