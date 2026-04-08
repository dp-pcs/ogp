import {
  requireConfig,
  type InboundFederationMode,
  type OGPConfig
} from '../shared/config.js';
import crypto from 'node:crypto';
import { injectMessage } from './openclaw-bridge.js';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
  /**
   * Target agent for routing the notification.
   * If specified, looks up notifyTargets[agent] first, then falls back to legacy notifyTarget.
   */
  agent?: string;
  /**
   * Peer ID of the sender (for hook payload)
   */
  peerId?: string;
  /**
   * Intent that triggered this notification (for hook payload)
   */
  intent?: string;
  /**
   * Topic for agent-comms notifications (for hook payload)
   */
  topic?: string;
  /**
   * Display name of the peer (for Hermes integration)
   */
  peerDisplayName?: string;
  /**
   * Priority level (for Hermes integration)
   */
  priority?: 'low' | 'normal' | 'high';
  /**
   * Conversation ID for threading (for Hermes integration)
   */
  conversationId?: string;
}

/**
 * Notification backend interface for platform-agnostic notifications.
 * Each platform (OpenClaw, Hermes, etc.) implements this interface.
 */
interface NotificationBackend {
  readonly name: string;
  notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean>;
}

/**
 * Resolve the notification target for a given agent.
 * Priority:
 * 1. notifyTargets[agent] (if agent specified and exists in map)
 * 2. legacy notifyTarget (for backward compatibility)
 * 3. undefined (no specific target)
 */
function resolveNotifyTarget(config: OGPConfig, agent?: string): string | undefined {
  // Check per-agent targets first if agent is specified
  if (agent && config.notifyTargets?.[agent]) {
    return config.notifyTargets[agent];
  }
  // Fall back to legacy notifyTarget
  return config.notifyTarget;
}

function resolveHumanDeliveryTarget(config: OGPConfig, agent?: string): string | undefined {
  return config.humanDeliveryTarget || resolveNotifyTarget(config, agent);
}

function targetToSessionKey(target: string, agentId: string): string {
  if (target.startsWith('agent:')) {
    return target;
  }

  if (target.startsWith('session:')) {
    return target.slice('session:'.length);
  }

  if (target.startsWith('telegram:')) {
    const chatId = target.replace('telegram:', '');
    return `agent:${agentId}:telegram:direct:${chatId}`;
  }

  return `agent:${agentId}:main`;
}

function resolveOpenClawSessionKey(config: OGPConfig, agent?: string): string {
  const agentId = config.agentId || 'main';
  const target = resolveHumanDeliveryTarget(config, agent);

  if (target) {
    return targetToSessionKey(target, agentId);
  }

  return `agent:${agentId}:main`;
}

function getInboundFederationMode(config: OGPConfig): InboundFederationMode | undefined {
  return config.inboundFederationPolicy?.mode;
}

function formatHandlingGuidance(config: OGPConfig): string {
  const mode = getInboundFederationMode(config);
  const target = resolveHumanDeliveryTarget(config);
  const targetNote = target ? `Configured human delivery target: ${target}.` : '';

  switch (mode) {
    case 'forward':
      return `Human preference: proactively forward inbound federated items to the configured human channel. Do not claim delivery unless you actually send it there. ${targetNote}`.trim();
    case 'summarize':
      return `Human preference: summarize inbound federated items and surface only action requests, uncertainty, or important updates. Do not assume that mentioning it in a different channel counts as delivery. ${targetNote}`.trim();
    case 'autonomous':
      return `Human preference: act autonomously when possible, but if a peer explicitly asks you to tell the human something, treat that as a delivery obligation to the configured human channel. ${targetNote}`.trim();
    case 'approval-required':
      return `Human preference: do not act on or reply to federated requests until the human explicitly approves. ${targetNote}`.trim();
    default:
      return '';
  }
}

/**
 * OpenClaw notification backend.
 * Uses the OpenClaw gateway RPC to deliver messages into the correct session.
 */
class OpenClawBackend implements NotificationBackend {
  readonly name = 'openclaw';

