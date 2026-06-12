import type { ProjectContribution } from './projects.js';
/** One contribution as it appears in a project.query response (bd-2n3 + bd-53c). */
export interface QueriedContribution {
    id: string;
    timestamp: string;
    authorId: string;
    entryType?: string;
    topic?: string;
    summary: string;
    metadata?: Record<string, any>;
    signature?: string;
    payloadStr?: string;
}
/** Outcome tally of a backfill pass against one peer. */
export interface BackfillResult {
    peerId: string;
    projectId: string;
    pulled: number;
    inserted: number;
    duplicate: number;
    rejected: number;
    skipped: number;
    error?: string;
}
/** Minimal shape of a federation `project.query` response we read. */
interface QueryResponse {
    success?: boolean;
    error?: string;
    response?: {
        projectId?: string;
        contributions?: QueriedContribution[];
    };
}
export interface BackfillDeps {
    /** Send a signed `project.query` to the peer; mirrors federationSend's return. */
    query: (peerId: string, projectId: string, limit: number) => Promise<QueryResponse | null>;
    /** Idempotent, signature-verifying merge; mirrors projects.upsertContribution. */
    upsert: (projectId: string, record: ProjectContribution) => 'inserted' | 'duplicate' | 'rejected' | 'not-found';
}
/**
 * Pull `projectId`'s contributions from `peerId` and union-merge them locally.
 * Best-effort: a failed pull returns a result with `error` set and zero merges —
 * it never throws, so callers (on-join / heartbeat) can sweep many peers safely.
 */
export declare function backfillContributionsFromPeer(peerId: string, projectId: string, deps: BackfillDeps, opts?: {
    limit?: number;
}): Promise<BackfillResult>;
export {};
//# sourceMappingURL=contribution-backfill.d.ts.map