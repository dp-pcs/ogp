/**
 * OGP Rendezvous integration
 *
 * Handles:
 *  - Detecting own public IP via api.ipify.org
 *  - Registering with the rendezvous server on startup
 *  - Heartbeat (re-register every 30s) to keep TTL alive
 *  - Deregistration on shutdown (best effort)
 *  - Peer lookup by public key
 */
import type { RendezvousConfig, TransportConfig } from '../shared/config.js';
/**
 * Transport descriptor advertised inside the signed registration (bd-b7em).
 * Mirrors the rendezvous server's shape. Absent ⇒ direct (we omit it entirely
 * for direct mode to stay byte-identical with pre-bd-b7em registrations).
 */
type TransportDescriptor = {
    transport: 'relay';
    relayUrl: string;
} | {
    transport: 'iroh';
    nodeId: string;
    relayUrl?: string;
};
/**
 * Build the transport descriptor to advertise, from config. Returns undefined
 * for 'direct' (or absent) — direct peers register exactly as before, and a
 * missing descriptor is interpreted as direct by the server.
 *
 * relay without a configured url, or iroh without a node id, fall back to
 * undefined (direct) rather than advertising an unreachable transport.
 */
export declare function buildTransportDescriptor(transport: TransportConfig | undefined, rendezvousUrl: string, irohNodeId?: string): TransportDescriptor | undefined;
/**
 * Start rendezvous registration and heartbeat.
 * Call this from server.ts after the daemon begins listening.
 */
export declare function startRendezvous(config: RendezvousConfig, pubkey: string, port: number, transportConfig?: TransportConfig): Promise<void>;
/**
 * Stop heartbeat and deregister from rendezvous (best effort).
 * Call from server.ts shutdown path.
 */
export declare function stopRendezvous(): Promise<void>;
/**
 * Look up a peer by public key in the rendezvous server.
 * Returns the peer URL (http://ip:port or publicUrl) or null if not found.
 */
export declare function lookupPeer(config: RendezvousConfig, pubkey: string): Promise<string | null>;
/**
 * Resolved transport for a peer (bd-b7em). Phase 1: senders still deliver via
 * `direct` (the `url`); `relay`/`iroh` are carried so Phase 2's sender can branch
 * on `mode`. Direct/legacy records resolve to `{ mode:'direct', url }` exactly as
 * `lookupPeer` does today, so existing behavior is unchanged.
 */
export type ResolvedTransport = {
    mode: 'direct';
    url: string;
} | {
    mode: 'relay';
    relayUrl: string;
    pubkey: string;
} | {
    mode: 'iroh';
    nodeId: string;
    relayUrl?: string;
    pubkey: string;
};
/**
 * Look up a peer and resolve HOW to reach them. Backward compatible: a peer with
 * no transport descriptor (or transport:'direct') resolves to direct via the
 * same publicUrl / ip:port logic as `lookupPeer`.
 */
export declare function lookupPeerTransport(config: RendezvousConfig, pubkey: string): Promise<ResolvedTransport | null>;
export {};
//# sourceMappingURL=rendezvous.d.ts.map