  async notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean> {
    // Format message with peer and intent context
    const peerName = payload.peerDisplayName || payload.peerId || 'unknown peer';
    const intent = payload.intent || 'message';
    const topic = payload.topic || 'general';
    const handlingGuidance = formatHandlingGuidance(config);
    const messageText = `[OGP Federation] From ${peerName} (${intent}/${topic}):\n${payload.text}${
      handlingGuidance ? `\n\n[OGP Handling Policy]\n${handlingGuidance}` : ''
    }`;

    // Route into the actual OpenClaw session so the message appears in the
    // human-visible channel, not just the agent wake/inbox path.
    try {
      const sessionKey = resolveOpenClawSessionKey(config, payload.agent);
      const result = await injectMessage(sessionKey, messageText, peerName);
      if (result) {
        console.log('[OGP] Message delivered to OpenClaw session for peer:', peerName);
        return true;
      } else {
        console.error('[OGP] OpenClaw session delivery failed');
        return false;
      }
    } catch (err) {
      console.error('[OGP] Message injection failed:', err);
      return false;
    }
  }
}

/**
 * Hermes notification backend.
 * Uses Hermes's webhook platform adapter for OGP integration.
 */
class HermesBackend implements NotificationBackend {
  readonly name = 'hermes';

  async notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean> {
    const webhookUrl = config.hermesWebhookUrl || 'http://localhost:8644/webhooks/ogp_federation';
    const secret = config.hermesWebhookSecret;

    if (!secret) {
      console.error('[OGP] Hermes webhook secret not configured. Set hermesWebhookSecret in config.json');
      return false;
    }

    // Build webhook payload
    // Note: event_type is required by Hermes webhook event filter ("events" subscription list)
    const intentStr = payload.intent || 'message';
    const body = {
      event_type: intentStr,  // required for Hermes event filter ("*" is not a wildcard there)
      peer_id: payload.peerId || 'unknown',
      peer_display_name: payload.peerDisplayName || payload.peerId || 'Unknown Peer',
      intent: intentStr,
      topic: payload.topic || 'general',
      message: payload.text,
      priority: payload.priority || 'normal',
      conversation_id: payload.conversationId,
      human_delivery_target: resolveHumanDeliveryTarget(config, payload.agent),
      handling_mode: getInboundFederationMode(config),
      timestamp: new Date().toISOString(),
      payload: payload.metadata || {}
    };

    const bodyStr = JSON.stringify(body);

    // Compute HMAC signature
    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    try {
      const result = await new Promise<boolean>((resolve) => {
        import('node:https').then(({ request: httpsRequest }) => {
          import('node:http').then(({ request: httpRequest }) => {
            import('node:url').then(({ URL }) => {
              const url = new URL(webhookUrl);
              const isHttps = url.protocol === 'https:';
              const reqFn = isHttps ? httpsRequest : httpRequest;

              const req = (reqFn as typeof httpsRequest)({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                rejectUnauthorized: false,
                headers: {
                  'Content-Type': 'application/json',
                  'X-Hub-Signature-256': `sha256=${signature}`,
                  'Content-Length': Buffer.byteLength(bodyStr),
                },
              }, (res) => {
                resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
              });

              req.on('error', (error) => {
                console.error('[OGP] Hermes webhook request error:', error);
                resolve(false);
              });
              req.setTimeout(5000, () => {
                req.destroy();
                resolve(false);
              });
              req.write(bodyStr);
              req.end();
            });
          });
        });
      });

      if (result) {
        console.log('[OGP] Notified Hermes via webhook:', payload.text);
        return true;
      } else {
        console.error('[OGP] Hermes webhook call failed (non-2xx response)');
        return false;
      }
    } catch (error) {
      console.error('[OGP] Hermes webhook failed:', error);
      return false;
    }
  }
}

/**
 * Get the appropriate notification backend based on platform config.
 * Defaults to OpenClaw for backward compatibility.
 */
function getNotificationBackend(config: OGPConfig): NotificationBackend {
  const platform = config.platform || 'openclaw';

  switch (platform) {
    case 'hermes':
      return new HermesBackend();
    case 'openclaw':
    default:
      return new OpenClawBackend();
  }
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();
  const backend = getNotificationBackend(config);
  return backend.notify(payload, config);
}

/**
 * Send notification to the local AI agent using the configured platform backend.
 * This is the recommended function for new code.
 *
 * @param payload Notification data including message, peer info, and metadata
 * @returns Promise<boolean> indicating success
 */
export async function notifyLocalAgent(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();
  const backend = getNotificationBackend(config);
  return backend.notify(payload, config);
}

/**
 * Inject plain text into the local OpenClaw session without wrapping it as an
 * inbound federation message. This is used to mirror local outbound actions
 * into the agent's visible conversation state.
 */
export async function deliverLocalSessionText(text: string, agent?: string): Promise<boolean> {
  const config = requireConfig();

  if ((config.platform || 'openclaw') !== 'openclaw') {
    return false;
  }

  const sessionKey = resolveOpenClawSessionKey(config, agent);
  return injectMessage(sessionKey, text);
}
