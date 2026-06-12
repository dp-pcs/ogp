import { type BackfillDeps, type BackfillResult } from '../daemon/contribution-backfill.js';
/**
 * bd-53c: BackfillDeps wired to the real federation transport + local store. The
 * `query` leg sends a signed `project.query` and shapes federationSend's result into
 * the helper's QueryResponse; `upsert` is the idempotent, signature-verifying merge.
 * Factored out so both on-join (CLI) and the periodic heartbeat pass reuse it.
 */
export declare function liveBackfillDeps(): BackfillDeps;
/**
 * Pull + union-merge contributions for `projectId` from every OTHER project member
 * that is an approved peer (bd-53c). Best-effort — offline / non-member peers are
 * logged and skipped, never fatal. Returns the per-peer results for the caller to
 * summarize. Shared by on-join and the periodic heartbeat pass.
 */
export declare function backfillProjectFromMembers(projectId: string, selfId: string, deps?: BackfillDeps, opts?: {
    limit?: number;
}): Promise<BackfillResult[]>;
interface ProjectJoinOptions {
    description?: string;
    create?: boolean;
}
interface ProjectContributeOptions {
    metadata?: string;
    localOnly?: boolean;
    toAgent?: string;
}
interface ProjectQueryOptions {
    entryType?: string;
    topic?: string;
    author?: string;
    limit?: number;
    search?: string;
    timeout?: number;
    json?: boolean;
}
/**
 * bd-2n3: structured shape for `ogp project query-peer --json`.
 *
 * Consumers (e.g. bd-53c's idempotent union-merge) dedupe by the stable
 * contribution `id`, so it MUST be on the wire. Timestamps are emitted as
 * ISO 8601 — the human display used a localized `toLocaleString()` which is
 * lossy and locale-dependent.
 */
export interface PeerQueryContributionJson {
    id: string;
    projectId: string;
    authorId: string;
    entryType?: string;
    topic?: string;
    summary: string;
    timestamp: string;
    metadata?: Record<string, any>;
}
/**
 * Pure projection of peer-query response contributions into the structured
 * wire shape. Exported for tests (bd-2n3) and reuse by the `--json` path.
 */
export declare function buildPeerQueryJson(projectId: string, contributions: any[]): PeerQueryContributionJson[];
/**
 * Create a new project locally
 */
export declare function projectCreate(projectId: string, projectName: string, options?: {
    description?: string;
}): Promise<void>;
/**
 * Join an existing project (local or request federation)
 */
export declare function projectJoin(projectId: string, projectName?: string, options?: ProjectJoinOptions): Promise<void>;
/**
 * List all projects
 */
export declare function projectRemove(projectId: string): Promise<void>;
export declare function projectList(): Promise<void>;
/**
 * Contribute to a project entry type
 */
export declare function projectContribute(projectId: string, entryType: string, summary: string, options?: ProjectContributeOptions): Promise<void>;
/**
 * Query project contributions
 */
export declare function projectQuery(projectId: string, options?: ProjectQueryOptions): Promise<void>;
/**
 * Get project status overview
 */
export declare function projectStatus(projectId: string): Promise<void>;
/**
 * Request to join a project from a peer
 */
export declare function projectRequestJoin(peerId: string, projectId: string, projectName: string, options?: {
    description?: string;
}): Promise<void>;
/**
 * Send a project contribution to peers
 */
export declare function projectSendContribution(peerId: string, projectId: string, entryType: string, summary: string, options?: ProjectContributeOptions): Promise<void>;
/**
 * Query a peer's project contributions
 */
export declare function projectQueryPeer(peerId: string, projectId: string, options?: Omit<ProjectQueryOptions, 'search'>): Promise<void>;
/**
 * Request project status from a peer
 */
export declare function projectStatusPeer(peerId: string, projectId: string): Promise<void>;
/**
 * bd-hy3o: Grant ownership of a project to a peer key (owners only).
 */
export declare function projectAddOwner(projectId: string, granteeKey: string): Promise<void>;
/**
 * bd-hy3o: Claim ownership of a pre-existing project (members only).
 */
export declare function projectClaimOwnership(projectId: string): Promise<void>;
/**
 * bd-hy3o: List the owners of a project.
 */
export declare function projectOwners(projectId: string): void;
export {};
//# sourceMappingURL=project.d.ts.map