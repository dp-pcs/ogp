import {
  createProject,
  addProject,
  getProject,
  listProjects,
  joinProject,
  isProjectMember,
  contributeToProject,
  getTopicContributions,
  getAuthorContributions,
  searchContributions,
  getProjectStatus,
  updateProject,
  ensureProjectTopic
} from '../daemon/projects.js';
import { loadConfig } from '../shared/config.js';
import { getPeer } from '../daemon/peers.js';
import { federationSend } from './federation.js';

interface ProjectJoinOptions {
  description?: string;
  create?: boolean;
}

interface ProjectContributeOptions {
  metadata?: string; // JSON string
}

interface ProjectQueryOptions {
  topic?: string;
  author?: string;
  limit?: number;
  search?: string;
}

/**
 * Create a new project locally
 */
export async function projectCreate(
  projectId: string,
  projectName: string,
  options: { description?: string } = {}
): Promise<void> {
  // Check if project already exists
  const existing = getProject(projectId);
  if (existing) {
    console.error(`Error: Project '${projectId}' already exists`);
    process.exit(1);
  }

  // Create the project
  const project = createProject(projectId, projectName, options.description);

  // Add current user as first member
  const config = loadConfig();
  if (config?.email) {
    project.members.push(config.email);
  }

  addProject(project);

  console.log(`✓ Created project: ${projectName} (${projectId})`);
  if (options.description) {
    console.log(`  Description: ${options.description}`);
  }
  console.log(`  Members: ${project.members.join(', ')}`);
}

/**
 * Join an existing project (local or request federation)
 */
export async function projectJoin(
  projectId: string,
  projectName?: string,
  options: ProjectJoinOptions = {}
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  // Check if project exists locally
  let project = getProject(projectId);

  if (!project && options.create) {
    // Create project locally if --create flag is used
    if (!projectName) {
      console.error('Error: --create requires a project name');
      process.exit(1);
    }

    project = createProject(projectId, projectName, options.description);
    project.members.push(config.email);
    addProject(project);

    console.log(`✓ Created and joined project: ${projectName} (${projectId})`);
    return;
  }

  if (!project) {
    console.error(`Error: Project '${projectId}' not found locally.`);
    console.log('Use --create to create a new project, or request to join from a peer.');
    process.exit(1);
  }

  // Check if already a member
  if (isProjectMember(projectId, config.email)) {
    console.log(`You are already a member of project '${project.name}'`);
    return;
  }

  // Join the project
  const success = joinProject(projectId, config.email);
  if (success) {
    console.log(`✓ Joined project: ${project.name} (${projectId})`);
  } else {
    console.error('Error: Failed to join project');
    process.exit(1);
  }
}

/**
 * List all projects
 */
export async function projectList(): Promise<void> {
  const projects = listProjects();

  if (projects.length === 0) {
    console.log('No projects found');
    return;
  }

  console.log(`Found ${projects.length} project(s):\n`);

  for (const project of projects) {
    console.log(`${project.name} (${project.id})`);
    if (project.description) {
      console.log(`  Description: ${project.description}`);
    }
    console.log(`  Members: ${project.members.length}`);
    console.log(`  Topics: ${project.topics.length}`);
    console.log(`  Created: ${new Date(project.createdAt).toLocaleString()}`);
    console.log(`  Updated: ${new Date(project.updatedAt).toLocaleString()}`);
    console.log();
  }
}

/**
 * Contribute to a project topic
 */
