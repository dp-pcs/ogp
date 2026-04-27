/**
 * OGP Reply Handler - Async reply mechanism for federation messages
 *
 * Supports two patterns:
 * 1. Callback: Sender provides replyTo URL, we POST the reply there
 * 2. Polling: We store the reply, sender polls GET /federation/reply/:nonce
 */
import { signObject } from '../shared/signing.js';
import { getPrivateKey } from './keypair.js';
import { requireConfig } from '../shared/config.js';
// In-memory reply store (keyed by nonce)
const pendingReplies = new Map();
// Max replies to keep in memory
const MAX_PENDING_REPLIES = 1000;
// Reply TTL (10 minutes)
const REPLY_TTL_MS = 10 * 60 * 1000;
// Cleanup interval (1 minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupTimer = null;
/**
 * Start periodic cleanup of expired replies
 */
export function startReplyCleanup() {
    if (cleanupTimer)
        return;
    cleanupTimer = setInterval(cleanupExpiredReplies, CLEANUP_INTERVAL_MS);
}
/**
 * Stop periodic cleanup
 */
export function stopReplyCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}
/**
 * Clean up expired replies
 */
function cleanupExpiredReplies() {
    const now = Date.now();
    for (const [nonce, reply] of pendingReplies.entries()) {
        const storedAt = new Date(reply.storedAt).getTime();
        if (now - storedAt > REPLY_TTL_MS) {
            pendingReplies.delete(nonce);
        }
    }
}
/**
 * Store a reply for later retrieval via polling
 */
export function storePendingReply(nonce, reply) {
    // Enforce max size by removing oldest entries
    if (pendingReplies.size >= MAX_PENDING_REPLIES) {
        const oldest = Array.from(pendingReplies.entries())
            .sort((a, b) => new Date(a[1].storedAt).getTime() - new Date(b[1].storedAt).getTime())
            .slice(0, 100);
        for (const [key] of oldest) {
            pendingReplies.delete(key);
        }
    }
    pendingReplies.set(nonce, {
        ...reply,
        storedAt: new Date().toISOString(),
        retrieved: false
    });
}
/**
 * Get a pending reply by nonce
 */
export function getPendingReply(nonce) {
    const reply = pendingReplies.get(nonce);
    if (!reply)
        return null;
    // Mark as retrieved but keep in store briefly
    reply.retrieved = true;
    return reply;
}
/**
 * Delete a pending reply (after retrieval)
 */
export function deletePendingReply(nonce) {
    return pendingReplies.delete(nonce);
}
/**
 * Check if a reply exists
 */
export function hasReply(nonce) {
    return pendingReplies.has(nonce);
}
/**
 * Send a reply to a callback URL
 *
 * @param peerId - The peer to reply to (for logging)
 * @param replyToUrl - The URL to POST the reply to
 * @param payload - The reply payload
 * @returns Success status and any error
 */
export async function sendReply(peerId, replyToUrl, payload) {
    const config = requireConfig();
    const ourId = `${new URL(config.gatewayUrl).hostname}:${config.daemonPort}`;
    // Sign the reply
    const signedReply = {
        ...payload,
        from: ourId,
        to: peerId
    };
    const { payload: signedPayload, payloadStr: replyStr, signature } = signObject(signedReply, getPrivateKey());
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        const response = await fetch(replyToUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reply: signedPayload,
                replyStr, // F-05: raw signed bytes for exact verification
                signature
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                success: false,
                error: `Reply callback failed: ${response.status} ${response.statusText} - ${text}`
            };
        }
        console.log(`[OGP] Reply sent to ${peerId} via callback`);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[OGP] Failed to send reply to ${replyToUrl}:`, message);
        return {
            success: false,
            error: `Reply callback failed: ${message}`
        };
    }
}
/**
 * Create a reply payload
 */
export function createReply(nonce, success, dataOrError) {
    return {
        nonce,
        success,
        ...(success ? { data: dataOrError } : { error: dataOrError }),
        timestamp: new Date().toISOString()
    };
}
/**
 * Handle sending reply via callback or storing for polling
 *
 * @param peerId - Peer to reply to
 * @param replyToUrl - Optional callback URL (if provided, POST; otherwise store)
 * @param payload - Reply payload
 */
export async function handleReply(peerId, replyToUrl, payload) {
    if (replyToUrl) {
        // Try callback first
        const result = await sendReply(peerId, replyToUrl, payload);
        if (!result.success) {
            // Callback failed - store for polling as fallback
            console.log(`[OGP] Callback failed, storing reply for polling`);
            storePendingReply(payload.nonce, payload);
        }
    }
    else {
        // No callback URL - store for polling
        storePendingReply(payload.nonce, payload);
    }
}
//# sourceMappingURL=reply-handler.js.map