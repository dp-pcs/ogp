import { requireConfig } from '../shared/config.js';
import { execSync } from 'node:child_process';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();

  // Method 1: HTTP sessions_send (primary - delivers Telegram notifications)
  if (config.openclawToken) {
    const openclawUrl = config.openclawUrl.replace(/\/$/, '');

    try {
      // Disable TLS verification for localhost
      const env = { ...process.env };
      if (openclawUrl.includes('localhost') || openclawUrl.includes('127.0.0.1')) {
        env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }

      const response = await fetch(`${openclawUrl}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openclawToken}`
        },
        body: JSON.stringify({
          tool: 'sessions_send',
          args: {
            sessionKey: payload.sessionKey || 'agent:main:main',
            message: payload.text
          }
        })
      });

      if (response.ok) {
        console.log('[OGP] Notified OpenClaw via HTTP:', payload.text);
        return true;
      }
    } catch (error) {
      console.error('[OGP] Error notifying OpenClaw via HTTP:', error);
    }
  }

  // Method 2: Fallback to openclaw CLI if HTTP fails or no token configured
  try {
    const escaped = payload.text.replace(/'/g, "'\\''");
    execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
      timeout: 5000,
      env: { ...process.env }
    });
    console.log('[OGP] Notified OpenClaw via CLI fallback:', payload.text);
    return true;
  } catch {
    console.error('[OGP] Both HTTP and CLI notification methods failed');
  }

  return false;
}
