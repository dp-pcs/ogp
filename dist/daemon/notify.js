import { requireConfig } from '../shared/config.js';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    const url = `${config.openclawUrl}/api/system-event`;
    const body = {
        text: payload.text,
        sessionKey: payload.sessionKey || 'agent:main:main',
        ...payload.metadata
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openclawToken}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            console.error(`[OGP] Failed to notify OpenClaw: ${response.status} ${response.statusText}`);
            return false;
        }
        console.log('[OGP] Notified OpenClaw:', payload.text);
        return true;
    }
    catch (error) {
        console.error('[OGP] Error notifying OpenClaw:', error);
        return false;
    }
}
//# sourceMappingURL=notify.js.map