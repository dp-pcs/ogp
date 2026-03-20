import { requireConfig } from '../shared/config.js';
import { execSync } from 'node:child_process';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    // Method 1: Use openclaw CLI if available (most reliable, handles TLS)
    try {
        const escaped = payload.text.replace(/'/g, "'\\''");
        execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
            timeout: 5000,
            env: { ...process.env }
        });
        console.log('[OGP] Notified OpenClaw via CLI:', payload.text);
        return true;
    }
    catch {
        // CLI not available or failed — try HTTP
    }
    // Method 2: HTTP with token (for non-localhost or when CLI unavailable)
    if (!config.openclawToken) {
        console.log('[OGP] No OpenClaw token configured — skipping notification');
        return false;
    }
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
    }
    catch (error) {
        console.error('[OGP] Error notifying OpenClaw:', error);
    }
    return false;
}
//# sourceMappingURL=notify.js.map