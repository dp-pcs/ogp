import {
  createProject,
  addProject,
  getProject,
  listProjects,
  listProjectsForPeer,
  joinProject,
  isProjectMember,
  contributeToProject,
  getTopicContributions,
  getAuthorContributions,
  searchContributions,
  getProjectStatus,
  updateProject,
  ensureProjectTopic,
  getContributionEntryType,
  type ProjectContribution
} from '../daemon/projects.js';
import { loadConfig } from '../shared/config.js';
import { getPeer } from '../daemon/peers.js';
import { federationSend } from './federation.js';

/**
 * Format author display with 3-tier fallback:
 * 1. Use authorIdentity if available (humanName + agentName)
 * 2. Fall back to peer lookup
 * 3. Last resort: raw authorId
 */
function formatAuthorDisplay(contribution: ProjectContribution): string {
  // Tier 1: Use snapshot identity if available
  if (contribution.authorIdentity) {
    const parts: string[] = [];
    if (contribution.authorIdentity.humanName) {
      parts.push(contribution.authorIdentity.humanName);
    }
    if (contribution.authorIdentity.agentName) {
      parts.push(`(${contribution.authorIdentity.agentName})`);
    }
    if (parts.length > 0) {
      return parts.join(' ');
    }
    // Fall back to displayName if humanName/agentName not set
    if (contribution.authorIdentity.displayName) {
      return contribution.authorIdentity.displayName;
    }
  }

  // Tier 2: Try peer lookup
  try {
    const peer = getPeer(contribution.authorId);
    if (peer) {
      const parts: string[] = [];
      if (peer.humanName) {
        parts.push(peer.humanName);
      }
      if (peer.agentName) {
        parts.push(`(${peer.agentName})`);
      }
      if (parts.length > 0) {
        return parts.join(' ');
      }
      if (peer.displayName) {
        return peer.displayName;
      }
    }
  } catch {
    // Peer lookup failed, continue to tier 3
  }

  // Tier 3: Raw authorId
  return contribution.authorId;
}

interface ProjectJoinOptions {
  description?: string;
  create?: boolean;
}

interface ProjectContributeOptions {
  metadata?: string; // JSON string
  localOnly?: boolean; // skip auto-push to peers
}

interface ProjectQueryOptions {
  entryType?: string;
  topic?: string;
  author?: string;
  limit?: number;
  search?: string;
  timeout?: number;
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

  // BUILD-102: Auto-register project ID as agent-comms topic for all approved peers
  const { listPeers, setPeerTopicPolicy } = await import('../daemon/peers.js');
  const memberPeers = listPeers('approved').filter(peer => listProjectsForPeer(peer.id, [project]).length > 0);
  if (memberPeers.length > 0) {
    let registered = 0;
    for (const peer of memberPeers) {
      setPeerTopicPolicy(peer.id, projectId, 'summary');
      registered++;
    }
    console.log(`  ↗ Auto-registered as agent-comms topic for ${registered} peer${registered > 1 ? 's' : ''}`);
  }
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
export async function projectRemove(projectId: string): Promise<void> {
  const { deleteProject, getProject } = await import('../daemon/projects.js');
  const project = getProject(projectId);
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }
  const deleted = deleteProject(projectId);
  if (deleted) {
    console.log(`✓ Removed project: ${projectId} (${project.name})`);
  } else {
    console.error(`Failed to remove project: ${projectId}`);
    process.exit(1);
  }
}

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
    console.log(`  Entry types: ${project.topics.length}`);
    console.log(`  Created: ${new Date(project.createdAt).toLocaleString()}`);
    console.log(`  Updated: ${new Date(project.updatedAt).toLocaleString()}`);
    console.log();
  }
}

/**
 * Contribute to a project entry type
 */
