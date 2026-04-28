export interface FederationMessage {
    intent: string;
    from: string;
    to: string;
    /**
     * B0032 v0.7.0 — Optional persona-targeting field. Routes the message to a
     * specific addressable agent persona within the receiving gateway.
     * Undefined / omitted / empty → route to primary persona (back-compat with
     * pre-v0.7 peers). Mismatching id → P3 returns 404 unknown-agent.
     * Routing logic lives in P3, not yet wired. Wire format only at P2.
     */
    toAgent?: string;
    nonce: string;
    timestamp: string;
    payload: any;
    replyTo?: string;
    conversationId?: string;
    projectId?: string;
}
export interface MessageResponse {
    success: boolean;
    nonce: string;
    response?: any;
    error?: string;
    statusCode?: number;
    retryAfter?: number;
}
export declare function handleMessage(message: FederationMessage, signature: string, messageStr?: string): Promise<MessageResponse>;
//# sourceMappingURL=message-handler.d.ts.map