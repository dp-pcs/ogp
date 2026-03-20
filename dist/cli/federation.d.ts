export declare function federationList(status?: 'pending' | 'approved' | 'rejected'): Promise<void>;
export declare function federationRequest(peerUrl: string, peerId: string): Promise<void>;
export declare function federationApprove(peerId: string): Promise<void>;
export declare function federationReject(peerId: string): Promise<void>;
export declare function federationSend(peerId: string, intent: string, payloadJson: string): Promise<void>;
//# sourceMappingURL=federation.d.ts.map