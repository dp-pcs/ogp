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
  topic: string;        // the topic/area this contributes to
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

const PROJECTS_FILE = path.join(getConfigDir(), 'projects.json');

export function loadProjects(): Project[] {
  ensureConfigDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
  return JSON.parse(data) as Project[];
}

export function saveProjects(projects: Project[]): void {
  ensureConfigDir();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
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
 * Add a contribution to a project topic
 */
export function contributeToProject(
  projectId: string,
  topicName: string,
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

  // Ensure the topic exists
  let topic = project.topics.find(t => t.name === topicName);
  if (!topic) {
    topic = {
      name: topicName,
      contributions: [],
      lastUpdated: new Date().toISOString()
    };
    project.topics.push(topic);
  }

  // Create the contribution
  const now = new Date().toISOString();
  const contributionId = `${projectId}-${topicName}-${Date.now()}`;
  const contribution: ProjectContribution = {
    id: contributionId,
    timestamp: now,
    authorId,
    topic: topicName,
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
 * Get contributions for a specific topic across all projects
 */
export function getTopicContributions(
  projectId: string,
  topicName: string,
  limit?: number
): ProjectContribution[] {
  const project = getProject(projectId);
  if (!project) return [];

  const topic = project.topics.find(t => t.name === topicName);
  if (!topic) return [];

  // Sort by timestamp descending (newest first)
  const sorted = [...topic.contributions].sort(
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

  const contributions: ProjectContribution[] = [];
  for (const topic of project.topics) {
    contributions.push(...topic.contributions.filter(c => c.authorId === authorId));
  }

  // Sort by timestamp descending (newest first)
  const sorted = contributions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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

  const contributions: ProjectContribution[] = [];
  const lowerQuery = query.toLowerCase();

  for (const topic of project.topics) {
    contributions.push(
      ...topic.contributions.filter(c =>
        c.summary.toLowerCase().includes(lowerQuery) ||
        c.topic.toLowerCase().includes(lowerQuery)
      )
    );
  }

  // Sort by timestamp descending (newest first)
  const sorted = contributions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Get project status summary (topics with recent activity)
 */
export function getProjectStatus(projectId: string): {
  project: Project;
  topics: Array<{
    name: string;
    description?: string;
    contributionCount: number;
    lastContribution?: ProjectContribution;
    contributors: string[];
  }>;
} | null {
  const project = getProject(projectId);
  if (!project) return null;

  const topics = project.topics.map(topic => {
    const sortedContributions = [...topic.contributions].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const contributors = [...new Set(topic.contributions.map(c => c.authorId))];

    return {
      name: topic.name,
      description: topic.description,
      contributionCount: topic.contributions.length,
      lastContribution: sortedContributions[0],
      contributors
    };
  });

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