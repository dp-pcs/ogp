import { requireConfig } from '../shared/config.js';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    // Method 1: openclaw agent --deliver via main session
    // Reads session store directly to find the sessionId for agent:main:main
    // Channel-agnostic: delivers through whatever channel the session is on (Telegram, Signal, etc.)
    try {
        const { execSync } = await import('node:child_process');
        const fs = await import('node:fs');
        const os = await import('node:os');
        const path = await import('node:path');
        const escaped = payload.text.replace(/'/g, "'\\''");
        // Read sessions.json directly (avoid --json flag which mixes plugin logs)
        let sessionId = null;
        try {
            const sessionsPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json');
            if (fs.existsSync(sessionsPath)) {
                const data = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
                // sessions.json is a dict keyed by sessionKey, value has sessionId
                const mainSession = data['agent:main:main'];
                if (mainSession?.sessionId) {
                    sessionId = mainSession.sessionId;
                }
            }
        }
        catch {
            // Can't read sessions — fall through
        }
        if (sessionId) {
            execSync(`openclaw agent --message '${escaped}' --deliver --session-id '${sessionId}' 2>/dev/null`, {
                timeout: 15000,
                env: { ...process.env }
            });
            console.log('[OGP] Notified via openclaw agent --deliver (session:', sessionId, '):', payload.text);
            return true;
        }
    }
    catch (err) {
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
    }
    catch (err) {
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
        }
        catch (error) {
            console.error('[OGP] HTTP fallback failed:', error);
        }
    }
    return false;
}
//# sourceMappingURL=notify.js.map