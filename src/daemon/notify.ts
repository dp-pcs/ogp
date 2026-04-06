import { requireConfig, type OGPConfig } from '../shared/config.js';
import crypto from 'node:crypto';

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

/**
 * OpenClaw notification backend.
 * Uses the existing OpenClaw webhook and CLI integration.
 */
class OpenClawBackend implements NotificationBackend {
  readonly name = 'openclaw';

  async notify(payload: NotificationPayload, config: OGPConfig): Promise<boolean> {
    // Method 1: POST /hooks/agent
    const hooksToken = (config as any).openclawHooksToken;
    if (hooksToken && config.openclawUrl) {
      const openclawUrl = config.openclawUrl.replace(/\/$/, '');
      try {
        const result = await new Promise<boolean>((resolve) => {
          import('node:https').then(({ request: httpsRequest }) => {
            import('node:http').then(({ request: httpRequest }) => {
              import('node:url').then(({ URL }) => {
                const url = new URL(`${openclawUrl}/hooks/agent`);
                const isHttps = url.protocol === 'https:';
                const target = resolveNotifyTarget(config, payload.agent);
                const hookPayload = {
                  agentId: payload.agent || config.agentId || 'default',
                  peerId: payload.peerId || payload.metadata?.ogp?.from || 'unknown',
                  intent: payload.intent || payload.metadata?.ogp?.intent || 'unknown',
                  topic: payload.topic || payload.metadata?.ogp?.topic || 'general',
                  message: payload.text,
                  notifyTarget: target || config.notifyTarget || null,
                  timestamp: new Date().toISOString(),
                  // Legacy fields for backward compatibility
                  name: 'OGP',
                  deliver: true,
                  channel: (config as any).notifyChannel || 'last',
                  ...(target ? { to: target } : {}),
                };
                const body = JSON.stringify(hookPayload);
                const reqFn = isHttps ? httpsRequest : httpRequest;
                const req = (reqFn as typeof httpsRequest)({
                  hostname: url.hostname,
                  port: url.port || (isHttps ? 443 : 80),
                  path: url.pathname,
                  method: 'POST',
                  rejectUnauthorized: false,
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${hooksToken}`,
                    'Content-Length': Buffer.byteLength(body),
                  },
                }, (res) => {
                  resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
                });
                req.on('error', () => resolve(false));
                req.setTimeout(5000, () => { req.destroy(); resolve(false); });
                req.write(body);
                req.end();
              });
            });
          });
        });
        if (result) {
          console.log('[OGP] Notified OpenClaw via /hooks/agent:', payload.text);
          return true;
        }
        console.warn('[OGP] /hooks/agent call failed (non-2xx or error), falling back');
      } catch (error) {
        console.error('[OGP] /hooks/agent failed:', error);
      }
    }

    // Method 2: openclaw system event --mode now (CLI fallback)
    try {
      const { execSync } = await import('node:child_process');
      const escaped = payload.text.replace(/'/g, "'\\''");
      execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
        timeout: 5000,
        env: { ...process.env }
      });
      console.log('[OGP] Notified OpenClaw via system event CLI:', payload.text);
      return true;
    } catch (err) {
      console.error('[OGP] System event CLI failed:', err);
    }

    return false;
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
    const body = {
      peer_id: payload.peerId || 'unknown',
      peer_display_name: payload.peerDisplayName || payload.peerId || 'Unknown Peer',
      intent: payload.intent || 'message',
      topic: payload.topic || 'general',
      message: payload.text,
      priority: payload.priority || 'normal',
      conversation_id: payload.conversationId,
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
