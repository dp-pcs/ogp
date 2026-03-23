/**
 * OGP Reply Handler - Async reply mechanism for federation messages
 *
 * Supports two patterns:
 * 1. Callback: Sender provides replyTo URL, we POST the reply there
 * 2. Polling: We store the reply, sender polls GET /federation/reply/:nonce
 */
export interface ReplyPayload {
    nonce: string;
    success: boolean;
    data?: any;
    error?: string;
    timestamp: string;
}
export interface StoredReply extends ReplyPayload {
    storedAt: string;
    retrieved: boolean;
}
/**
 * Start periodic cleanup of expired replies
 */
export declare function startReplyCleanup(): void;
/**
 * Stop periodic cleanup
 */
export declare function stopReplyCleanup(): void;
/**
 * Store a reply for later retrieval via polling
 */
export declare function storePendingReply(nonce: string, reply: ReplyPayload): void;
/**
 * Get a pending reply by nonce
 */
export declare function getPendingReply(nonce: string): StoredReply | null;
/**
 * Delete a pending reply (after retrieval)
 */
export declare function deletePendingReply(nonce: string): boolean;
/**
 * Check if a reply exists
 */
export declare function hasReply(nonce: string): boolean;
/**
 * Send a reply to a callback URL
 *
 * @param peerId - The peer to reply to (for logging)
 * @param replyToUrl - The URL to POST the reply to
 * @param payload - The reply payload
 * @returns Success status and any error
 */
export declare function sendReply(peerId: string, replyToUrl: string, payload: ReplyPayload): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Create a reply payload
 */
export declare function createReply(nonce: string, success: boolean, dataOrError?: any): ReplyPayload;
/**
 * Handle sending reply via callback or storing for polling
 *
 * @param peerId - Peer to reply to
 * @param replyToUrl - Optional callback URL (if provided, POST; otherwise store)
 * @param payload - Reply payload
 */
export declare function handleReply(peerId: string, replyToUrl: string | undefined, payload: ReplyPayload): Promise<void>;
//# sourceMappingURL=reply-handler.d.ts.map