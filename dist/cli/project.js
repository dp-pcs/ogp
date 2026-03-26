import { createProject, addProject, getProject, listProjects, joinProject, isProjectMember, contributeToProject, getTopicContributions, getAuthorContributions, searchContributions, getProjectStatus, ensureProjectTopic } from '../daemon/projects.js';
import { loadConfig } from '../shared/config.js';
import { getPeer } from '../daemon/peers.js';
import { federationSend } from './federation.js';
/**
 * Create a new project locally
 */
export async function projectCreate(projectId, projectName, options = {}) {
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
    const approvedPeers = listPeers('approved');
    if (approvedPeers.length > 0) {
        let registered = 0;
        for (const peer of approvedPeers) {
            setPeerTopicPolicy(peer.id, projectId, 'summary');
            registered++;
        }
        console.log(`  ↗ Auto-registered as agent-comms topic for ${registered} peer${registered > 1 ? 's' : ''}`);
    }
}
/**
 * Join an existing project (local or request federation)
 */
export async function projectJoin(projectId, projectName, options = {}) {
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
    }
    else {
        console.error('Error: Failed to join project');
        process.exit(1);
    }
}
/**
 * List all projects
 */
export async function projectList() {
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
 * Contribute to a project topic
 */
export async function projectContribute(projectId, topic, summary, options = {}) {
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
    let metadata;
    if (options.metadata) {
        try {
            metadata = JSON.parse(options.metadata);
        }
        catch (err) {
            console.error('Error: Invalid JSON in --metadata');
            process.exit(1);
        }
    }
    // Ensure the topic exists
    ensureProjectTopic(projectId, topic);
    // Add the contribution
    const contributionId = contributeToProject(projectId, topic, config.email, summary, metadata);
    if (contributionId) {
        console.log(`✓ Contributed to project '${project.name}' [${topic}]`);
        console.log(`  Summary: ${summary}`);
        if (metadata) {
            console.log(`  Metadata: ${JSON.stringify(metadata, null, 2)}`);
        }
        console.log(`  Contribution ID: ${contributionId}`);
    }
    else {
        console.error('Error: Failed to add contribution');
        process.exit(1);
    }
    // BUILD-93: Auto-push to all approved peers who are project members
    if (!options.localOnly) {
        const { listPeers } = await import('../daemon/peers.js');
        const peers = listPeers().filter(p => p.status === 'approved');
        if (peers.length > 0) {
            const payload = JSON.stringify({ projectId, topic, summary, ...(metadata && { metadata }) });
            let pushed = 0;
            for (const peer of peers) {
                try {
                    await federationSend(peer.id, 'project.contribute', payload, 5000);
                    pushed++;
                }
                catch {
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
export async function projectQuery(projectId, options = {}) {
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
    }
    else if (options.topic) {
        // Query by entry type
        contributions = getTopicContributions(projectId, options.topic, limit);
        console.log(`Contributions [${options.topic}] in project '${project.name}':`);
    }
    else if (options.author) {
        // Query by author
        contributions = getAuthorContributions(projectId, options.author, limit);
        console.log(`Contributions by '${options.author}' in project '${project.name}':`);
    }
    else {
        // Get all recent contributions - handle both data formats
        contributions = [];
        // Check if this project uses the new nested format (topics as objects)
        if (project.topics.length > 0 && typeof project.topics[0] === 'object') {
            // New nested format: topics are objects with contributions
            for (const topic of project.topics) {
                contributions.push(...topic.contributions);
            }
        }
        else {
            // Old flat format: contributions are in flat array
            contributions = project.contributions || [];
        }
        contributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
        console.log(`  Type: ${contrib.topic}`);
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
export async function projectStatus(projectId) {
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
            console.log(`    by ${topic.lastContribution.authorId}: ${topic.lastContribution.summary}`);
        }
        console.log();
    }
}
/**
 * Request to join a project from a peer
 */
export async function projectRequestJoin(peerId, projectId, projectName, options = {}) {
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
            console.log(`✓ Successfully joined project '${responseProjectName || projectName}'`);
            console.log(`  Run 'ogp project list' to see your projects`);
        }
        else if (response.success === false) {
            console.error(`Join request rejected: ${response.error || 'Unknown error'}`);
            process.exit(1);
        }
        else {
            console.error('Unexpected response format from peer');
            process.exit(1);
        }
    }
    catch (err) {
        console.error('Error sending join request:', err);
        process.exit(1);
    }
}
/**
 * Send a project contribution to peers
 */
export async function projectSendContribution(peerId, projectId, topic, summary, options = {}) {
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
    let metadata;
    if (options.metadata) {
        try {
            metadata = JSON.parse(options.metadata);
        }
        catch (err) {
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
    console.log(`Sending contribution to project '${projectId}' [${topic}] to peer '${peerId}'...`);
    try {
        await federationSend(peerId, 'project.contribute', JSON.stringify(payload));
        console.log(`✓ Contribution sent to peer '${peerId}'`);
    }
    catch (err) {
        console.error('Error sending contribution:', err);
        process.exit(1);
    }
}
/**
 * Query a peer's project contributions
 */
export async function projectQueryPeer(peerId, projectId, options = {}) {
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
    if (options.topic)
        payload.topic = options.topic;
    if (options.author)
        payload.authorId = options.author;
    if (options.limit)
        payload.limit = options.limit;
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
            contributions.forEach((contribution, index) => {
                const timestamp = new Date(contribution.timestamp).toLocaleString();
                console.log(`${index + 1}. [${contribution.topic}] by ${contribution.authorId} (${timestamp})`);
                console.log(`   ${contribution.summary}`);
                if (contribution.metadata) {
                    console.log(`   Metadata: ${JSON.stringify(contribution.metadata, null, 2)}`);
                }
                console.log('');
            });
        }
        else {
            console.log(`\n✓ No contributions found in project '${projectName}'`);
            // Check if filters were applied
            const filters = [];
            if (options.topic)
                filters.push(`topic: ${options.topic}`);
            if (options.author)
                filters.push(`author: ${options.author}`);
            if (filters.length > 0) {
                console.log(`   (with filters: ${filters.join(', ')})`);
            }
        }
    }
    catch (err) {
        console.error('Error querying peer:', err);
        process.exit(1);
    }
}
/**
 * Request project status from a peer
 */
export async function projectStatusPeer(peerId, projectId) {
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
    }
    catch (err) {
        console.error('Error sending status request:', err);
        process.exit(1);
    }
}
//# sourceMappingURL=project.js.map