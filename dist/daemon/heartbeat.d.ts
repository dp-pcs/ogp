import { type Peer } from './peers.js';
export type HealthState = NonNullable<Peer['healthState']>;
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
export declare function deriveHealthState(peer: Pick<Peer, 'healthy' | 'lastInboundContactAt' | 'inboundHealthReport'>, now: number, recencyMs: number): HealthState;
/**
 * Load health check configuration from config file and environment variables.
 * Priority: ENV > config file > defaults
 */
export declare function loadHealthCheckConfig(): void;
export interface HealthCheckResult {
    reachable: boolean;
    /**
     * Issue #5: authoritative inbound report parsed from the peer's
     * /.well-known/ogp response body when they recognised our
     * X-OGP-Peer-ID header.
     */
    peerStatus?: {
        healthy: boolean;
        healthState?: Peer['healthState'];
        lastCheckedAt?: string;
        lastCheckFailedAt?: string;
        healthCheckFailures?: number;
    };
}
/**
 * Start the periodic heartbeat timer
 */
export declare function startHeartbeat(): void;
/**
 * Stop the periodic heartbeat timer
 */
export declare function stopHeartbeat(): void;
/**
 * Get heartbeat configuration
 */
export declare function getHeartbeatConfig(): {
    isRunning: boolean;
    intervalMs: number;
    timeoutMs: number;
    maxConsecutiveFailures: number;
    recencyMultiplier: number;
};
/**
 * Manually trigger a health check (for testing/debugging)
 */
export declare function triggerHealthCheck(): Promise<void>;
//# sourceMappingURL=heartbeat.d.ts.map