import { requireConfig } from '../shared/config.js';
export async function notifyOpenClaw(payload) {
    const config = requireConfig();
    // Method 1: POST /hooks/agent — deliver:true routes the message to the user's last channel
    // This is the correct OpenClaw webhook ingress for external systems (e.g. OGP daemon).
    // Requires hooks.enabled=true and hooks.token in openclaw.json.
    // Falls back to Method 2 if the hooks token is not configured.
    const hooksToken = config.openclawHooksToken;
    if (hooksToken && config.openclawUrl) {
        const openclawUrl = config.openclawUrl.replace(/\/$/, '');
        try {
            const result = await new Promise((resolve) => {
                import('node:https').then(({ request: httpsRequest }) => {
                    import('node:http').then(({ request: httpRequest }) => {
                        import('node:url').then(({ URL }) => {
                            const url = new URL(`${openclawUrl}/hooks/agent`);
                            const isHttps = url.protocol === 'https:';
                            const body = JSON.stringify({
                                message: payload.text,
                                name: 'OGP',
                                deliver: true,
                                channel: config.notifyChannel || 'last',
                                ...(config.notifyTarget
                                    ? { to: String(config.notifyTarget) }
                                    : {}),
                            });
                            const reqFn = isHttps ? httpsRequest : httpRequest;
                            const req = reqFn({
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
        }
        catch (error) {
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
    }
    catch (err) {
        console.error('[OGP] System event CLI failed:', err);
    }
    return false;
}
//# sourceMappingURL=notify.js.map