interface ProjectJoinOptions {
    description?: string;
    create?: boolean;
}
interface ProjectContributeOptions {
    metadata?: string;
    localOnly?: boolean;
}
interface ProjectQueryOptions {
    topic?: string;
    author?: string;
    limit?: number;
    search?: string;
    timeout?: number;
}
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
 * Contribute to a project topic
 */
export declare function projectContribute(projectId: string, topic: string, summary: string, options?: ProjectContributeOptions): Promise<void>;
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
export declare function projectSendContribution(peerId: string, projectId: string, topic: string, summary: string, options?: ProjectContributeOptions): Promise<void>;
/**
 * Query a peer's project contributions
 */
export declare function projectQueryPeer(peerId: string, projectId: string, options?: Omit<ProjectQueryOptions, 'search'>): Promise<void>;
/**
 * Request project status from a peer
 */
export declare function projectStatusPeer(peerId: string, projectId: string): Promise<void>;
export {};
//# sourceMappingURL=project.d.ts.map