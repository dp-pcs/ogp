import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';
const PROJECTS_FILE = path.join(getConfigDir(), 'projects.json');
export function loadProjects() {
    ensureConfigDir();
    if (!fs.existsSync(PROJECTS_FILE)) {
        return [];
    }
    const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
}
export function saveProjects(projects) {
    ensureConfigDir();
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}
export function createProject(id, name, description, metadata) {
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
export function addProject(project) {
    const projects = loadProjects();
    const existing = projects.findIndex(p => p.id === project.id);
    if (existing >= 0) {
        projects[existing] = { ...project, updatedAt: new Date().toISOString() };
    }
    else {
        projects.push(project);
    }
    saveProjects(projects);
}
export function getProject(projectId) {
    const projects = loadProjects();
    return projects.find(p => p.id === projectId) || null;
}
export function listProjects() {
    return loadProjects();
}
export function deleteProject(projectId) {
    const projects = loadProjects();
    const index = projects.findIndex(p => p.id === projectId);
    if (index === -1)
        return false;
    projects.splice(index, 1);
    saveProjects(projects);
    return true;
}
/**
 * Join a project (add peer as member if not already present)
 */
export function joinProject(projectId, peerId) {
    const projects = loadProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project)
        return false;
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
export function leaveProject(projectId, peerId) {
    const projects = loadProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project)
        return false;
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
export function isProjectMember(projectId, peerId) {
    const project = getProject(projectId);
    return project ? project.members.includes(peerId) : false;
}
/**
 * Add or update a topic in a project
 */
export function ensureProjectTopic(projectId, topicName, description) {
    const projects = loadProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project)
        return false;
    let topic = project.topics.find(t => t.name === topicName);
    if (!topic) {
        topic = {
            name: topicName,
            description,
            contributions: [],
            lastUpdated: new Date().toISOString()
        };
        project.topics.push(topic);
    }
    else if (description && description !== topic.description) {
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
export function contributeToProject(projectId, topicName, authorId, summary, metadata) {
    const projects = loadProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project)
        return null;
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
    const contribution = {
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
export function getTopicContributions(projectId, topicName, limit) {
    const project = getProject(projectId);
    if (!project)
        return [];
    const topic = project.topics.find(t => t.name === topicName);
    if (!topic)
        return [];
    // Sort by timestamp descending (newest first)
    const sorted = [...topic.contributions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
}
/**
 * Get all contributions from a specific author in a project
 */
export function getAuthorContributions(projectId, authorId, limit) {
    const project = getProject(projectId);
    if (!project)
        return [];
    const contributions = [];
    for (const topic of project.topics) {
        contributions.push(...topic.contributions.filter(c => c.authorId === authorId));
    }
    // Sort by timestamp descending (newest first)
    const sorted = contributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
}
/**
 * Search contributions by content (simple text search)
 */
export function searchContributions(projectId, query, limit) {
    const project = getProject(projectId);
    if (!project)
        return [];
    const contributions = [];
    const lowerQuery = query.toLowerCase();
    for (const topic of project.topics) {
        contributions.push(...topic.contributions.filter(c => c.summary.toLowerCase().includes(lowerQuery) ||
            c.topic.toLowerCase().includes(lowerQuery)));
    }
    // Sort by timestamp descending (newest first)
    const sorted = contributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
}
/**
 * Get project status summary (topics with recent activity)
 */
export function getProjectStatus(projectId) {
    const project = getProject(projectId);
    if (!project)
        return null;
    const topics = project.topics.map(topic => {
        const sortedContributions = [...topic.contributions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
export function updateProject(projectId, updates) {
    const projects = loadProjects();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1)
        return false;
    projects[projectIndex] = {
        ...projects[projectIndex],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    saveProjects(projects);
    return true;
}
//# sourceMappingURL=projects.js.map