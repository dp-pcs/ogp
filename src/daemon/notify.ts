import { requireConfig } from '../shared/config.js';

export interface NotificationPayload {
  text: string;
  sessionKey?: string;
  metadata?: Record<string, any>;
}

export async function notifyOpenClaw(payload: NotificationPayload): Promise<boolean> {
  const config = requireConfig();

  // Method 1: openclaw agent --deliver via most recent active session
  // Channel-agnostic: delivers through whatever channel the session is on (Telegram, Signal, etc.)
  try {
    const { execSync } = await import('node:child_process');
    const escaped = payload.text.replace(/'/g, "'\\''");

    // Find most recent direct session ID
    let sessionId: string | null = null;
    try {
      const sessionsOut = execSync('openclaw sessions --json 2>/dev/null', { timeout: 5000, env: { ...process.env } }).toString();
      const sessions = JSON.parse(sessionsOut);
      const direct = sessions.find((s: any) => s.kind === 'direct' || s.key?.includes(':main:main'));
      if (direct?.id) sessionId = direct.id;
    } catch {
      // Can't get session list — fall through
    }

    if (sessionId) {
      execSync(`openclaw agent --message '${escaped}' --deliver --session-id '${sessionId}' 2>/dev/null`, {
        timeout: 15000,
        env: { ...process.env }
      });
      console.log('[OGP] Notified via openclaw agent --deliver (session:', sessionId, '):', payload.text);
      return true;
    }
  } catch (err) {
    console.error('[OGP] Agent deliver notification failed:', err);
  }

  // Method 2: openclaw system event --mode now (fallback — wakes agent, appears as System: context)
  try {
    const { execSync } = await import('node:child_process');
    const escaped = payload.text.replace(/'/g, "'\\''");
    execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
      timeout: 10000,
      env: { ...process.env }
    });
    console.log('[OGP] Notified OpenClaw via system event fallback (--mode now):', payload.text);
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
