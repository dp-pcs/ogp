/**
 * OGP v0.2.0 Scope Types
 *
 * Three-layer model:
 * Layer 1: Gateway Capabilities - What I CAN support (advertised globally)
 * Layer 2: Peer Negotiation - What I WILL grant YOU (per-peer, during approval)
 * Layer 3: Runtime Enforcement - Is THIS request within YOUR granted scope (doorman)
 */
export interface RateLimit {
    requests: number;
    windowSeconds: number;
}
export interface ScopeGrant {
    intent: string;
    enabled: boolean;
    rateLimit?: RateLimit;
    topics?: string[];
    expiresAt?: string;
}
export interface ScopeBundle {
    version: "0.2.0";
    grantedAt: string;
    scopes: ScopeGrant[];
}
/**
 * Default scopes granted to v0.1 peers (backward compatibility)
 */
export declare const DEFAULT_V1_SCOPES: ScopeBundle;
/**
 * Default rate limit for all intents
 */
export declare const DEFAULT_RATE_LIMIT: RateLimit;
/**
 * Parse a rate limit string like "100/3600" or "10/60"
 */
export declare function parseRateLimit(rateStr: string): RateLimit | null;
/**
 * Format a rate limit as string like "100/3600"
 */
export declare function formatRateLimit(limit: RateLimit): string;
/**
 * Create a scope grant from CLI options
 */
export declare function createScopeGrant(intent: string, options?: {
    enabled?: boolean;
    rateLimit?: RateLimit;
    topics?: string[];
    expiresAt?: string;
}): ScopeGrant;
/**
 * Create a scope bundle from an array of scope grants
 */
export declare function createScopeBundle(scopes: ScopeGrant[]): ScopeBundle;
/**
 * Check if a scope grant covers a specific intent and topic
 */
export declare function scopeCoversIntent(grant: ScopeGrant, intent: string, topic?: string): boolean;
/**
 * Find a scope grant for a specific intent in a bundle
 */
export declare function findScopeGrant(bundle: ScopeBundle | undefined, intent: string): ScopeGrant | null;
//# sourceMappingURL=scopes.d.ts.map