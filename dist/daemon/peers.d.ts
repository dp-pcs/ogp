import { type ResponseLevel, type ResponsePolicy, type TopicPolicy } from '../shared/config.js';
import type { ScopeBundle } from './scopes.js';
export type { ResponseLevel, ResponsePolicy, TopicPolicy };
export interface Peer {
    id: string;
    displayName: string;
    email: string;
    gatewayUrl: string;
    publicKey: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
    approvedAt?: string;
    metadata?: Record<string, any>;
    protocolVersion?: string;
    grantedScopes?: ScopeBundle;
    receivedScopes?: ScopeBundle;
    responsePolicy?: ResponsePolicy;
    defaultLevel?: ResponseLevel;
}
export declare function loadPeers(): Peer[];
export declare function savePeers(peers: Peer[]): void;
export declare function addPeer(peer: Peer): void;
export declare function getPeer(peerId: string): Peer | null;
export declare function approvePeer(peerId: string): boolean;
export declare function rejectPeer(peerId: string): boolean;
export declare function listPeers(status?: 'pending' | 'approved' | 'rejected'): Peer[];
/**
 * Update the scopes granted TO a peer (what they can request from us)
 */
export declare function updatePeerGrantedScopes(peerId: string, scopes: ScopeBundle): boolean;
/**
 * Update the scopes received FROM a peer (what we can request from them)
 */
export declare function updatePeerReceivedScopes(peerId: string, scopes: ScopeBundle): boolean;
/**
 * Update the protocol version for a peer
 */
export declare function updatePeerVersion(peerId: string, version: string): boolean;
/**
 * Get a peer's granted scopes (what they can request from us)
 */
export declare function getPeerGrantedScopes(peerId: string): ScopeBundle | null;
/**
 * Update multiple peer fields at once
 */
export declare function updatePeer(peerId: string, updates: Partial<Peer>): boolean;
/**
 * Update response policy for a peer
 */
export declare function updatePeerResponsePolicy(peerId: string, policy: ResponsePolicy): boolean;
/**
 * Set a topic policy for a peer
 */
export declare function setPeerTopicPolicy(peerId: string, topic: string, level: ResponseLevel, notes?: string): boolean;
/**
 * Remove a topic from peer's response policy
 */
export declare function removePeerTopicPolicy(peerId: string, topic: string): boolean;
/**
 * Get response policy for a peer (peer-specific only, no global fallback)
 */
export declare function getPeerResponsePolicy(peerId: string): ResponsePolicy | null;
/**
 * Clear response policy for a peer (reset to global defaults)
 */
export declare function clearPeerResponsePolicy(peerId: string): boolean;
/**
 * Set the default response level for a peer (used when no topic-specific policy exists)
 */
export declare function setPeerDefaultLevel(peerId: string, level: ResponseLevel): boolean;
/**
 * Get a peer's default level (or null if not set)
 */
export declare function getPeerDefaultLevel(peerId: string): ResponseLevel | null;
//# sourceMappingURL=peers.d.ts.map