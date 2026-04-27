import { verifyObject } from '../shared/signing.js';
import { getPeer, updatePeer } from './peers.js';
import { getIntent } from './intent-registry.js';
import { notifyOpenClaw } from './notify.js';
import { checkAccess } from './doorman.js';
import { logActivity, getEffectivePolicy } from './agent-comms.js';
import { getProject, joinProject, isProjectMember, contributeToProject, getTopicContributions, getAuthorContributions, getProjectStatus, ensureProjectTopic, createProject, addProject } from './projects.js';
import { loadConfig } from '../shared/config.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
/**
 * Witty rejection messages for "off" policy level.
 * Vague by design — does NOT confirm or deny topic existence.
 * Rotates randomly so repeated rejections don't feel like a pattern.
 */
const WITTY_REJECTION_MESSAGES = [
    "You already know I'm not going to answer that. Why are you even asking? 🦝",
    "Bold of you to try. The answer is still no.",
    "My lips are sealed. Have been for a while. Will continue to be.",
    "Oh, that topic. Yeah. No.",
    "I'd respond but I left my ability to discuss that in another life.",
    "That's a great question for literally anyone else.",
    "Interesting. Anyway.",
    "The audacity. Respectfully.",
    "I'm going to pretend you didn't send that and we'll both move on.",
    "Not today. Not tomorrow. Genuinely not ever.",
    "I have been specifically asked not to engage with that. You're welcome.",
    "Some things are sacred. This is one of them. Goodbye.",
    "Ask me about literally anything else. Literally.",
    "I'm not ignoring you. I'm just choosing not to respond. There's a difference.",
    "Error 418: I'm a teapot and that topic is not tea.",
];
function getWittyRejection() {
    return WITTY_REJECTION_MESSAGES[Math.floor(Math.random() * WITTY_REJECTION_MESSAGES.length)];
}
export async function handleMessage(message, signature, messageStr // raw JSON string used to sign — avoids key-order drift
) {
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
    // 2. Verify signature (use raw messageStr if provided to avoid JSON key-order drift)
    if (!verifyObject(message, signature, peer.publicKey, messageStr)) {
        console.error(`[OGP] Signature verification failed for peer ${peer.displayName} (${peer.id})`);
        return {
            success: false,
            nonce: message.nonce,
            error: 'Invalid signature',
            statusCode: 401
        };
    }
    // Issue #3: record authenticated inbound contact for directional health diagnostics.
    const inboundAt = new Date().toISOString();
    updatePeer(peer.id, {
        lastInboundContactAt: inboundAt,
        lastSeenAt: inboundAt
    });
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
 * Handle federation resync responses (yes/no to restore old config)
 */
async function handleFederationResyncResponse(message, displayName, messageText) {
    const { getPeer, updatePeer } = await import('./peers.js');
    const { joinProject } = await import('./projects.js');
    const { updatePeerGrantedScopes, updatePeerReceivedScopes, setPeerTopicPolicy } = await import('./peers.js');
    const peer = getPeer(message.from);
    if (!peer || !peer.resyncSnapshot) {
        // No snapshot to restore
        return {
            success: true,
            nonce: message.nonce,
            response: {
                received: true,
                message: 'No resync data available'
            }
        };
    }
    const response = messageText.trim().toLowerCase();
    const snapshot = peer.resyncSnapshot;
    if (response === 'yes') {
        // Restore old configuration
        const updates = {};
        if (snapshot.oldAlias) {
            updates.alias = snapshot.oldAlias;
        }
        if (snapshot.oldGrantedScopes) {
            updatePeerGrantedScopes(message.from, snapshot.oldGrantedScopes);
        }
        if (snapshot.oldReceivedScopes) {
            updatePeerReceivedScopes(message.from, snapshot.oldReceivedScopes);
        }
        if (snapshot.oldResponsePolicy) {
            updates.responsePolicy = snapshot.oldResponsePolicy;
        }
        // Re-join old projects
        if (snapshot.oldProjects && snapshot.oldProjects.length > 0) {
            for (const projectId of snapshot.oldProjects) {
                try {
                    joinProject(projectId, message.from);
                }
                catch (error) {
                    console.warn(`[OGP Resync] Failed to rejoin project ${projectId}:`, error);
                }
            }
        }
        // Clear the snapshot
        updates.resyncSnapshot = undefined;
        updatePeer(message.from, updates);
        console.log(`[OGP Resync] Restored old config for ${displayName}`);
        if (snapshot.oldAlias)
            console.log(`  - Alias: ${snapshot.oldAlias}`);
        if (snapshot.oldProjects)
            console.log(`  - Projects: ${snapshot.oldProjects.length}`);
        await notifyOpenClaw({
            text: `✓ Restored previous federation config for ${displayName}`,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'agent-comms',
                    topic: 'federation-resync',
                    resyncCompleted: true
                }
            }
        });
        return {
            success: true,
            nonce: message.nonce,
            response: {
                received: true,
                message: 'Configuration restored successfully'
            }
        };
    }
    else if (response === 'no') {
        // Discard snapshot and start fresh
        updatePeer(message.from, { resyncSnapshot: undefined });
        console.log(`[OGP Resync] ${displayName} chose to start fresh - snapshot discarded`);
        await notifyOpenClaw({
            text: `${displayName} chose to start with fresh federation settings (previous config discarded)`,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'agent-comms',
                    topic: 'federation-resync',
                    resyncDeclined: true
                }
            }
        });
        return {
            success: true,
            nonce: message.nonce,
            response: {
                received: true,
                message: 'Starting with fresh configuration'
            }
        };
    }
    else {
        // Unrecognized response - keep snapshot and ask again
        await notifyOpenClaw({
            text: `${displayName} sent unclear response to resync offer: "${messageText}"`,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'agent-comms',
                    topic: 'federation-resync'
                }
            }
        });
        return {
            success: true,
            nonce: message.nonce,
            response: {
                received: true,
                message: 'Please respond with "yes" to restore or "no" for fresh start'
            }
        };
    }
}
/**
 * Handle agent-comms intent with topic routing and reply support
 */
