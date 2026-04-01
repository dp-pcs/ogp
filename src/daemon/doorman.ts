/**
 * OGP Doorman - Runtime scope enforcement and rate limiting
 *
 * The doorman sits at Layer 3 of the scope model:
 * Layer 1: Gateway Capabilities - What I CAN support
 * Layer 2: Peer Negotiation - What I WILL grant YOU
 * Layer 3: Runtime Enforcement - Is THIS request within YOUR granted scope (doorman)
 */

import { getPeer, getPeerByPublicKey, type Peer } from './peers.js';
import {
  type ScopeBundle,
  type ScopeGrant,
  type RateLimit,
  DEFAULT_V1_SCOPES,
  DEFAULT_RATE_LIMIT,
  findScopeGrant,
  scopeCoversIntent
} from './scopes.js';

export interface DoormanResult {
  allowed: boolean;
  reason?: string;
  statusCode?: number;      // HTTP status code to return
  retryAfter?: number;      // Seconds until retry (for 429)
  isV1Peer?: boolean;       // True if using legacy mode
}

interface RateLimitEntry {
  timestamps: number[];     // Request timestamps within window
  windowStart: number;      // Window start time
}

// In-memory rate limit tracking
// Key format: "peerId:intent"
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic cleanup of expired rate limit entries
 */
export function startDoormanCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the periodic cleanup
 */
export function stopDoormanCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries with no recent activity (> 1 hour old)
    if (now - entry.windowStart > 3600 * 1000) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check if a request from a peer is allowed
 *
 * @param peerId - The peer making the request
 * @param intent - The intent being requested
 * @param payload - Optional payload with topic for agent-comms
 * @returns DoormanResult indicating if request is allowed
 */
export function checkAccess(
  peerId: string,
  intent: string,
  payload?: { topic?: string }
): DoormanResult {
  // BUILD-111: Check by public key prefix if peerId looks like one
  let peer = getPeer(peerId);
  if (!peer && peerId.length >= 16) {
    peer = getPeerByPublicKey(peerId);
  }
  
  if (!peer) {
    return {
      allowed: false,
      reason: 'Unknown peer',
      statusCode: 403
    };
  }

  if (peer.status !== 'approved') {
    return {
      allowed: false,
      reason: 'Peer not approved',
      statusCode: 403
    };
  }

  // 2. Determine scope bundle to use
  // Priority: grantedScopes takes precedence over protocolVersion
  let scopeBundle: ScopeBundle;
  let isV1Peer = false;

  if (peer.grantedScopes) {
    // Use negotiated scopes if they exist
    scopeBundle = peer.grantedScopes;
    isV1Peer = !peer.protocolVersion || peer.protocolVersion === '0.1.0';
  } else {
    // No scope negotiation done - fall back to v0.1 defaults
    isV1Peer = true;
    scopeBundle = DEFAULT_V1_SCOPES;
  }

  // 3. Find scope grant for this intent
  const grant = findScopeGrant(scopeBundle, intent);
  if (!grant) {
    return {
      allowed: false,
      reason: `Intent '${intent}' not in granted scope`,
      statusCode: 403,
      isV1Peer
    };
  }

  // 4. Check if scope covers this specific request (including topic)
  const topic = payload?.topic;
  if (!scopeCoversIntent(grant, intent, topic)) {
    if (topic && grant.topics && grant.topics.length > 0) {
      return {
        allowed: false,
        reason: `Topic '${topic}' not allowed for intent '${intent}'`,
        statusCode: 403,
        isV1Peer
      };
    }
    return {
      allowed: false,
      reason: `Intent '${intent}' scope check failed`,
      statusCode: 403,
      isV1Peer
    };
  }

  // 5. Check rate limit
  const rateLimit = grant.rateLimit || DEFAULT_RATE_LIMIT;
  const rateLimitResult = checkRateLimit(peerId, intent, rateLimit);
  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      reason: `Rate limit exceeded for intent '${intent}'`,
      statusCode: 429,
      retryAfter: rateLimitResult.retryAfter,
      isV1Peer
    };
  }

  // 6. All checks passed
  return {
    allowed: true,
    isV1Peer
  };
}

/**
 * Check and update rate limit for a peer+intent combination
 */
function checkRateLimit(
  peerId: string,
  intent: string,
  limit: RateLimit
): { allowed: boolean; retryAfter?: number } {
  const key = `${peerId}:${intent}`;
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;

  let entry = rateLimitStore.get(key);

  if (!entry) {
    // First request - create entry
    entry = {
      timestamps: [now],
      windowStart: now
    };
    rateLimitStore.set(key, entry);
    return { allowed: true };
  }

  // Filter out timestamps outside the sliding window
  const windowStart = now - windowMs;
  entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
  entry.windowStart = windowStart;

  // Check if we're at the limit
  if (entry.timestamps.length >= limit.requests) {
    // Calculate when the oldest request will expire
    const oldestInWindow = Math.min(...entry.timestamps);
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return {
      allowed: false,
      retryAfter: Math.max(1, retryAfter)
    };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Get current rate limit status for a peer+intent
 */
export function getRateLimitStatus(
  peerId: string,
  intent: string,
  limit: RateLimit
): { used: number; remaining: number; windowSeconds: number } {
  const key = `${peerId}:${intent}`;
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;

  const entry = rateLimitStore.get(key);
  if (!entry) {
    return {
      used: 0,
      remaining: limit.requests,
      windowSeconds: limit.windowSeconds
    };
  }

  // Filter to current window
  const windowStart = now - windowMs;
  const recentTimestamps = entry.timestamps.filter(ts => ts > windowStart);

  return {
    used: recentTimestamps.length,
    remaining: Math.max(0, limit.requests - recentTimestamps.length),
    windowSeconds: limit.windowSeconds
  };
}

/**
 * Reset rate limit for a specific peer+intent (for testing)
 */
export function resetRateLimit(peerId: string, intent: string): void {
  const key = `${peerId}:${intent}`;
  rateLimitStore.delete(key);
}

/**
 * Reset all rate limits (for testing)
 */
export function resetAllRateLimits(): void {
  rateLimitStore.clear();
}