export async function projectContribute(
  projectId: string,
  entryType: string,
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

  // Keep the existing topic bucket structure on disk; user-facing terminology is "entry type".
  ensureProjectTopic(projectId, entryType);

  // Build author identity from local config
  const authorIdentity = {
    displayName: config.displayName,
    humanName: config.humanName,
    agentName: config.agentName,
    organization: config.organization,
    tags: config.tags
  };

  // Add the contribution
  const contributionId = contributeToProject(
    projectId,
    entryType,
    config.email,
    summary,
    metadata,
    authorIdentity
  );

  if (contributionId) {
    console.log(`✓ Contributed to project '${project.name}' [${entryType}]`);
    console.log(`  Summary: ${summary}`);
    if (metadata) {
      console.log(`  Metadata: ${JSON.stringify(metadata, null, 2)}`);
    }
    console.log(`  Contribution ID: ${contributionId}`);
  } else {
    console.error('Error: Failed to add contribution');
    process.exit(1);
  }

  // BUILD-93: Auto-push to all approved peers who are project members
  if (!options.localOnly) {
    const { listPeers } = await import('../daemon/peers.js');
    const peers = listPeers('approved').filter(peer => listProjectsForPeer(peer.id, [project]).length > 0);
    if (peers.length > 0) {
      const payload = JSON.stringify({
        projectId,
        entryType,
        topic: entryType,
        summary,
        authorIdentity,
        ...(metadata && { metadata })
      });
      let pushed = 0;
      for (const peer of peers) {
        try {
          await federationSend(peer.id, 'project.contribute', payload, 5000);
          pushed++;
        } catch {
          // Peer unreachable — skip silently, contribution saved locally
        }
      }
      if (pushed > 0) {
        console.log(`  ↗ Synced to ${pushed} peer${pushed > 1 ? 's' : ''}`);
      }
    }
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
  const entryType = options.entryType || options.topic;

  if (options.search) {
    // Search by text
    contributions = searchContributions(projectId, options.search, limit);
    console.log(`Search results for "${options.search}" in project '${project.name}':`);
  } else if (entryType) {
    // Query by entry type
    contributions = getTopicContributions(projectId, entryType, limit);
    console.log(`Contributions [${entryType}] in project '${project.name}':`);
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
    console.log(`[${new Date(contrib.timestamp).toLocaleString()}] ${formatAuthorDisplay(contrib)}`);
    console.log(`  Entry type: ${getContributionEntryType(contrib)}`);
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
    console.log('No entry types found in this project');
    return;
  }

  console.log(`Entry types (${topics.length}):`);
  console.log();

  for (const topic of topics) {
    console.log(`[${topic.name}]`);
    if (topic.description) {
      console.log(`  Description: ${topic.description}`);
    }
    console.log(`  Contributions: ${topic.contributionCount}`);
    console.log(`  Contributors: ${topic.contributors.join(', ')}`);

    if (topic.lastContribution) {
      console.log(`  Last activity: ${new Date(topic.lastContribution.timestamp).toLocaleString()}`);
      console.log(`    by ${formatAuthorDisplay(topic.lastContribution)}: ${topic.lastContribution.summary}`);
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
    const response = await federationSend(peerId, 'project.join', JSON.stringify(payload));

    if (!response) {
      console.error('Failed to get response from peer');
      process.exit(1);
    }

    console.log(`✓ Join request sent to peer '${peerId}'`);

    // Handle successful join response
    if (response.success && response.response?.joined) {
      const { projectId, projectName: responseProjectName } = response.response;

      // Check if project already exists locally
      let project = getProject(projectId);

      if (!project) {
        // Create the project locally with information from the response
        project = createProject(projectId, responseProjectName || projectName, options.description);
        addProject(project);
        console.log(`✓ Project '${responseProjectName || projectName}' created locally`);
      }

      // Add ourselves as a member (we successfully joined)
      if (!isProjectMember(projectId, config.email)) {
        joinProject(projectId, config.email);
        console.log(`✓ Added to project members`);
      }

      if (!isProjectMember(projectId, peer.id)) {
        joinProject(projectId, peer.id);
      }

      const { setPeerTopicPolicy } = await import('../daemon/peers.js');
      setPeerTopicPolicy(peer.id, projectId, 'summary');

      console.log(`✓ Successfully joined project '${responseProjectName || projectName}'`);
      console.log(`  Run 'ogp project list' to see your projects`);
    } else if (response.success === false) {
      console.error(`Join request rejected: ${response.error || 'Unknown error'}`);
      process.exit(1);
    } else {
      console.error('Unexpected response format from peer');
      process.exit(1);
    }
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
  entryType: string,
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

  // Build author identity from local config
  const authorIdentity = {
    displayName: config.displayName,
    humanName: config.humanName,
    agentName: config.agentName,
    organization: config.organization,
    tags: config.tags
  };

  const payload = {
    projectId,
    entryType,
    topic: entryType,
    summary,
    authorIdentity,
    ...(metadata && { metadata })
  };

  console.log(`Sending contribution to project '${projectId}' [${entryType}] to peer '${peerId}'...`);

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

  const entryType = options.entryType || options.topic;
  const payload: Record<string, any> = { projectId };
  if (entryType) {
    payload.entryType = entryType;
    payload.topic = entryType;
  }
  if (options.author) payload.authorId = options.author;
  if (options.limit) payload.limit = options.limit;

  console.log(`Querying project '${projectId}' from peer '${peerId}'...`);

  try {
    const response = await federationSend(peerId, 'project.query', JSON.stringify(payload), options.timeout);

    if (!response) {
      console.error('Failed to get response from peer');
      process.exit(1);
    }

    if (!response.success) {
      console.error(`Query failed: ${response.error || 'Unknown error'}`);
      process.exit(1);
    }

    // Format and display the response
    const { projectName, contributions } = response.response;

    if (contributions && contributions.length > 0) {
      console.log(`\n✓ Found ${contributions.length} contributions in project '${projectName}':\n`);

      contributions.forEach((contribution: any, index: number) => {
        const timestamp = new Date(contribution.timestamp).toLocaleString();
        console.log(`${index + 1}. [${getContributionEntryType(contribution)}] by ${formatAuthorDisplay(contribution)} (${timestamp})`);
        console.log(`   ${contribution.summary}`);
        if (contribution.metadata) {
          console.log(`   Metadata: ${JSON.stringify(contribution.metadata, null, 2)}`);
        }
        console.log('');
      });
    } else {
      console.log(`\n✓ No contributions found in project '${projectName}'`);

      // Check if filters were applied
      const filters = [];
      if (entryType) filters.push(`entry type: ${entryType}`);
      if (options.author) filters.push(`author: ${options.author}`);
      if (filters.length > 0) {
        console.log(`   (with filters: ${filters.join(', ')})`);
      }
    }
  } catch (err) {
    console.error('Error querying peer:', err);
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
