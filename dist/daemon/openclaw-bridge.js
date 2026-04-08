/**
 * OpenClaw Bridge for OGP Notifications
 *
 * Injects OGP federation messages into OpenClaw sessions using the Gateway RPC.
 * For Telegram-backed agents, this is the delivery path that actually surfaces
 * the message in the human-visible conversation thread.
 */
import { requireConfig } from '../shared/config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
function toGatewayWsUrl(url) {
    if (url.startsWith('https://')) {
        return `wss://${url.slice('https://'.length)}`;
    }
    if (url.startsWith('http://')) {
        return `ws://${url.slice('http://'.length)}`;
    }
    return url;
}
function extractJsonObject(output) {
    const start = output.indexOf('{');
    if (start === -1) {
        return null;
    }
    try {
        return JSON.parse(output.slice(start));
    }
    catch {
        return null;
    }
}
/**
 * Connect bridge (no-op for RPC-based implementation)
 */
export function connectBridge() {
    console.log('[OGP Bridge] Using OpenClaw Gateway RPC (sessions.send) for message delivery');
}
/**
 * Inject a message into an OpenClaw session using the gateway RPC.
 * Note: OpenClaw currently renders these messages with sender "cli", so OGP must
 * include peer identity in the message content itself.
 */
export async function injectMessage(sessionKey, message, from) {
    const config = requireConfig();
    const gatewayToken = config.openclawToken;
    const gatewayUrl = toGatewayWsUrl(config.openclawUrl || 'https://localhost:18789');
    if (!gatewayToken) {
        console.error('[OGP Bridge] OpenClaw gateway token not configured');
        return false;
    }
    try {
        const { stdout, stderr } = await execFileAsync('openclaw', [
            'gateway',
            'call',
            '--token',
            gatewayToken,
            '--url',
            gatewayUrl,
            '--params',
            JSON.stringify({ key: sessionKey, message }),
            '--json',
            'sessions.send'
        ], {
            timeout: 10_000,
            maxBuffer: 1024 * 1024
        });
        const response = extractJsonObject(stdout);
        const ok = Boolean(response && (response.runId || response.status === 'started' || response.messageSeq));
        if (!ok) {
            console.error('[OGP Bridge] sessions.send returned unexpected output:', stdout.trim() || stderr.trim());
            return false;
        }
        console.log('[OGP Bridge] Message delivered via sessions.send:', sessionKey, from ? `from ${from}` : '', message.substring(0, 100));
        return true;
    }
    catch (err) {
        console.error('[OGP Bridge] sessions.send failed:', err.message || err);
        return false;
    }
}
/**
 * Disconnect bridge (no-op for RPC-based implementation)
 */
export function disconnectBridge() {
    console.log('[OGP Bridge] RPC-based bridge has no persistent connection');
}
//# sourceMappingURL=openclaw-bridge.js.map