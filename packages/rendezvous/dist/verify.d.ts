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
export type VerifyReason = 'missing-signature' | 'missing-payload' | 'missing-timestamp' | 'bad-timestamp' | 'stale-timestamp' | 'bad-signature';
export interface VerifyResult {
    ok: boolean;
    reason?: VerifyReason;
}
export interface VerifyCanonicalInput {
    payload?: unknown;
    payloadStr?: string;
    signature?: string;
}
export declare function verifyCanonical(envelope: VerifyCanonicalInput | null | undefined, publicKeyHex: string, opts?: {
    maxAgeMs?: number;
    now?: number;
}): VerifyResult;
//# sourceMappingURL=verify.d.ts.map