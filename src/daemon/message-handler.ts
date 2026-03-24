import { verifyObject } from '../shared/signing.js';
import { getPeer } from './peers.js';
import { getIntent } from './intent-registry.js';
import { notifyOpenClaw } from './notify.js';
import { checkAccess } from './doorman.js';
import { handleReply, createReply } from './reply-handler.js';
import { logActivity, getEffectivePolicy } from './agent-comms.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export interface FederationMessage {
  intent: string;
  from: string;        // peer ID
  to: string;          // our peer ID
  nonce: string;       // unique message ID
  timestamp: string;
  payload: any;
  // v0.2.0 agent-comms fields
  replyTo?: string;        // callback URL for async replies
  conversationId?: string; // thread identifier
}

export interface MessageResponse {
  success: boolean;
  nonce: string;
  response?: any;
  error?: string;
  statusCode?: number;     // HTTP status code
  retryAfter?: number;     // For 429 rate limit responses
}

export async function handleMessage(
  message: FederationMessage,
  signature: string
): Promise<MessageResponse> {
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

  // 6. Execute intent handler if one is registered
  if (intent.handler) {
    try {
      const handlerResult = await executeIntentHandler(intent.handler, message, peer.displayName);
      console.log(`[OGP] Intent handler executed for ${message.intent}: ${handlerResult.success ? 'success' : 'failed'}`);

      if (!handlerResult.success) {
        console.error(`[OGP] Handler error: ${handlerResult.error}`);
      }
    } catch (error) {
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
async function handleAgentComms(
  message: FederationMessage,
  displayName: string
): Promise<MessageResponse> {
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

function formatNotification(message: FederationMessage, displayName: string): string {
  const intent = message.intent;
  const payload = message.payload;

  switch (intent) {
    case 'message':
      return `[OGP] Message from ${displayName}: ${payload.text}`;
    case 'task-request':
      return `[OGP] Task request from ${displayName}: ${payload.description}`;
    case 'status-update':
      return `[OGP] Status update from ${displayName}: ${payload.message || payload.status}`;
    default:
      return `[OGP] ${intent} from ${displayName}`;
  }
}

/**
 * Execute an intent handler script with the message data
 */
async function executeIntentHandler(
  handlerPath: string,
  message: FederationMessage,
  peerDisplayName: string
): Promise<{ success: boolean; error?: string; output?: string }> {
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
      } else {
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
