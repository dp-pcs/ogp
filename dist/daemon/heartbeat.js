import { listPeers, updatePeer, derivePeerIdFromPublicKey, deriveFederationState } from './peers.js';
import { loadConfig } from '../shared/config.js';
import { getPublicKey } from './keypair.js';
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
 * Derive directional health state from local data alone (Issue #3) plus, when
 * available, the authoritative inbound report from the peer (Issue #5).
 *
 * Pure function — exported for testing.
 *
 * Resolution order for the inbound side:
 *   1. `inboundHealthReport` if recent — authoritative (the peer told us
 *      whether they can reach us).
 *   2. `lastInboundContactAt` recency — inferred from cryptographically
 *      attributed inbound traffic.
 *   3. No inbound signal at all — fall back to outbound-only.
 *
 * @param peer       The peer being evaluated.
 * @param now        Current time in ms since epoch.
 * @param recencyMs  Threshold beyond which inbound signals count as stale.
 *                   Typically `intervalMs * recencyMultiplier`.
 */
export function deriveHealthState(peer, now, recencyMs) {
    const outboundOk = peer.healthy !== false;
    // Issue #5: prefer the authoritative report when it's recent.
    if (peer.inboundHealthReport) {
        const reportAge = now - new Date(peer.inboundHealthReport.receivedAt).getTime();
        if (reportAge >= 0 && reportAge < recencyMs) {
            const inboundOk = peer.inboundHealthReport.healthy;
            if (outboundOk && inboundOk)
                return 'established';
            if (outboundOk && !inboundOk)
                return 'degraded-inbound';
            if (!outboundOk && inboundOk)
                return 'degraded-outbound';
            return 'down';
        }
    }
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
function buildFederationStateReason(newState, prevFailures, nextFailures) {
    const failures = nextFailures ?? prevFailures ?? 0;
    switch (newState) {
        case 'established': return failures === 0 ? 'outbound + inbound healthy' : 'failures cleared';
        case 'degraded': return `outbound failures: ${failures}`;
        case 'down': return failures > 0 ? `${failures} consecutive failures` : 'no recent contact';
        case 'twoWay': return 'awaiting first bidirectional health check';
        default: return '';
    }
}
function getLocalPeerId() {
    try {
        return derivePeerIdFromPublicKey(getPublicKey());
    }
    catch {
        // Keypair may be unavailable in some test/setup paths — degrade silently.
        return null;
    }
}
/**
 * Check if a single peer is healthy by fetching their /.well-known/ogp endpoint.
 *
 * Issue #5: sends X-OGP-Peer-ID so the responder can include their view of our
 * health in `peerStatus`, parsed and returned alongside the boolean reachability.
 */
async function checkPeerHealth(peer) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), activeConfig.timeoutMs);
        const headers = {
            'User-Agent': 'OGP-Heartbeat/1.0'
        };
        const localPeerId = getLocalPeerId();
        if (localPeerId) {
            headers['X-OGP-Peer-ID'] = localPeerId;
            // SECURITY (F-12): Sign the peer-id assertion with our private key so
            // the responder can verify we actually own this peerId before exposing
            // their view of our health. Unsigned X-OGP-Peer-ID was a topology probe.
            try {
                const { sign } = await import('../shared/signing.js');
                const { getPrivateKey } = await import('./keypair.js');
                const timestamp = new Date().toISOString();
                const message = JSON.stringify({ peerId: localPeerId, timestamp });
                headers['X-OGP-Timestamp'] = timestamp;
                headers['X-OGP-Signature'] = sign(message, getPrivateKey());
            }
            catch {
                // If keypair is unavailable just send the unsigned peer-id; responder
                // will fall through to the unauthenticated discovery path.
            }
        }
        const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`, {
            signal: controller.signal,
            headers
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return { reachable: false };
        }
        let peerStatus;
        try {
            const body = await response.json();
            if (body && body.peerStatus && typeof body.peerStatus === 'object' && typeof body.peerStatus.healthy === 'boolean') {
                peerStatus = {
                    healthy: body.peerStatus.healthy,
                    healthState: body.peerStatus.healthState,
                    lastCheckedAt: body.peerStatus.lastCheckedAt ?? undefined,
                    lastCheckFailedAt: body.peerStatus.lastCheckFailedAt ?? undefined,
                    healthCheckFailures: typeof body.peerStatus.healthCheckFailures === 'number'
                        ? body.peerStatus.healthCheckFailures
                        : undefined
                };
            }
        }
        catch {
            // Non-JSON or malformed body — peer reachable but no peerStatus available.
        }
        return { reachable: true, peerStatus };
    }
    catch {
        // Network errors, timeouts, etc. = unhealthy
        return { reachable: false };
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
        const result = await checkPeerHealth(peer);
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const nowMs = nowDate.getTime();
        let nextHealthy;
        let updates;
        let nextInboundReport = peer.inboundHealthReport;
        if (result.reachable) {
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
            // Issue #5: store the authoritative inbound report when the peer
            // returned one (i.e. they recognised our X-OGP-Peer-ID).
            if (result.peerStatus) {
                const previous = peer.inboundHealthReport;
                nextInboundReport = {
                    healthy: result.peerStatus.healthy,
                    healthState: result.peerStatus.healthState,
                    lastCheckedAt: result.peerStatus.lastCheckedAt,
                    lastCheckFailedAt: result.peerStatus.lastCheckFailedAt,
                    healthCheckFailures: result.peerStatus.healthCheckFailures,
                    receivedAt: now
                };
                updates.inboundHealthReport = nextInboundReport;
                if (!previous || previous.healthy !== nextInboundReport.healthy) {
                    console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}): inbound report = ${nextInboundReport.healthy ? 'healthy' : 'unhealthy'} (peer's view of us)`);
                }
            }
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
        // Issues #3 + #5: derive directional health state from the post-update view of the peer.
        const newState = deriveHealthState({
            healthy: nextHealthy,
            lastInboundContactAt: peer.lastInboundContactAt,
            inboundHealthReport: nextInboundReport
        }, nowMs, recencyMs);
        if (newState !== peer.healthState) {
            console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}): healthState ${peer.healthState ?? 'unknown'} → ${newState}`);
            updates.healthState = newState;
            updates.healthStateChangedAt = now;
        }
        // Issue #4: derive lifecycle federationState from the post-update view.
        const newFederationState = deriveFederationState({
            status: peer.status,
            healthState: newState,
            lastOutboundCheckAt: result.reachable ? now : peer.lastOutboundCheckAt,
            lastOutboundCheckFailedAt: result.reachable ? peer.lastOutboundCheckFailedAt : now,
            lastInboundContactAt: peer.lastInboundContactAt,
            inboundHealthReport: nextInboundReport
        });
        if (newFederationState !== peer.federationState) {
            const reason = buildFederationStateReason(newFederationState, peer.healthCheckFailures, updates.healthCheckFailures);
            console.log(`[OGP Federation] ${peer.displayName} (${peer.id}): ${peer.federationState ?? 'unknown'} → ${newFederationState}${reason ? ` (${reason})` : ''}`);
            updates.federationState = newFederationState;
            updates.federationStateChangedAt = now;
            if (reason)
                updates.federationStateReason = reason;
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