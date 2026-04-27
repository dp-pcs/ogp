import { listPeers, updatePeer } from './peers.js';
import { loadConfig } from '../shared/config.js';
let heartbeatTimer = null;
// Default values (can be overridden by config or env vars)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 10000; // 10 seconds
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3; // Mark unhealthy after 3 consecutive failures
const DEFAULT_RECENCY_MULTIPLIER = 2; // Issue #3: "recent" = 2× heartbeat interval
// Active configuration (resolved from defaults, config file, and env vars)
let activeConfig = {
    intervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    timeoutMs: DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
    maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
    recencyMultiplier: DEFAULT_RECENCY_MULTIPLIER
};
/**
 * Derive directional health state from local data alone (Issue #3).
 *
 * Pure function — exported for testing.
 *
 * @param peer       The peer being evaluated. Must contain at least the fields
 *                   the health-check loop populates.
 * @param now        Current time in ms since epoch.
 * @param recencyMs  Threshold beyond which lastInboundContactAt counts as stale.
 *                   Typically `intervalMs * recencyMultiplier`.
 */
export function deriveHealthState(peer, now, recencyMs) {
    const outboundOk = peer.healthy !== false;
    if (!peer.lastInboundContactAt) {
        // No inbound history yet — fall back to the legacy outbound-only judgment to
        // avoid flagging fresh peers as `degraded-inbound` indefinitely.
        return outboundOk ? 'established' : 'down';
    }
    const inboundAge = now - new Date(peer.lastInboundContactAt).getTime();
    const inboundRecent = inboundAge >= 0 && inboundAge < recencyMs;
    if (outboundOk && inboundRecent)
        return 'established';
    if (outboundOk && !inboundRecent)
        return 'degraded-inbound';
    if (!outboundOk && inboundRecent)
        return 'degraded-outbound';
    return 'down';
}
/**
 * Load health check configuration from config file and environment variables.
 * Priority: ENV > config file > defaults
 */
export function loadHealthCheckConfig() {
    const config = loadConfig();
    const configHealthCheck = config?.healthCheck || {};
    // Start with defaults
    let intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
    let timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
    let maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES;
    let recencyMultiplier = DEFAULT_RECENCY_MULTIPLIER;
    // Apply config file values
    if (configHealthCheck.intervalMs !== undefined) {
        intervalMs = configHealthCheck.intervalMs;
    }
    if (configHealthCheck.timeoutMs !== undefined) {
        timeoutMs = configHealthCheck.timeoutMs;
    }
    if (configHealthCheck.maxConsecutiveFailures !== undefined) {
        maxConsecutiveFailures = configHealthCheck.maxConsecutiveFailures;
    }
    if (configHealthCheck.recencyMultiplier !== undefined) {
        recencyMultiplier = configHealthCheck.recencyMultiplier;
    }
    // Apply environment variable overrides (highest priority)
    if (process.env.OGP_HEARTBEAT_INTERVAL_MS) {
        intervalMs = parseInt(process.env.OGP_HEARTBEAT_INTERVAL_MS, 10);
    }
    if (process.env.OGP_HEARTBEAT_TIMEOUT_MS) {
        timeoutMs = parseInt(process.env.OGP_HEARTBEAT_TIMEOUT_MS, 10);
    }
    if (process.env.OGP_HEARTBEAT_MAX_FAILURES) {
        maxConsecutiveFailures = parseInt(process.env.OGP_HEARTBEAT_MAX_FAILURES, 10);
    }
    if (process.env.OGP_HEARTBEAT_RECENCY_MULTIPLIER) {
        recencyMultiplier = parseFloat(process.env.OGP_HEARTBEAT_RECENCY_MULTIPLIER);
    }
    activeConfig = { intervalMs, timeoutMs, maxConsecutiveFailures, recencyMultiplier };
}
/**
 * Check if a single peer is healthy by fetching their /.well-known/ogp endpoint
 */
async function checkPeerHealth(peer) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), activeConfig.timeoutMs);
        const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'OGP-Heartbeat/1.0'
            }
        });
        clearTimeout(timeoutId);
        // Consider any 2xx response as healthy
        return response.ok;
    }
    catch (error) {
        // Network errors, timeouts, etc. = unhealthy
        return false;
    }
}
/**
 * Run health checks on all approved peers
 */
