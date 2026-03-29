/**
 * OGP Rendezvous integration
 *
 * Handles:
 *  - Detecting own public IP via api.ipify.org
 *  - Registering with the rendezvous server on startup
 *  - Heartbeat (re-register every 30s) to keep TTL alive
 *  - Deregistration on shutdown (best effort)
 *  - Peer lookup by public key
 */
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
let heartbeatTimer = null;
let registeredPubkey = null;
let activeConfig = null;
// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────
async function detectPublicIp() {
    const res = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok)
        throw new Error(`ipify returned ${res.status}`);
    const data = await res.json();
    return data.ip;
}
async function doRegister(config, pubkey, port) {
    const res = await fetch(`${config.url}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey, port, timestamp: Date.now() }),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
        throw new Error(`Rendezvous register returned ${res.status}`);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Start rendezvous registration and heartbeat.
 * Call this from server.ts after the daemon begins listening.
 */
export async function startRendezvous(config, pubkey, port) {
    if (!config.enabled)
        return;
    activeConfig = config;
    registeredPubkey = pubkey;
    // Detect public IP (informational — rendezvous server auto-detects from socket)
    let publicIp = 'unknown';
    try {
        publicIp = await detectPublicIp();
    }
    catch (err) {
        console.warn(`[OGP] Could not detect public IP: ${err.message}`);
    }
    // Initial registration
    try {
        await doRegister(config, pubkey, port);
        console.log(`[OGP] Registered with rendezvous at ${config.url} as ${pubkey.slice(0, 8)}... (IP: ${publicIp})`);
    }
    catch (err) {
        console.warn(`[OGP] Rendezvous registration failed: ${err.message}`);
        // Non-fatal — heartbeat will retry
    }
    // Start heartbeat
    heartbeatTimer = setInterval(async () => {
        if (!activeConfig)
            return;
        try {
            await doRegister(activeConfig, pubkey, port);
        }
        catch (err) {
            console.warn(`[OGP] Rendezvous heartbeat failed: ${err.message}`);
        }
    }, HEARTBEAT_INTERVAL_MS);
}
/**
 * Stop heartbeat and deregister from rendezvous (best effort).
 * Call from server.ts shutdown path.
 */
export async function stopRendezvous() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (!activeConfig || !registeredPubkey)
        return;
    try {
        await fetch(`${activeConfig.url}/peer/${encodeURIComponent(registeredPubkey)}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(5000)
        });
        console.log(`[OGP] Deregistered from rendezvous`);
    }
    catch {
        // Best effort — server TTL will clean up naturally
    }
    activeConfig = null;
    registeredPubkey = null;
}
/**
 * Look up a peer by public key in the rendezvous server.
 * Returns the peer URL (http://ip:port) or null if not found.
 */
export async function lookupPeer(config, pubkey) {
    if (!config.enabled)
        return null;
    try {
        const res = await fetch(`${config.url}/peer/${encodeURIComponent(pubkey)}`, {
            signal: AbortSignal.timeout(8000)
        });
        if (res.status === 404)
            return null;
        if (!res.ok)
            throw new Error(`Rendezvous lookup returned ${res.status}`);
        const data = await res.json();
        return `http://${data.ip}:${data.port}`;
    }
    catch (err) {
        console.warn(`[OGP] Rendezvous lookup failed: ${err.message}`);
        return null;
    }
}
//# sourceMappingURL=rendezvous.js.map