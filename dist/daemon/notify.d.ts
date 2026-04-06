export interface NotificationPayload {
    text: string;
    sessionKey?: string;
    metadata?: Record<string, any>;
    /**
     * Target agent for routing the notification.
     * If specified, looks up notifyTargets[agent] first, then falls back to legacy notifyTarget.
     */
    agent?: string;
    /**
     * Peer ID of the sender (for hook payload)
     */
    peerId?: string;
    /**
     * Intent that triggered this notification (for hook payload)
     */
    intent?: string;
    /**
     * Topic for agent-comms notifications (for hook payload)
     */
    topic?: string;
    /**
     * Display name of the peer (for Hermes integration)
     */
    peerDisplayName?: string;
    /**
     * Priority level (for Hermes integration)
     */
    priority?: 'low' | 'normal' | 'high';
    /**
     * Conversation ID for threading (for Hermes integration)
     */
    conversationId?: string;
}
export declare function notifyOpenClaw(payload: NotificationPayload): Promise<boolean>;
/**
 * Send notification to the local AI agent using the configured platform backend.
 * This is the recommended function for new code.
 *
 * @param payload Notification data including message, peer info, and metadata
 * @returns Promise<boolean> indicating success
 */
export declare function notifyLocalAgent(payload: NotificationPayload): Promise<boolean>;
//# sourceMappingURL=notify.d.ts.map