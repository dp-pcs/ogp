import fs from 'node:fs';
import path from 'node:path';
import {
  getConfigDir,
  ensureConfigDir
} from '../shared/config.js';

export interface ProjectContribution {
  id: string;           // unique contribution ID
  timestamp: string;    // ISO timestamp
  authorId: string;     // peer ID who contributed
  entryType?: string;   // preferred contribution category name
  topic?: string;       // legacy alias for entryType
  summary: string;      // human-readable summary
  metadata?: Record<string, any>; // additional structured data
}

export interface ProjectTopic {
  name: string;         // topic identifier (e.g., "property-data", "architecture")
  description?: string; // optional description of this topic area
  contributions: ProjectContribution[];
  lastUpdated: string;  // ISO timestamp of last contribution
}

export interface Project {
  id: string;           // unique project ID (e.g., "instacrew-collab")
  name: string;         // human-readable name
  description?: string; // optional project description
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp of last activity
  members: string[];    // peer IDs who are participants
  topics: ProjectTopic[]; // organized knowledge areas
  metadata?: Record<string, any>; // extensible metadata
}

export function getContributionEntryType(contribution: Partial<ProjectContribution> | null | undefined): string {
  return contribution?.entryType || contribution?.topic || 'unknown';
}

function getProjectsFile(): string {
  return path.join(getConfigDir(), 'projects.json');
}

export function loadProjects(): Project[] {
  ensureConfigDir();
  const projectsFile = getProjectsFile();
  if (!fs.existsSync(projectsFile)) {
    return [];
  }
  const data = fs.readFileSync(projectsFile, 'utf-8');
  return JSON.parse(data) as Project[];
}

export function saveProjects(projects: Project[]): void {
  ensureConfigDir();
  fs.writeFileSync(getProjectsFile(), JSON.stringify(projects, null, 2), 'utf-8');
}

export function createProject(
  id: string,
  name: string,
  description?: string,
  metadata?: Record<string, any>
): Project {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    members: [], // starts empty, members join via project.join intent
    topics: [],
    metadata
  };
}

export function addProject(project: Project): void {
  const projects = loadProjects();
  const existing = projects.findIndex(p => p.id === project.id);
  if (existing >= 0) {
    projects[existing] = { ...project, updatedAt: new Date().toISOString() };
  } else {
    projects.push(project);
  }
  saveProjects(projects);
}

export function getProject(projectId: string): Project | null {
  const projects = loadProjects();
  return projects.find(p => p.id === projectId) || null;
}

export function listProjects(): Project[] {
  return loadProjects();
}

export function listProjectsForPeer(peerId: string, projects: Project[] = loadProjects()): Project[] {
  return projects.filter(project => project.members.includes(peerId));
}

export function deleteProject(projectId: string): boolean {
  const projects = loadProjects();
  const index = projects.findIndex(p => p.id === projectId);
  if (index === -1) return false;

  projects.splice(index, 1);
  saveProjects(projects);
  return true;
}

/**
 * Join a project (add peer as member if not already present)
 */
export function joinProject(projectId: string, peerId: string): boolean {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  if (!project.members.includes(peerId)) {
    project.members.push(peerId);
    project.updatedAt = new Date().toISOString();
    saveProjects(projects);
  }
  return true;
}

/**
 * Leave a project (remove peer from members)
 */
export function leaveProject(projectId: string, peerId: string): boolean {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  const memberIndex = project.members.indexOf(peerId);
  if (memberIndex >= 0) {
    project.members.splice(memberIndex, 1);
    project.updatedAt = new Date().toISOString();
    saveProjects(projects);
  }
  return true;
}

/**
 * Check if a peer is a member of a project
 */
export function isProjectMember(projectId: string, peerId: string): boolean {
  const project = getProject(projectId);
  return project ? project.members.includes(peerId) : false;
}

/**
 * Add or update a topic in a project
 */
export function ensureProjectTopic(
  projectId: string,
  topicName: string,
  description?: string
): boolean {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;

  let topic = project.topics.find(t => t.name === topicName);
  if (!topic) {
    topic = {
      name: topicName,
      description,
      contributions: [],
      lastUpdated: new Date().toISOString()
    };
    project.topics.push(topic);
  } else if (description && description !== topic.description) {
    topic.description = description;
    topic.lastUpdated = new Date().toISOString();
  }

  project.updatedAt = new Date().toISOString();
  saveProjects(projects);
  return true;
}

/**
 * Add a contribution to a project entry type
 */
export function contributeToProject(
  projectId: string,
  entryTypeName: string,
  authorId: string,
  summary: string,
  metadata?: Record<string, any>
): string | null {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;

  // Ensure the author is a project member
  if (!project.members.includes(authorId)) {
    return null;
  }

  // Keep the existing topic bucket structure on disk; user-facing terminology is "entry type".
  let topic = project.topics.find(t => t.name === entryTypeName);
  if (!topic) {
    topic = {
      name: entryTypeName,
      contributions: [],
      lastUpdated: new Date().toISOString()
    };
    project.topics.push(topic);
  }

  // Create the contribution
  const now = new Date().toISOString();
  const contributionId = `${projectId}-${entryTypeName}-${Date.now()}`;
  const contribution: ProjectContribution = {
    id: contributionId,
    timestamp: now,
    authorId,
    entryType: entryTypeName,
    topic: entryTypeName,
    summary,
    metadata
  };

  topic.contributions.push(contribution);
  topic.lastUpdated = now;
  project.updatedAt = now;

  saveProjects(projects);
  return contributionId;
}