export async function projectContribute(
  projectId: string,
  topic: string,
  summary: string,
  options: ProjectContributeOptions = {}
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  const project = getProject(projectId);
  if (!project) {
    console.error(`Error: Project '${projectId}' not found`);
    process.exit(1);
  }

  if (!isProjectMember(projectId, config.email)) {
    console.error(`Error: You are not a member of project '${project.name}'`);
    process.exit(1);
  }

  // Parse metadata if provided
  let metadata: Record<string, any> | undefined;
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata);
    } catch (err) {
      console.error('Error: Invalid JSON in --metadata');
      process.exit(1);
    }
  }

  // Ensure the topic exists
  ensureProjectTopic(projectId, topic);

  // Add the contribution
  const contributionId = contributeToProject(
    projectId,
    topic,
    config.email,
    summary,
    metadata
  );

  if (contributionId) {
    console.log(`✓ Contributed to project '${project.name}' topic '${topic}'`);
    console.log(`  Summary: ${summary}`);
    if (metadata) {
      console.log(`  Metadata: ${JSON.stringify(metadata, null, 2)}`);
    }
    console.log(`  Contribution ID: ${contributionId}`);
  } else {
    console.error('Error: Failed to add contribution');
    process.exit(1);
  }
}

/**
 * Query project contributions
 */
export async function projectQuery(
  projectId: string,
  options: ProjectQueryOptions = {}
): Promise<void> {
  const project = getProject(projectId);
  if (!project) {
    console.error(`Error: Project '${projectId}' not found`);
    process.exit(1);
  }

  const limit = options.limit || 20;
  let contributions;

  if (options.search) {
    // Search by text
    contributions = searchContributions(projectId, options.search, limit);
    console.log(`Search results for "${options.search}" in project '${project.name}':`);
  } else if (options.topic) {
    // Query by topic
    contributions = getTopicContributions(projectId, options.topic, limit);
    console.log(`Contributions to topic '${options.topic}' in project '${project.name}':`);
  } else if (options.author) {
    // Query by author
    contributions = getAuthorContributions(projectId, options.author, limit);
    console.log(`Contributions by '${options.author}' in project '${project.name}':`);
  } else {
    // Get all recent contributions - handle both data formats
    contributions = [];

    // Check if this project uses the new nested format (topics as objects)
    if ((project as any).topics.length > 0 && typeof (project as any).topics[0] === 'object') {
      // New nested format: topics are objects with contributions
      for (const topic of (project as any).topics) {
        contributions.push(...topic.contributions);
      }
    } else {
      // Old flat format: contributions are in flat array
      contributions = (project as any).contributions || [];
    }

    contributions.sort((a: any, b: any) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    contributions = contributions.slice(0, limit);
    console.log(`Recent contributions in project '${project.name}':`);
  }

  if (contributions.length === 0) {
    console.log('No contributions found');
    return;
  }

  console.log();
  for (const contrib of contributions) {
    console.log(`[${new Date(contrib.timestamp).toLocaleString()}] ${contrib.authorId}`);
    console.log(`  Topic: ${contrib.topic}`);
    console.log(`  Summary: ${contrib.summary}`);
    if (contrib.metadata) {
      console.log(`  Metadata: ${JSON.stringify(contrib.metadata, null, 2)}`);
    }
    console.log();
  }
}

/**
 * Get project status overview
 */
export async function projectStatus(projectId: string): Promise<void> {
  const statusData = getProjectStatus(projectId);
  if (!statusData) {
    console.error(`Error: Project '${projectId}' not found`);
    process.exit(1);
  }

  const { project, topics } = statusData;

  console.log(`Project: ${project.name} (${project.id})`);
  if (project.description) {
    console.log(`Description: ${project.description}`);
  }
  console.log(`Members: ${project.members.join(', ')}`);
  console.log(`Created: ${new Date(project.createdAt).toLocaleString()}`);
  console.log(`Updated: ${new Date(project.updatedAt).toLocaleString()}`);
  console.log();

  if (topics.length === 0) {
    console.log('No topics found in this project');
    return;
  }

  console.log(`Topics (${topics.length}):`);
  console.log();

  for (const topic of topics) {
    console.log(`${topic.name}`);
    if (topic.description) {
      console.log(`  Description: ${topic.description}`);
    }
    console.log(`  Contributions: ${topic.contributionCount}`);
    console.log(`  Contributors: ${topic.contributors.join(', ')}`);

    if (topic.lastContribution) {
      console.log(`  Last activity: ${new Date(topic.lastContribution.timestamp).toLocaleString()}`);
      console.log(`    by ${topic.lastContribution.authorId}: ${topic.lastContribution.summary}`);
    }
    console.log();
  }
}

/**
 * Request to join a project from a peer
 */
export async function projectRequestJoin(
  peerId: string,
  projectId: string,
  projectName: string,
  options: { description?: string } = {}
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Error: Peer '${peerId}' not found`);
    process.exit(1);
  }

  if (peer.status !== 'approved') {
    console.error(`Error: Peer '${peerId}' is not approved for federation`);
    process.exit(1);
  }

  const payload = {
    projectId,
    projectName,
    ...(options.description && { projectDescription: options.description })
  };

  console.log(`Requesting to join project '${projectName}' from peer '${peerId}'...`);

  try {
    await federationSend(peerId, 'project.join', JSON.stringify(payload));
    console.log(`✓ Join request sent to peer '${peerId}'`);
  } catch (err) {
    console.error('Error sending join request:', err);
    process.exit(1);
  }
}

/**
 * Send a project contribution to peers
 */
export async function projectSendContribution(
  peerId: string,
  projectId: string,
  topic: string,
  summary: string,
  options: ProjectContributeOptions = {}
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Error: Peer '${peerId}' not found`);
    process.exit(1);
  }

  if (peer.status !== 'approved') {
    console.error(`Error: Peer '${peerId}' is not approved for federation`);
    process.exit(1);
  }

  // Parse metadata if provided
  let metadata: Record<string, any> | undefined;
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata);
    } catch (err) {
      console.error('Error: Invalid JSON in --metadata');
      process.exit(1);
    }
  }

  const payload = {
    projectId,
    topic,
    summary,
    ...(metadata && { metadata })
  };

  console.log(`Sending contribution to project '${projectId}' topic '${topic}' to peer '${peerId}'...`);

  try {
    await federationSend(peerId, 'project.contribute', JSON.stringify(payload));
    console.log(`✓ Contribution sent to peer '${peerId}'`);
  } catch (err) {
    console.error('Error sending contribution:', err);
    process.exit(1);
  }
}

