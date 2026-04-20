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
};
/**
 * Manually trigger a health check (for testing/debugging)
 */
export declare function triggerHealthCheck(): Promise<void>;
//# sourceMappingURL=heartbeat.d.ts.map