/**
 * Get contributions for a specific entry type across all projects
 */
export function getTopicContributions(
  projectId: string,
  entryTypeName: string,
  limit?: number
): ProjectContribution[] {
  const project = getProject(projectId);
  if (!project) return [];

  let topicContributions: any[] = [];

  // Handle both data formats: old flat format and new nested format
  if ((project as any).topics.length > 0 && typeof (project as any).topics[0] === 'object') {
    // New nested format: topics are objects with contributions
    const topic = ((project as any).topics as any[]).find(t => t.name === entryTypeName);
    if (!topic) return [];
    topicContributions = topic.contributions;
  } else {
    // Old flat format: check if topic exists and filter contributions
    const topicExists = ((project as any).topics as string[]).includes(entryTypeName);
    if (!topicExists) return [];
    topicContributions = ((project as any).contributions || []).filter((c: any) => getContributionEntryType(c) === entryTypeName);
  }

  // Sort by timestamp descending (newest first)
  const sorted = [...topicContributions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Get all contributions from a specific author in a project
 */
export function getAuthorContributions(
  projectId: string,
  authorId: string,
  limit?: number
): ProjectContribution[] {
  const project = getProject(projectId);
  if (!project) return [];

  let authorContributions: any[] = [];

  // Handle both data formats: old flat format and new nested format
  if ((project as any).topics.length > 0 && typeof (project as any).topics[0] === 'object') {
    // New nested format: topics are objects with contributions
    for (const topic of (project as any).topics) {
      authorContributions.push(...topic.contributions.filter((c: any) =>
        c.peerId === authorId || c.authorId === authorId  // Support both field names
      ));
    }
  } else {
    // Old flat format: filter contributions from the flat array by author
    authorContributions = ((project as any).contributions || []).filter((c: any) =>
      c.peerId === authorId || c.authorId === authorId  // Support both field names
    );
  }

  // Sort by timestamp descending (newest first)
  const sorted = authorContributions.sort(
    (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Search contributions by content (simple text search)
 */
export function searchContributions(
  projectId: string,
  query: string,
  limit?: number
): ProjectContribution[] {
  const project = getProject(projectId);
  if (!project) return [];

  const lowerQuery = query.toLowerCase();

  let contributions: any[] = [];

  // Handle both data formats: old flat format and new nested format
  if ((project as any).topics.length > 0 && typeof (project as any).topics[0] === 'object') {
    // New nested format: topics are objects with contributions
    for (const topic of (project as any).topics) {
      contributions.push(...topic.contributions.filter((c: any) =>
        c.summary.toLowerCase().includes(lowerQuery) ||
        getContributionEntryType(c).toLowerCase().includes(lowerQuery)
      ));
    }
  } else {
    // Old flat format: search through the flat contributions array
    contributions = ((project as any).contributions || []).filter((c: any) =>
      c.summary.toLowerCase().includes(lowerQuery) ||
      getContributionEntryType(c).toLowerCase().includes(lowerQuery)
    );
  }

  // Sort by timestamp descending (newest first)
  const sorted = contributions.sort(
    (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Get project status summary (entry types with recent activity)
 */
export function getProjectStatus(projectId: string): {
  project: any; // Use actual stored format instead of interface
  topics: Array<{
    name: string;
    description?: string;
    contributionCount: number;
    lastContribution?: any;
    contributors: string[];
  }>;
} | null {
  const project = getProject(projectId);
  if (!project) return null;

  // Handle both data formats: old flat format and new nested format
  let topics;

  // Check if this project uses the new nested format (topics as objects)
  if ((project as any).topics.length > 0 && typeof (project as any).topics[0] === 'object') {
    // New nested format: topics are objects with contributions
    topics = ((project as any).topics as any[]).map(topic => {
      const sortedContributions = [...topic.contributions].sort(
        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const contributors = [...new Set(topic.contributions.map((c: any) => c.authorId || c.peerId))] as string[];

      return {
        name: topic.name,
        description: topic.description,
        contributionCount: topic.contributions.length,
        lastContribution: sortedContributions[0],
        contributors
      };
    });
  } else {
    // Old flat format: topics are strings, contributions are flat
    topics = ((project as any).topics as string[]).map(topicName => {
      // Filter contributions for this topic from the flat contributions array
      const topicContributions = (project as any).contributions.filter((c: any) => getContributionEntryType(c) === topicName);

      const sortedContributions = [...topicContributions].sort(
        (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Use peerId instead of authorId based on actual data format
      const contributors = [...new Set(topicContributions.map((c: any) => c.peerId || c.authorId))] as string[];

      return {
        name: topicName,
        contributionCount: topicContributions.length,
        lastContribution: sortedContributions[0],
        contributors
      };
    });
  }

  return { project, topics };
}

/**
 * Update project metadata
 */
export function updateProject(
  projectId: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
): boolean {
  const projects = loadProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) return false;

  projects[projectIndex] = {
    ...projects[projectIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  saveProjects(projects);
  return true;
}
