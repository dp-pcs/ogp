import { verifyObject } from '../shared/signing.js';
import { getPeer } from './peers.js';
import { getIntent } from './intent-registry.js';
import { notifyOpenClaw } from './notify.js';
import { checkAccess } from './doorman.js';
import { logActivity, getEffectivePolicy } from './agent-comms.js';
import { getProject, joinProject, isProjectMember, contributeToProject, getTopicContributions, getAuthorContributions, getProjectStatus, ensureProjectTopic, createProject, addProject } from './projects.js';
import { loadConfig } from '../shared/config.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
export async function handleMessage(message, signature) {
    // 1. Verify sender exists and is approved
    const peer = getPeer(message.from);
    if (!peer) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Unknown peer',
            statusCode: 403
        };
    }
    if (peer.status !== 'approved') {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Peer not approved',
            statusCode: 403
        };
    }
    // 2. Verify signature
    if (!verifyObject(message, signature, peer.publicKey)) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Invalid signature',
            statusCode: 401
        };
    }
    // 3. Doorman scope check (v0.2.0)
    const accessResult = checkAccess(message.from, message.intent, message.payload);
    if (!accessResult.allowed) {
        console.log(`[OGP] Access denied for ${message.from}: ${accessResult.reason}`);
        return {
            success: false,
            nonce: message.nonce,
            error: accessResult.reason,
            statusCode: accessResult.statusCode,
            retryAfter: accessResult.retryAfter
        };
    }
    if (accessResult.isV1Peer) {
        console.log(`[OGP] Processing message from v0.1 peer ${message.from} (legacy mode)`);
    }
    // 4. Check intent exists
    const intent = getIntent(message.intent);
    if (!intent) {
        return {
            success: false,
            nonce: message.nonce,
            error: `Unknown intent: ${message.intent}`,
            statusCode: 400
        };
    }
    // 5. Handle agent-comms specially (includes replyTo support)
    if (message.intent === 'agent-comms') {
        return handleAgentComms(message, peer.displayName);
    }
    // 5.1. Handle project intents specially
    if (message.intent.startsWith('project.')) {
        return handleProjectIntent(message, peer.displayName);
    }
    // 6. Execute intent handler if one is registered
    if (intent.handler) {
        try {
            const handlerResult = await executeIntentHandler(intent.handler, message, peer.displayName);
            console.log(`[OGP] Intent handler executed for ${message.intent}: ${handlerResult.success ? 'success' : 'failed'}`);
            if (!handlerResult.success) {
                console.error(`[OGP] Handler error: ${handlerResult.error}`);
            }
        }
        catch (error) {
            console.error(`[OGP] Handler execution failed: ${error}`);
        }
    }
    // 7. Standard intent handling: Notify OpenClaw
    const notificationText = formatNotification(message, peer.displayName);
    await notifyOpenClaw({
        text: notificationText,
        metadata: {
            ogp: {
                from: message.from,
                intent: message.intent,
                nonce: message.nonce,
                payload: message.payload,
                replyTo: message.replyTo,
                conversationId: message.conversationId
            }
        }
    });
    // 8. Return success
    return {
        success: true,
        nonce: message.nonce,
        response: {
            received: true,
            timestamp: new Date().toISOString()
        }
    };
}
/**
 * Handle agent-comms intent with topic routing and reply support
 */
async function handleAgentComms(message, displayName) {
    const payload = message.payload || {};
    const topic = payload.topic || 'general';
    const messageText = payload.message || '';
    const priority = payload.priority || 'normal';
    // Get effective response policy for this peer and topic
    const policy = getEffectivePolicy(message.from, topic);
    // Log incoming activity
    logActivity({
        direction: 'in',
        peerId: message.from,
        peerName: displayName,
        topic,
        message: messageText,
        level: policy.level
    });
    // Build enhanced notification with policy info
    const priorityIndicator = priority === 'high' ? '[HIGH] ' : priority === 'low' ? '[low] ' : '';
    const policyTag = `[${policy.level.toUpperCase()}]`;
    const notificationText = `[OGP Agent-Comms] ${priorityIndicator}${displayName} → ${topic} ${policyTag}: ${messageText}`;
    await notifyOpenClaw({
        text: notificationText,
        metadata: {
            ogp: {
                from: message.from,
                intent: 'agent-comms',
                nonce: message.nonce,
                topic,
                message: messageText,
                priority,
                replyTo: message.replyTo,
                conversationId: message.conversationId,
                payload: message.payload,
                // Include policy info for agent to use
                responsePolicy: {
                    level: policy.level,
                    notes: policy.notes
                }
            }
        }
    });
    return {
        success: true,
        nonce: message.nonce,
        response: {
            received: true,
            topic,
            timestamp: new Date().toISOString(),
            // Tell sender how to get replies if they didn't provide callback
            replyEndpoint: message.replyTo ? undefined : `/federation/reply/${message.nonce}`
        }
    };
}
function formatNotification(message, displayName) {
    const intent = message.intent;
    const payload = message.payload;
    switch (intent) {
        case 'message':
            return `[OGP] Message from ${displayName}: ${payload.text}`;
        case 'task-request':
            return `[OGP] Task request from ${displayName}: ${payload.description}`;
        case 'status-update':
            return `[OGP] Status update from ${displayName}: ${payload.message || payload.status}`;
        case 'project.join':
            return `[OGP Project] ${displayName} wants to join project '${payload.projectName}' (${payload.projectId})`;
        case 'project.contribute':
            return `[OGP Project] ${displayName} contributed to project '${payload.projectId}' topic '${payload.topic}': ${payload.summary}`;
        case 'project.query':
            return `[OGP Project] ${displayName} queried project '${payload.projectId}'`;
        case 'project.status':
            return `[OGP Project] ${displayName} requested status for project '${payload.projectId}'`;
        default:
            return `[OGP] ${intent} from ${displayName}`;
    }
}
/**
 * Execute an intent handler script with the message data
 */
