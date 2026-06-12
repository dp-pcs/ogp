import type { ProjectContribution, AuthorIdentity } from './projects.js';
/** The exact field set covered by an author's signature. */
export interface CanonicalContribution {
    id: string;
    projectId: string;
    authorId: string;
    entryType: string;
    summary: string;
    metadata?: Record<string, any>;
    timestamp: string;
}
/** Signed envelope that crosses the wire inside the project.contribute payload. */
export interface SignedContributionWire {
    id: string;
    authorId: string;
    timestamp: string;
    payloadStr: string;
    signature: string;
}
/**
 * Reconstruct the EXACT canonical bytes an author signed for a stored contribution
 * record. `signCanonical` serializes `{ ...canonical, timestamp }` via JSON.stringify
 * (buildSignedContribution: id, projectId, authorId, entryType, summary, [metadata]);
 * signCanonical appends `timestamp` last. This MUST match that order/shape byte-for-
 * byte or the signature won't verify — a single shared helper used by the signer-side
 * upsert AND the query responder (bd-53c) eliminates drift. Guarded by a round-trip
 * test (the emitted payloadStr re-verifies against the stored signature).
 */
export declare function canonicalPayloadStr(record: Pick<ProjectContribution, 'id' | 'authorId' | 'entryType' | 'topic' | 'summary' | 'metadata' | 'timestamp'>, projectId: string): string;
export interface BuildParams {
    projectId: string;
    authorId: string;
    entryType: string;
    summary: string;
    metadata?: Record<string, any>;
    authorIdentity?: AuthorIdentity;
}
export interface VerifyOutcome {
    ok: boolean;
    reason?: string;
    record?: ProjectContribution;
}
/**
 * Author side: mint a ULID, sign the canonical contribution, and return both the
 * storable record (verified:true) and the wire envelope to send.
 */
export declare function buildSignedContribution(params: BuildParams, privateKeyHex: string): {
    record: ProjectContribution;
    wire: SignedContributionWire;
};
/**
 * Receiver side: verify a wire envelope. The stored record is derived from the
 * SIGNED bytes (payloadStr), never from unsigned siblings. When expectedSenderId
 * is provided (the live project.contribute path), the canonical authorId must
 * equal the federation-authenticated sender — relay is rejected here (Story B's
 * upsert handles relayed records separately).
 */
export declare function verifySignedContribution(wire: SignedContributionWire | undefined | null, expectedSenderId?: string, expectedProjectId?: string): VerifyOutcome;
//# sourceMappingURL=contribution-signing.d.ts.map