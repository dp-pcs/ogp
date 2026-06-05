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