async function executeIntentHandler(handlerPath, message, peerDisplayName) {
    return new Promise((resolve) => {
        // Check if handler script exists
        if (!fs.existsSync(handlerPath)) {
            resolve({ success: false, error: `Handler script not found: ${handlerPath}` });
            return;
        }
        // Prepare environment variables for the script
        const env = {
            ...process.env,
            OGP_INTENT: message.intent,
            OGP_FROM: message.from,
            OGP_TO: message.to,
            OGP_NONCE: message.nonce,
            OGP_TIMESTAMP: message.timestamp,
            OGP_PAYLOAD: JSON.stringify(message.payload || {}),
            OGP_PEER_NAME: peerDisplayName,
            OGP_REPLY_TO: message.replyTo || '',
            OGP_CONVERSATION_ID: message.conversationId || ''
        };
        const child = spawn(handlerPath, [], {
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000 // 30 second timeout
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, output: stdout.trim() });
            }
            else {
                resolve({
                    success: false,
                    error: `Handler exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
                });
            }
        });
        child.on('error', (error) => {
            resolve({ success: false, error: `Failed to execute handler: ${error.message}` });
        });
        // Send message data to handler via stdin
        child.stdin?.write(JSON.stringify({
            intent: message.intent,
            from: message.from,
            to: message.to,
            nonce: message.nonce,
            timestamp: message.timestamp,
            payload: message.payload || {},
            peerDisplayName,
            replyTo: message.replyTo,
            conversationId: message.conversationId
        }));
        child.stdin?.end();
    });
}
/**
 * Handle project.* intents with business logic
 */
async function handleProjectIntent(message, displayName) {
    const config = loadConfig();
    if (!config) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Gateway not configured',
            statusCode: 500
        };
    }
    const payload = message.payload || {};
    try {
        switch (message.intent) {
            case 'project.join':
                return await handleProjectJoin(message, displayName, payload);
            case 'project.contribute':
                return await handleProjectContribute(message, displayName, payload);
            case 'project.query':
                return await handleProjectQuery(message, displayName, payload);
            case 'project.status':
                return await handleProjectStatus(message, displayName, payload);
            default:
                return {
                    success: false,
                    nonce: message.nonce,
                    error: `Unknown project intent: ${message.intent}`,
                    statusCode: 400
                };
        }
    }
    catch (error) {
        console.error(`[OGP] Project intent error:`, error);
        return {
            success: false,
            nonce: message.nonce,
            error: 'Internal server error processing project intent',
            statusCode: 500
        };
    }
}
/**
 * Handle project.join intent
 */
async function handleProjectJoin(message, displayName, payload) {
    const { projectId, projectName, projectDescription } = payload;
    if (!projectId || !projectName) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Missing required fields: projectId, projectName',
            statusCode: 400
        };
    }
    // Check if project exists locally
    let project = getProject(projectId);
    if (!project) {
        // Create the project locally
        project = createProject(projectId, projectName, projectDescription);
        addProject(project);
        console.log(`[OGP] Created project '${projectName}' (${projectId}) from peer ${message.from}`);
    }
    // Add the requesting peer as a member
    const success = joinProject(projectId, message.from);
    if (success) {
        const notificationText = `[OGP Project] ${displayName} joined project '${projectName}' (${projectId})`;
        await notifyOpenClaw({
            text: notificationText,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'project.join',
                    nonce: message.nonce,
                    projectId,
                    projectName,
                    payload: message.payload
                }
            }
        });
        return {
            success: true,
            nonce: message.nonce,
            response: {
                joined: true,
                projectId,
                projectName,
                timestamp: new Date().toISOString()
            }
        };
    }
    else {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Failed to join project',
            statusCode: 500
        };
    }
}
/**
 * Handle project.contribute intent
 */
async function handleProjectContribute(message, displayName, payload) {
    const { projectId, topic, summary, metadata } = payload;
    if (!projectId || !topic || !summary) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Missing required fields: projectId, topic, summary',
            statusCode: 400
        };
    }
    // Check if project exists and peer is a member
    const project = getProject(projectId);
    if (!project) {
        return {
            success: false,
            nonce: message.nonce,
            error: `Project '${projectId}' not found`,
            statusCode: 404
        };
    }
    if (!isProjectMember(projectId, message.from)) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'You are not a member of this project',
            statusCode: 403
        };
    }
    // Ensure topic exists
    ensureProjectTopic(projectId, topic);
    // Add the contribution
    const contributionId = contributeToProject(projectId, topic, message.from, summary, metadata);
    if (contributionId) {
        const notificationText = `[OGP Project] ${displayName} contributed to '${project.name}' topic '${topic}': ${summary}`;
        await notifyOpenClaw({
            text: notificationText,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'project.contribute',
                    nonce: message.nonce,
                    projectId,
                    topic,
                    summary,
                    contributionId,
                    payload: message.payload
                }
            }
        });
        return {
            success: true,
            nonce: message.nonce,
            response: {
                contributed: true,
                projectId,
                topic,
                contributionId,
                timestamp: new Date().toISOString()
            }
        };
    }
    else {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Failed to add contribution',
            statusCode: 500
        };
    }
}
/**
 * Handle project.query intent
 */
async function handleProjectQuery(message, displayName, payload) {
    const { projectId, topic, authorId, limit = 20 } = payload;
    if (!projectId) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Missing required field: projectId',
            statusCode: 400
        };
    }
    // Check if project exists and peer is a member
    const project = getProject(projectId);
    if (!project) {
        return {
            success: false,
            nonce: message.nonce,
            error: `Project '${projectId}' not found`,
            statusCode: 404
        };
    }
    if (!isProjectMember(projectId, message.from)) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'You are not a member of this project',
            statusCode: 403
        };
    }
    // Get contributions based on query parameters
    let contributions;
    let queryDescription;
    if (topic) {
        contributions = getTopicContributions(projectId, topic, limit);
        queryDescription = `topic '${topic}'`;
    }
    else if (authorId) {
        contributions = getAuthorContributions(projectId, authorId, limit);
        queryDescription = `author '${authorId}'`;
    }
    else {
        // Get all recent contributions
        contributions = [];
        for (const projectTopic of project.topics) {
            contributions.push(...projectTopic.contributions);
        }
        contributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        contributions = contributions.slice(0, limit);
        queryDescription = 'all recent';
    }
    const notificationText = `[OGP Project] ${displayName} queried project '${project.name}' for ${queryDescription} contributions (${contributions.length} found)`;
    await notifyOpenClaw({
        text: notificationText,
        metadata: {
            ogp: {
                from: message.from,
                intent: 'project.query',
                nonce: message.nonce,
                projectId,
                queryDescription,
                resultCount: contributions.length,
                payload: message.payload
            }
        }
    });
    return {
        success: true,
        nonce: message.nonce,
        response: {
            projectId,
            projectName: project.name,
            contributions: contributions.map(c => ({
                id: c.id,
                timestamp: c.timestamp,
                authorId: c.authorId,
                topic: c.topic,
                summary: c.summary,
                metadata: c.metadata
            })),
            timestamp: new Date().toISOString()
        }
    };
}
/**
 * Handle project.status intent
 */
async function handleProjectStatus(message, displayName, payload) {
    const { projectId } = payload;
    if (!projectId) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Missing required field: projectId',
            statusCode: 400
        };
    }
    // Check if project exists and peer is a member
    const statusData = getProjectStatus(projectId);
    if (!statusData) {
        return {
            success: false,
            nonce: message.nonce,
            error: `Project '${projectId}' not found`,
            statusCode: 404
        };
    }
    const { project } = statusData;
    if (!isProjectMember(projectId, message.from)) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'You are not a member of this project',
            statusCode: 403
        };
    }
    const notificationText = `[OGP Project] ${displayName} requested status for project '${project.name}' (${statusData.topics.length} topics)`;
    await notifyOpenClaw({
        text: notificationText,
        metadata: {
            ogp: {
                from: message.from,
                intent: 'project.status',
                nonce: message.nonce,
                projectId,
                topicCount: statusData.topics.length,
                payload: message.payload
            }
        }
    });
    return {
        success: true,
        nonce: message.nonce,
        response: {
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                members: project.members,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt
            },
            topics: statusData.topics.map(topic => ({
                name: topic.name,
                description: topic.description,
                contributionCount: topic.contributionCount,
                contributors: topic.contributors,
                lastContribution: topic.lastContribution ? {
                    timestamp: topic.lastContribution.timestamp,
                    authorId: topic.lastContribution.authorId,
                    summary: topic.lastContribution.summary
                } : null
            })),
            timestamp: new Date().toISOString()
        }
    };
}
//# sourceMappingURL=message-handler.js.map