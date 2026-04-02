import { requireConfig, type OGPConfig } from '../shared/config.js';

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

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();

  // Method 1: POST /hooks/agent — deliver:true routes the message to the user's last channel
  // This is the correct OpenClaw webhook ingress for external systems (e.g. OGP daemon).
  // Requires hooks.enabled=true and hooks.token in openclaw.json.
  // Falls back to Method 2 if the hooks token is not configured.
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

  // Method 2: openclaw system event --mode now (CLI fallback, no channel routing)
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
