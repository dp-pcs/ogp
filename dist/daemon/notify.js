import { requireConfig } from '../shared/config.js';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    // Method 1: HTTP sessions_send (primary - delivers Telegram notifications)
    if (config.openclawToken) {
        console.log('[OGP] Using HTTP sessions_send for notification (primary method)');
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
                        message: payload.text,
                        ...(payload.metadata && { metadata: payload.metadata })
                    }
                })
            });
            if (response.ok) {
                const result = await response.text();
                console.log('[OGP] Successfully notified OpenClaw via HTTP sessions_send:', payload.text);
                console.log('[OGP] HTTP Response:', result);
                return true;
            }
            else {
                const errorText = await response.text();
                console.error(`[OGP] HTTP notification failed with status ${response.status}:`, errorText);
            }
        }
        catch (error) {
            console.error('[OGP] Error notifying OpenClaw via HTTP:', error);
        }
    }
    else {
        console.error('[OGP] No openclawToken configured - cannot send notification (BUILD-88 fix requires HTTP)');
        return false;
    }
    // This should never be reached since both success and failure paths return above
    return false;
}
//# sourceMappingURL=notify.js.map