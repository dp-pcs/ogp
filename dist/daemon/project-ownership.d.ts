declare function canonicalPeerId(key: string): string;
export interface ProjectCreation {
    projectId: string;
    creatorKey: string;
    createdAt: string;
    provenance: 'original' | 'legacy-claim';
    signature: string;
    payloadStr: string;
}
export interface OwnerGrant {
    id: string;
    projectId: string;
    grantee: string;
    grantedBy: string;
    grantedAt: string;
    signature: string;
    payloadStr: string;
}
export interface BuildCreationParams {
    projectId: string;
    creatorKey: string;
    provenance: 'original' | 'legacy-claim';
}
export interface BuildGrantParams {
    projectId: string;
    grantee: string;
    grantedBy: string;
}
export declare function buildSignedCreation(params: BuildCreationParams, privateKeyHex: string): ProjectCreation;
export declare function verifySignedCreation(c: ProjectCreation | undefined | null): {
    ok: boolean;
    reason?: string;
};
export declare function buildSignedGrant(params: BuildGrantParams, privateKeyHex: string): OwnerGrant;
export declare function verifySignedGrant(g: OwnerGrant | undefined | null): {
    ok: boolean;
    reason?: string;
};
/**
 * Derive the canonical-32 owner-id set by fixpoint. Seed = {creator}; repeatedly
 * admit any grant whose signature verifies AND whose grantedBy is already an owner,
 * until no change. Forged/orphan grants are never admitted. Order-independent.
 * Only grants matching creation.projectId are considered.
 */
export declare function deriveOwners(creation: ProjectCreation | undefined | null, grants: OwnerGrant[]): Set<string>;
export { canonicalPeerId as _ownershipCanonicalPeerId };
//# sourceMappingURL=project-ownership.d.ts.map