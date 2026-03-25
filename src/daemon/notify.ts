import { requireConfig } from '../shared/config.js';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();

  // Method 1: openclaw message send --channel telegram (direct Telegram delivery)
  // Requires notifyTarget set in OGP config: ogp config --set notifyTarget=<telegram-chat-id>
  // The notifyTarget is the Telegram user/chat ID to deliver notifications to.
  const notifyTarget = (config as any).notifyTarget;
  if (notifyTarget) {
    try {
      const { execSync } = await import('node:child_process');
      const escaped = payload.text.replace(/'/g, "'\\''");
      execSync(`openclaw message send --channel telegram --target '${notifyTarget}' --message '${escaped}' 2>/dev/null`, {
        timeout: 10000,
        env: { ...process.env }
      });
      console.log('[OGP] Notified via Telegram to', notifyTarget, ':', payload.text);
      return true;
    } catch (err) {
      console.error('[OGP] Telegram notification failed:', err);
    }
  }

  // Method 2: openclaw system event --mode now (wakes agent, appears as System: context)
  try {
    const { execSync } = await import('node:child_process');
    const escaped = payload.text.replace(/'/g, "'\\''");
    execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
      timeout: 10000,
      env: { ...process.env }
    });
    console.log('[OGP] Notified OpenClaw via system event (--mode now):', payload.text);
    return true;
  } catch (err) {
    console.error('[OGP] System event notification failed:', err);
  }

  // Method 2: HTTP fallback (for non-localhost or when CLI unavailable)
  if (config.openclawToken) {
    const openclawUrl = config.openclawUrl.replace(/\/$/, '');
    try {
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
        console.log('[OGP] Notified OpenClaw via HTTP fallback');
        return true;
      }
    } catch (error) {
      console.error('[OGP] HTTP fallback failed:', error);
    }
  }

  return false;
}
