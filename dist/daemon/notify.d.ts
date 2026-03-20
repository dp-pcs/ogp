export interface NotificationPayload {
    text: string;
    sessionKey?: string;
    metadata?: Record<string, any>;
}
export declare function notifyOpenClaw(payload: NotificationPayload): Promise<boolean>;
//# sourceMappingURL=notify.d.ts.map