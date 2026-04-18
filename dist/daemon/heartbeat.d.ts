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
    intervalMs: number;
    timeoutMs: number;
    maxConsecutiveFailures: number;
    isRunning: boolean;
};
/**
 * Manually trigger a health check (for testing/debugging)
 */
export declare function triggerHealthCheck(): Promise<void>;
//# sourceMappingURL=heartbeat.d.ts.map