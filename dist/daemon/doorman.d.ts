/**
 * OGP Doorman - Runtime scope enforcement and rate limiting
 *
 * The doorman sits at Layer 3 of the scope model:
 * Layer 1: Gateway Capabilities - What I CAN support
 * Layer 2: Peer Negotiation - What I WILL grant YOU
 * Layer 3: Runtime Enforcement - Is THIS request within YOUR granted scope (doorman)
 */
import { type RateLimit } from './scopes.js';
export interface DoormanResult {
    allowed: boolean;
    reason?: string;
    statusCode?: number;
    retryAfter?: number;
    isV1Peer?: boolean;
}
/**
 * Start the periodic cleanup of expired rate limit entries
 */
export declare function startDoormanCleanup(): void;
/**
 * Stop the periodic cleanup
 */
export declare function stopDoormanCleanup(): void;
/**
 * Check if a request from a peer is allowed
 *
 * @param peerId - The peer making the request
 * @param intent - The intent being requested
 * @param payload - Optional payload with topic for agent-comms
 * @returns DoormanResult indicating if request is allowed
 */
export declare function checkAccess(peerId: string, intent: string, payload?: {
    topic?: string;
}): DoormanResult;
/**
 * Get current rate limit status for a peer+intent
 */
export declare function getRateLimitStatus(peerId: string, intent: string, limit: RateLimit): {
    used: number;
    remaining: number;
    windowSeconds: number;
};
/**
 * Reset rate limit for a specific peer+intent (for testing)
 */
export declare function resetRateLimit(peerId: string, intent: string): void;
/**
 * Reset all rate limits (for testing)
 */
export declare function resetAllRateLimits(): void;
//# sourceMappingURL=doorman.d.ts.map