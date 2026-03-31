export declare function federationList(status?: 'pending' | 'approved' | 'rejected'): Promise<void>;
export declare function federationRequest(peerUrl: string, peerId: string): Promise<boolean>;
export interface ApproveOptions {
    intents?: string[];
    rate?: string;
    topics?: string[];
}
export declare function federationApprove(peerId: string, options?: ApproveOptions): Promise<void>;
export declare function federationReject(peerId: string): Promise<void>;
export declare function federationRemove(peerId: string): Promise<void>;
export declare function federationSend(peerId: string, intent: string, payloadJson: string, timeoutMs?: number): Promise<any | null>;
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
/**
 * Generate a federation invite token via the rendezvous server.
 *
 * Usage: ogp federation invite
 *
 * POSTs our pubkey + port to {rendezvous.url}/invite and prints the
 * resulting short token so we can share it with a peer.
 */
export declare function federationInvite(): Promise<void>;
/**
 * Accept a federation invite token from a peer.
 *
 * Usage: ogp federation accept <token>
 *
 * Looks up the token on the rendezvous server, then auto-connects using
 * the returned ip:port + pubkey.
 */
export declare function federationAccept(token: string): Promise<void>;
/**
 * Connect to a peer by public key using rendezvous server discovery.
 *
 * Usage: ogp federation connect <pubkey>
 *
 * Looks up the peer URL from the rendezvous server, then sends a
 * federation request to that URL.
 */
export declare function federationConnect(pubkey: string): Promise<void>;
//# sourceMappingURL=federation.d.ts.map