async function runHealthChecks() {
    const peers = listPeers('approved');
    if (peers.length === 0) {
        return;
    }
    console.log(`[OGP Heartbeat] Checking health of ${peers.length} peer(s)...`);
    const recencyMs = activeConfig.intervalMs * activeConfig.recencyMultiplier;
    // Check all peers in parallel
    const healthCheckPromises = peers.map(async (peer) => {
        const isHealthy = await checkPeerHealth(peer);
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const nowMs = nowDate.getTime();
        let nextHealthy;
        let updates;
        if (isHealthy) {
            if (peer.healthy === false) {
                console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) is now healthy`);
            }
            nextHealthy = true;
            updates = {
                lastSeenAt: now,
                lastOutboundCheckAt: now,
                healthy: true,
                healthCheckFailures: 0
            };
        }
        else {
            const failures = (peer.healthCheckFailures || 0) + 1;
            const wasHealthy = peer.healthy !== false;
            const isNowUnhealthy = failures >= activeConfig.maxConsecutiveFailures;
            if (wasHealthy && isNowUnhealthy) {
                console.warn(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) marked as unhealthy after ${failures} consecutive failures`);
            }
            nextHealthy = isNowUnhealthy ? false : peer.healthy !== false;
            updates = {
                lastOutboundCheckFailedAt: now,
                healthy: isNowUnhealthy ? false : peer.healthy,
                healthCheckFailures: failures
            };
        }
        // Issue #3: derive directional health state from the post-update view of the peer.
        const newState = deriveHealthState({ healthy: nextHealthy, lastInboundContactAt: peer.lastInboundContactAt }, nowMs, recencyMs);
        if (newState !== peer.healthState) {
            console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}): healthState ${peer.healthState ?? 'unknown'} → ${newState}`);
            updates.healthState = newState;
            updates.healthStateChangedAt = now;
        }
        updatePeer(peer.id, updates);
    });
    await Promise.allSettled(healthCheckPromises);
    console.log(`[OGP Heartbeat] Health check completed`);
    // Cleanup expired resync snapshots (older than 7 days)
    cleanupExpiredSnapshots();
}
/**
 * Remove expired resync snapshots from peers
 */
function cleanupExpiredSnapshots() {
    const peers = listPeers();
    const now = Date.now();
    let cleanedCount = 0;
    for (const peer of peers) {
        if (peer.resyncSnapshot) {
            const expiresAt = new Date(peer.resyncSnapshot.expiresAt).getTime();
            if (now > expiresAt) {
                updatePeer(peer.id, { resyncSnapshot: undefined });
                cleanedCount++;
                console.log(`[OGP Heartbeat] Cleaned up expired resync snapshot for ${peer.displayName}`);
            }
        }
    }
    if (cleanedCount > 0) {
        console.log(`[OGP Heartbeat] Cleaned up ${cleanedCount} expired resync snapshot(s)`);
    }
}
/**
 * Start the periodic heartbeat timer
 */
export function startHeartbeat() {
    if (heartbeatTimer) {
        console.warn('[OGP Heartbeat] Heartbeat already running');
        return;
    }
    // Load configuration (config file + env vars)
    loadHealthCheckConfig();
    console.log(`[OGP Heartbeat] Starting heartbeat (interval: ${activeConfig.intervalMs / 1000}s, timeout: ${activeConfig.timeoutMs / 1000}s, max failures: ${activeConfig.maxConsecutiveFailures})`);
    // Run initial health check after a short delay (30 seconds) to avoid startup congestion
    setTimeout(() => {
        runHealthChecks().catch((error) => {
            console.error('[OGP Heartbeat] Error during initial health check:', error);
        });
    }, 30000);
    // Then run periodically
    heartbeatTimer = setInterval(() => {
        runHealthChecks().catch((error) => {
            console.error('[OGP Heartbeat] Error during health check:', error);
        });
    }, activeConfig.intervalMs);
}
/**
 * Stop the periodic heartbeat timer
 */
export function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        console.log('[OGP Heartbeat] Heartbeat stopped');
    }
}
/**
 * Get heartbeat configuration
 */
export function getHeartbeatConfig() {
    return {
        ...activeConfig,
        isRunning: heartbeatTimer !== null
    };
}
/**
 * Manually trigger a health check (for testing/debugging)
 */
export async function triggerHealthCheck() {
    await runHealthChecks();
}
//# sourceMappingURL=heartbeat.js.map