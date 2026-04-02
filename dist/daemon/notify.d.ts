export interface NotificationPayload {
    text: string;
    sessionKey?: string;
    metadata?: Record<string, any>;
    /**
     * Target agent for routing the notification.
     * If specified, looks up notifyTargets[agent] first, then falls back to legacy notifyTarget.
     */
    agent?: string;
}
export declare function notifyOpenClaw(payload: NotificationPayload): Promise<boolean>;
//# sourceMappingURL=notify.d.ts.map