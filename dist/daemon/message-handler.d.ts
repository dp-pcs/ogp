export interface FederationMessage {
    intent: string;
    from: string;
    to: string;
    nonce: string;
    timestamp: string;
    payload: any;
}
export interface MessageResponse {
    success: boolean;
    nonce: string;
    response?: any;
    error?: string;
}
export declare function handleMessage(message: FederationMessage, signature: string): Promise<MessageResponse>;
//# sourceMappingURL=message-handler.d.ts.map