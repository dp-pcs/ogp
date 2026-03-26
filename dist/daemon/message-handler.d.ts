export interface FederationMessage {
    intent: string;
    from: string;
    to: string;
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