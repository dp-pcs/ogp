import { listPeers, updatePeer, type Peer } from './peers.js';

let heartbeatTimer: NodeJS.Timeout | null = null;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HEALTH_CHECK_TIMEOUT_MS = 10000; // 10 seconds
const MAX_CONSECUTIVE_FAILURES = 3; // Mark unhealthy after 3 consecutive failures

/**
 * Check if a single peer is healthy by fetching their /.well-known/ogp endpoint
 */
async function checkPeerHealth(peer: Peer): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OGP-Heartbeat/1.0'
      }
    });

    clearTimeout(timeoutId);

    // Consider any 2xx response as healthy
    return response.ok;
  } catch (error) {
    // Network errors, timeouts, etc. = unhealthy
    return false;
  }
}

/**
 * Run health checks on all approved peers
 */
async function runHealthChecks(): Promise<void> {
  const peers = listPeers('approved');

  if (peers.length === 0) {
    return;
  }

  console.log(`[OGP Heartbeat] Checking health of ${peers.length} peer(s)...`);

  // Check all peers in parallel
  const healthCheckPromises = peers.map(async (peer) => {
    const isHealthy = await checkPeerHealth(peer);
    const now = new Date().toISOString();

    if (isHealthy) {
      // Peer is healthy - reset failure count and update lastSeenAt
      if (peer.healthy === false) {
        console.log(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) is now healthy`);
      }

      updatePeer(peer.id, {
        lastSeenAt: now,
        healthy: true,
        healthCheckFailures: 0
      });
    } else {
      // Peer is unhealthy - increment failure count
      const failures = (peer.healthCheckFailures || 0) + 1;
      const wasHealthy = peer.healthy !== false;

      // Mark as unhealthy if we've reached the threshold
      const isNowUnhealthy = failures >= MAX_CONSECUTIVE_FAILURES;

      if (wasHealthy && isNowUnhealthy) {
        console.warn(`[OGP Heartbeat] Peer ${peer.displayName} (${peer.id}) marked as unhealthy after ${failures} consecutive failures`);
      }

      updatePeer(peer.id, {
        healthy: isNowUnhealthy ? false : peer.healthy,
        healthCheckFailures: failures
      });
    }
  });

  await Promise.allSettled(healthCheckPromises);
  console.log(`[OGP Heartbeat] Health check completed`);

  // Cleanup expired resync snapshots (older than 7 days)
  cleanupExpiredSnapshots();
}

/**
 * Remove expired resync snapshots from peers
 */
function cleanupExpiredSnapshots(): void {
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
export function startHeartbeat(): void {
  if (heartbeatTimer) {
    console.warn('[OGP Heartbeat] Heartbeat already running');
    return;
  }

  console.log(`[OGP Heartbeat] Starting heartbeat (interval: ${HEARTBEAT_INTERVAL_MS / 1000}s)`);

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
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the periodic heartbeat timer
 */
export function stopHeartbeat(): void {
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
    intervalMs: HEARTBEAT_INTERVAL_MS,
    timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
    isRunning: heartbeatTimer !== null
  };
}

/**
 * Manually trigger a health check (for testing/debugging)
 */
export async function triggerHealthCheck(): Promise<void> {
  await runHealthChecks();
}
