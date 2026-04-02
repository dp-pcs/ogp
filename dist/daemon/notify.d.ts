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
}
export declare function notifyOpenClaw(payload: NotificationPayload): Promise<boolean>;
//# sourceMappingURL=notify.d.ts.map