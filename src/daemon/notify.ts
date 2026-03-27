import { requireConfig } from '../shared/config.js';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();

  // Method 1: HTTP via sessions_send (fastest, no CLI spawn, works even when CLI hangs)
  if (config.openclawToken) {
    const openclawUrl = config.openclawUrl.replace(/\/$/, '');
    try {
      // Use node:https directly to support self-signed localhost certs
      const result = await new Promise<boolean>((resolve) => {
        import('node:https').then(({ request }) => {
          import('node:url').then(({ URL }) => {
            const url = new URL(`${openclawUrl}/tools/invoke`);
            const body = JSON.stringify({
              tool: 'sessions_send',
              args: {
                sessionKey: payload.sessionKey || 'agent:main:main',
                message: payload.text
              }
            });
            const req = request({
              hostname: url.hostname,
              port: url.port || 443,
              path: url.pathname,
              method: 'POST',
              rejectUnauthorized: false,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openclawToken}`,
                'Content-Length': Buffer.byteLength(body)
              }
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
      if (result) {
        console.log('[OGP] Notified OpenClaw via HTTP (sessions_send):', payload.text);
        return true;
      }
    } catch (error) {
      console.error('[OGP] HTTP sessions_send failed:', error);
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
