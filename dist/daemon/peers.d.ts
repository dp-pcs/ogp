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
}
export declare function loadPeers(): Peer[];
export declare function savePeers(peers: Peer[]): void;
export declare function addPeer(peer: Peer): void;
export declare function getPeer(peerId: string): Peer | null;
export declare function approvePeer(peerId: string): boolean;
export declare function rejectPeer(peerId: string): boolean;
export declare function listPeers(status?: 'pending' | 'approved' | 'rejected'): Peer[];
//# sourceMappingURL=peers.d.ts.map