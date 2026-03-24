export interface ProjectContribution {
    id: string;
    timestamp: string;
    authorId: string;
    topic: string;
    summary: string;
    metadata?: Record<string, any>;
}
export interface ProjectTopic {
    name: string;
    description?: string;
    contributions: ProjectContribution[];
    lastUpdated: string;
}
export interface Project {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    members: string[];
    topics: ProjectTopic[];
    metadata?: Record<string, any>;
}
export declare function loadProjects(): Project[];
export declare function saveProjects(projects: Project[]): void;
export declare function createProject(id: string, name: string, description?: string, metadata?: Record<string, any>): Project;
export declare function addProject(project: Project): void;
export declare function getProject(projectId: string): Project | null;
export declare function listProjects(): Project[];
export declare function deleteProject(projectId: string): boolean;
/**
 * Join a project (add peer as member if not already present)
 */
export declare function joinProject(projectId: string, peerId: string): boolean;
/**
 * Leave a project (remove peer from members)
 */
export declare function leaveProject(projectId: string, peerId: string): boolean;
/**
 * Check if a peer is a member of a project
 */
export declare function isProjectMember(projectId: string, peerId: string): boolean;
/**
 * Add or update a topic in a project
 */
export declare function ensureProjectTopic(projectId: string, topicName: string, description?: string): boolean;
/**
 * Add a contribution to a project topic
 */
export declare function contributeToProject(projectId: string, topicName: string, authorId: string, summary: string, metadata?: Record<string, any>): string | null;
/**
 * Get contributions for a specific topic across all projects
 */
export declare function getTopicContributions(projectId: string, topicName: string, limit?: number): ProjectContribution[];
/**
 * Get all contributions from a specific author in a project
 */
export declare function getAuthorContributions(projectId: string, authorId: string, limit?: number): ProjectContribution[];
/**
 * Search contributions by content (simple text search)
 */
export declare function searchContributions(projectId: string, query: string, limit?: number): ProjectContribution[];
/**
 * Get project status summary (topics with recent activity)
 */
export declare function getProjectStatus(projectId: string): {
    project: any;
    topics: Array<{
        name: string;
        description?: string;
        contributionCount: number;
        lastContribution?: any;
        contributors: string[];
    }>;
} | null;
/**
 * Update project metadata
 */
export declare function updateProject(projectId: string, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): boolean;
//# sourceMappingURL=projects.d.ts.map