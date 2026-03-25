import { requireConfig } from '../shared/config.js';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    // Method 1: openclaw CLI with --mode now (immediate wake, routes to Telegram)
    // OpenClaw uses WebSocket internally so HTTP POST to /tools/invoke doesn't work.
    // The CLI handles the WebSocket connection and --mode now triggers immediate delivery.
    try {
        const { execSync } = await import('node:child_process');
        const escaped = payload.text.replace(/'/g, "'\\''");
        execSync(`openclaw system event --text '${escaped}' --mode now 2>/dev/null`, {
            timeout: 10000,
            env: { ...process.env }
        });
        console.log('[OGP] Notified OpenClaw via CLI (--mode now):', payload.text);
        return true;
    }
    catch (err) {
        console.error('[OGP] CLI notification failed:', err);
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
        }
        catch (error) {
            console.error('[OGP] HTTP fallback failed:', error);
        }
    }
    return false;
}
//# sourceMappingURL=notify.js.map