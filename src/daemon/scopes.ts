/**
 * OGP v0.2.0 Scope Types
 *
 * Three-layer model:
 * Layer 1: Gateway Capabilities - What I CAN support (advertised globally)
 * Layer 2: Peer Negotiation - What I WILL grant YOU (per-peer, during approval)
 * Layer 3: Runtime Enforcement - Is THIS request within YOUR granted scope (doorman)
 */

export interface RateLimit {
  requests: number;     // Max requests allowed
  windowSeconds: number; // Time window in seconds
}

export interface ScopeGrant {
  intent: string;                    // e.g., "agent-comms", "message"
  enabled: boolean;
  rateLimit?: RateLimit;
  topics?: string[];                 // For agent-comms: allowed topic prefixes
  expiresAt?: string;                // ISO timestamp for optional expiration
}

export interface ScopeBundle {
  version: "0.2.0";
  grantedAt: string;                 // ISO timestamp
  scopes: ScopeGrant[];
}

/**
 * Default scopes granted to v0.1 peers (backward compatibility)
 */
export const DEFAULT_V1_SCOPES: ScopeBundle = {
  version: "0.2.0",
  grantedAt: new Date().toISOString(),
  scopes: [
    {
      intent: "message",
      enabled: true,
      rateLimit: { requests: 100, windowSeconds: 3600 }
    },
    {
      intent: "task-request",
      enabled: true,
      rateLimit: { requests: 100, windowSeconds: 3600 }
    },
    {
      intent: "status-update",
      enabled: true,
      rateLimit: { requests: 100, windowSeconds: 3600 }
    }
  ]
};

/**
 * Default rate limit for all intents
 */
export const DEFAULT_RATE_LIMIT: RateLimit = {
  requests: 100,
  windowSeconds: 3600
};

/**
 * Parse a rate limit string like "100/3600" or "10/60"
 */
export function parseRateLimit(rateStr: string): RateLimit | null {
  const match = rateStr.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  return {
    requests: parseInt(match[1], 10),
    windowSeconds: parseInt(match[2], 10)
  };
}

/**
 * Format a rate limit as string like "100/3600"
 */
export function formatRateLimit(limit: RateLimit): string {
  return `${limit.requests}/${limit.windowSeconds}`;
}

/**
 * Create a scope grant from CLI options
 */
export function createScopeGrant(
  intent: string,
  options: {
    enabled?: boolean;
    rateLimit?: RateLimit;
    topics?: string[];
    expiresAt?: string;
  } = {}
): ScopeGrant {
  return {
    intent,
    enabled: options.enabled ?? true,
    ...(options.rateLimit && { rateLimit: options.rateLimit }),
    ...(options.topics && { topics: options.topics }),
    ...(options.expiresAt && { expiresAt: options.expiresAt })
  };
}

/**
 * Create a scope bundle from an array of scope grants
 */
export function createScopeBundle(scopes: ScopeGrant[]): ScopeBundle {
  return {
    version: "0.2.0",
    grantedAt: new Date().toISOString(),
    scopes
  };
}

/**
 * Check if a scope grant covers a specific intent and topic
 */
export function scopeCoversIntent(
  grant: ScopeGrant,
  intent: string,
  topic?: string
): boolean {
  if (grant.intent !== intent) return false;
  if (!grant.enabled) return false;

  // Check expiration
  if (grant.expiresAt) {
    const expiry = new Date(grant.expiresAt);
    if (expiry < new Date()) return false;
  }

  // For agent-comms, check topic restriction
  if (intent === 'agent-comms' && grant.topics && grant.topics.length > 0) {
    if (!topic) return false;
    // Check if topic matches any allowed prefix
    const topicMatches = grant.topics.some(allowed =>
      topic === allowed || topic.startsWith(allowed + '/')
    );
    if (!topicMatches) return false;
  }

  return true;
}

/**
 * Find a scope grant for a specific intent in a bundle
 */
export function findScopeGrant(
  bundle: ScopeBundle | undefined,
  intent: string
): ScopeGrant | null {
  if (!bundle) return null;
  return bundle.scopes.find(s => s.intent === intent && s.enabled) || null;
}
