import { type OGPConfig } from '../shared/config.js';
type FederationCard = {
    displayName?: string;
    email?: string;
    gatewayUrl?: string;
    publicKey?: string;
};
export declare function fetchFederationCard(gatewayUrl: string, fetchImpl?: typeof fetch): Promise<{
    requestedUrl: string;
    canonicalUrl: string;
    card: FederationCard;
}>;
export declare function ensureLocalGatewayReachable(config: Pick<OGPConfig, 'gatewayUrl'>, actionLabel: string, fetchImpl?: typeof fetch): Promise<boolean>;
export declare function federationList(status?: 'pending' | 'approved' | 'rejected' | 'removed', filterTag?: string): Promise<void>;
export declare function federationStatus(): Promise<void>;
export declare function federationRequest(peerUrl: string, peerId: string, alias?: string): Promise<boolean>;
export interface ApproveOptions {
    intents?: string[];
    rate?: string;
    topics?: string[];
}
export declare function federationApprove(peerId: string, options?: ApproveOptions): Promise<void>;
export declare function federationReject(peerId: string): Promise<void>;
export declare function federationRemove(peerId: string): Promise<void>;
export declare function federationSend(peerId: string, intent: string, payloadJson: string, timeoutMs?: number, toAgent?: string): Promise<any | null>;
/**
 * Show scope grants for a peer
 */
export declare function federationShowScopes(peerId: string): Promise<void>;
/**
 * Update scope grants for an existing peer
 */
export declare function federationUpdateGrants(peerId: string, options: ApproveOptions): Promise<void>;
/**
 * Add tags to a peer (local categorization)
 */
export declare function federationTagPeer(peerId: string, tags: string[]): Promise<void>;
/**
 * Remove tags from a peer
 */
export declare function federationUntagPeer(peerId: string, tags: string[]): Promise<void>;
/**
 * Update identity information with an existing peer
 */
export declare function federationUpdateIdentity(peerId: string): Promise<void>;
/**
 * Send an agent-comms message to a peer
 */
export declare function federationSendAgentComms(peerId: string, topic: string, messageText: string, options?: {
    priority?: 'low' | 'normal' | 'high';
    conversationId?: string;
    waitForReply?: boolean;
    replyTimeout?: number;
    toAgent?: string;
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
export declare function federationAccept(token: string, alias?: string): Promise<void>;
/**
 * Connect to a peer by public key using rendezvous server discovery.
 *
 * Usage: ogp federation connect <pubkey>
 *
 * Looks up the peer URL from the rendezvous server, then sends a
 * federation request to that URL.
 */
export declare function federationConnect(pubkey: string, alias?: string): Promise<void>;
/**
 * Set a user-friendly alias for a peer.
 *
 * Usage: ogp federation alias <peer-id> <alias>
 */
export declare function federationSetAlias(peerId: string, alias: string): Promise<void>;
export {};
//# sourceMappingURL=federation.d.ts.map