/**
 * Query a peer's project contributions
 */
export async function projectQueryPeer(
  peerId: string,
  projectId: string,
  options: Omit<ProjectQueryOptions, 'search'> = {}
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Error: Peer '${peerId}' not found`);
    process.exit(1);
  }

  if (peer.status !== 'approved') {
    console.error(`Error: Peer '${peerId}' is not approved for federation`);
    process.exit(1);
  }

  const payload: Record<string, any> = { projectId };
  if (options.topic) payload.topic = options.topic;
  if (options.author) payload.authorId = options.author;
  if (options.limit) payload.limit = options.limit;

  console.log(`Querying project '${projectId}' from peer '${peerId}'...`);

  try {
    await federationSend(peerId, 'project.query', JSON.stringify(payload));
    console.log(`✓ Query sent to peer '${peerId}' - check for async response`);
  } catch (err) {
    console.error('Error sending query:', err);
    process.exit(1);
  }
}

/**
 * Request project status from a peer
 */
export async function projectStatusPeer(
  peerId: string,
  projectId: string
): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('Error: Not configured. Run "ogp setup" first.');
    process.exit(1);
  }

  const peer = getPeer(peerId);
  if (!peer) {
    console.error(`Error: Peer '${peerId}' not found`);
    process.exit(1);
  }

  if (peer.status !== 'approved') {
    console.error(`Error: Peer '${peerId}' is not approved for federation`);
    process.exit(1);
  }

  const payload = { projectId };

  console.log(`Requesting status for project '${projectId}' from peer '${peerId}'...`);

  try {
    await federationSend(peerId, 'project.status', JSON.stringify(payload));
    console.log(`✓ Status request sent to peer '${peerId}' - check for async response`);
  } catch (err) {
    console.error('Error sending status request:', err);
    process.exit(1);
  }
}