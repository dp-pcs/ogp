import { verifyObject } from '../shared/signing.js';
import { getPeer } from './peers.js';
import { getIntent } from './intent-registry.js';
import { notifyOpenClaw } from './notify.js';

export interface FederationMessage {
  intent: string;
  from: string;        // peer ID
  to: string;          // our peer ID
  nonce: string;       // unique message ID
  timestamp: string;
  payload: any;
}

export interface MessageResponse {
  success: boolean;
  nonce: string;
  response?: any;
  error?: string;
}

export async function handleMessage(
  message: FederationMessage,
  signature: string
): Promise<MessageResponse> {
  // 1. Verify sender
  const peer = getPeer(message.from);
  if (!peer) {
    return {
      success: false,
      nonce: message.nonce,
      error: 'Unknown peer'
    };
  }

  if (peer.status !== 'approved') {
    return {
      success: false,
      nonce: message.nonce,
      error: 'Peer not approved'
    };
  }

  // 2. Verify signature
  if (!verifyObject(message, signature, peer.publicKey)) {
    return {
      success: false,
      nonce: message.nonce,
      error: 'Invalid signature'
    };
  }

  // 3. Check intent exists
  const intent = getIntent(message.intent);
  if (!intent) {
    return {
      success: false,
      nonce: message.nonce,
      error: `Unknown intent: ${message.intent}`
    };
  }

  // 4. Notify OpenClaw
  const notificationText = formatNotification(message, peer.displayName);
  await notifyOpenClaw({
    text: notificationText,
    metadata: {
      ogp: {
        from: message.from,
        intent: message.intent,
        nonce: message.nonce,
        payload: message.payload
      }
    }
  });

  // 5. Return success
  return {
    success: true,
    nonce: message.nonce,
    response: {
      received: true,
      timestamp: new Date().toISOString()
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
