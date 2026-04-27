import { type Peer } from './peers.js';
export type HealthState = NonNullable<Peer['healthState']>;
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
export declare function deriveHealthState(peer: Pick<Peer, 'healthy' | 'lastInboundContactAt'>, now: number, recencyMs: number): HealthState;
/**
 * Load health check configuration from config file and environment variables.
 * Priority: ENV > config file > defaults
 */
export declare function loadHealthCheckConfig(): void;
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