async function handleAgentComms(message, displayName) {
    const payload = message.payload || {};
    const topic = payload.topic || 'general';
    const messageText = payload.message || '';
    const priority = payload.priority || 'normal';
    // Handle federation resync responses specially
    if (topic === 'federation-resync') {
        return handleFederationResyncResponse(message, displayName, messageText);
    }
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
    // BUILD-101: If policy is 'off', send signed rejection with witty message
    // Intentionally does NOT confirm or deny topic existence to the sender.
    // But DO notify the local user so they know what happened and can act on it.
    if (policy.level === 'off') {
        const { loadOrGenerateKeyPair } = await import('./keypair.js');
        const { signObject } = await import('../shared/signing.js');
        const keypair = loadOrGenerateKeyPair();
        const wittyMessage = getWittyRejection();
        const rejection = {
            status: 'rejected',
            reason: 'topic-not-permitted',
            message: wittyMessage
        };
        const { signature } = signObject(rejection, keypair.privateKey);
        // Notify the local user in plain conversational language so their agent
        // can relay it naturally — e.g. "Hey, Stanislav tried to message you about X"
        const preview = messageText.length > 80 ? messageText.slice(0, 80).trimEnd() + '…' : messageText;
        const previewClause = preview ? ` They said: "${preview}"` : '';
        await notifyOpenClaw({
            text: `Hey — ${displayName} just tried to send you a message on topic "${topic}" but I blocked it because that topic isn't on your allow-list.${previewClause} If you want to let them through on "${topic}", just say the word and I'll enable it.`,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'agent-comms',
                    nonce: message.nonce,
                    topic,
                    message: messageText,
                    blocked: true,
                    fixHint: `ogp agent-comms add-topic ${message.from} ${topic} --level summary`
                }
            }
        });
        return {
            success: false,
            nonce: message.nonce,
            error: wittyMessage,
            statusCode: 403,
            response: {
                ...rejection,
                signature
            }
        };
    }
    // Build enhanced notification with policy info
    const priorityIndicator = priority === 'high' ? '[HIGH] ' : priority === 'low' ? '[low] ' : '';
    const policyTag = `[${policy.level.toUpperCase()}]`;
    const notificationText = `[OGP Agent-Comms] ${priorityIndicator}${displayName} → ${topic} ${policyTag}: ${messageText}`;
    await notifyOpenClaw({
        text: notificationText,
        peerId: message.from,
        peerDisplayName: displayName,
        intent: 'agent-comms',
        topic,
        priority,
        conversationId: message.conversationId,
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
            return `[OGP Project] ${displayName} contributed to project '${payload.projectId}' entry type '${payload.entryType || payload.topic}': ${payload.summary}`;
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
        const { setPeerTopicPolicy } = await import('./peers.js');
        setPeerTopicPolicy(message.from, projectId, 'summary');
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
    const { projectId, summary, metadata, authorIdentity } = payload;
    const entryType = payload.entryType || payload.topic;
    if (!projectId || !entryType || !summary) {
        return {
            success: false,
            nonce: message.nonce,
            error: 'Missing required fields: projectId, entryType/topic, summary',
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
    // Keep the existing topic bucket structure on disk; user-facing terminology is "entry type".
    ensureProjectTopic(projectId, entryType);
    // Build authorIdentity with 3-tier fallback: payload → peer lookup → undefined
    let identity = authorIdentity;
    if (!identity) {
        // Fall back to peer lookup
        const peer = getPeer(message.from);
        if (peer) {
            identity = {
                displayName: peer.displayName,
                humanName: peer.humanName,
                agentName: peer.agentName,
                organization: peer.organization,
                tags: peer.tags
            };
        }
    }
    // Add the contribution
    const contributionId = contributeToProject(projectId, entryType, message.from, summary, metadata, identity);
    if (contributionId) {
        const notificationText = `[OGP Project] ${displayName} contributed to '${project.name}' entry type '${entryType}': ${summary}`;
        await notifyOpenClaw({
            text: notificationText,
            metadata: {
                ogp: {
                    from: message.from,
                    intent: 'project.contribute',
                    nonce: message.nonce,
                    projectId,
                    entryType,
                    topic: entryType,
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
                entryType,
                topic: entryType,
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
    const { projectId, authorId, limit = 20 } = payload;
    const entryType = payload.entryType || payload.topic;
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
    if (entryType) {
        contributions = getTopicContributions(projectId, entryType, limit);
        queryDescription = `entry type '${entryType}'`;
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
                entryType: c.entryType || c.topic,
                topic: c.entryType || c.topic,
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