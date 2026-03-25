export declare function federationList(status?: 'pending' | 'approved' | 'rejected'): Promise<void>;
export declare function federationRequest(peerUrl: string, peerId: string): Promise<void>;
export interface ApproveOptions {
    intents?: string[];
    rate?: string;
    topics?: string[];
}
export declare function federationApprove(peerId: string, options?: ApproveOptions): Promise<void>;
export declare function federationReject(peerId: string): Promise<void>;
export declare function federationSend(peerId: string, intent: string, payloadJson: string): Promise<any | null>;
/**
 * Show scope grants for a peer
 */
export declare function federationShowScopes(peerId: string): Promise<void>;
/**
 * Update scope grants for an existing peer
 */
export declare function federationUpdateGrants(peerId: string, options: ApproveOptions): Promise<void>;
/**
 * Send an agent-comms message to a peer
 */
export declare function federationSendAgentComms(peerId: string, topic: string, messageText: string, options?: {
    priority?: 'low' | 'normal' | 'high';
    conversationId?: string;
    waitForReply?: boolean;
    replyTimeout?: number;
}): Promise<void>;
//# sourceMappingURL=federation.d.ts.map