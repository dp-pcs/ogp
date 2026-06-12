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
 * Mirrors the rendezvous server's shape. A `direct` descriptor is only emitted
 * inside a multi-element list; a single direct advertisement omits the field
 * entirely to stay byte-identical with pre-bd-b7em registrations.
 */
type TransportDescriptor = {
    transport: 'direct';
    gatewayUrl?: string;
} | {
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
 * Build the ordered transport advertisement list (bd-maas) from config. Resolves
 * the mode list via resolveTransportList, builds a descriptor per mode, and drops
 * any that can't be resolved. Returns [] when the result is just plain direct —
 * the caller then omits the transport field entirely (byte-identical to a
 * pre-bd-b7em / single-direct registration).
 *
 * Pure (modulo the passed-in urls) — exported for testing.
 */
export declare function buildTransportList(transport: TransportConfig | undefined, rendezvousUrl: string, gatewayUrl?: string, irohNodeId?: string): TransportDescriptor[];
/**
 * Decide how a transport list serializes into the signed registration payload,
 * preserving backward compatibility:
 *   - empty list ⇒ no transport field at all (direct, pre-bd-b7em shape).
 *   - single non-direct descriptor ⇒ legacy `transport` object, so a pre-bd-maas
 *     rendezvous (which only reads `transport`) keeps routing relay/iroh until the
 *     server learns to read `transports`.
 *   - multi-element list ⇒ new `transports` array (also mirror the first/preferred
 *     entry into legacy `transport` when it's non-direct, so old servers still see
 *     a usable single transport).
 */
export declare function serializeTransportAdvertisement(list: TransportDescriptor[]): {
    transport?: TransportDescriptor;
    transports?: TransportDescriptor[];
};
/**
 * Resolve the relay WebSocket URL for THIS daemon's own receiver socket
 * (bd-b7em Phase 2). Uses an explicitly configured relay.url, else derives
 * wss://<rendezvous-host>/relay. Returns undefined when relay can't be resolved.
 */
export declare function resolveOwnRelayUrl(transport: TransportConfig | undefined, rendezvousUrl: string | undefined): string | undefined;
/**
 * Identity card advertised inside the signed registration (bd-maas Part B), so
 * the rendezvous can serve relay-only peers' discovery info. A subset of the
 * /.well-known/ogp card. Its `publicKey` MUST equal the registration pubkey —
 * the server rejects a mismatch.
 */
export interface RegistrationCard {
    displayName?: string;
    email?: string;
    gatewayUrl?: string;
    publicKey: string;
    offeredIntents?: string[];
}
/**
 * Start rendezvous registration and heartbeat.
 * Call this from server.ts after the daemon begins listening.
 */
export declare function startRendezvous(config: RendezvousConfig, pubkey: string, port: number, transportConfig?: TransportConfig, opts?: {
    gatewayUrl?: string;
    card?: RegistrationCard;
}): Promise<void>;
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
 * Resolved transport for a peer (bd-b7em). Senders deliver via `direct` (the
 * `url`) or `relay` (the `relayUrl`); `iroh` is carried for Phase 3. Direct/legacy
 * records resolve to `{ mode:'direct', url }` exactly as `lookupPeer` does today.
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
/** Shape of the rendezvous /peer/<pubkey> response (fields we read). */
interface PeerLookupResponse {
    ip?: string;
    port?: number;
    publicUrl?: string;
    transport?: TransportDescriptor;
    transports?: TransportDescriptor[];
    card?: RegistrationCard;
}
/**
 * Resolve the rendezvous lookup response into an ordered list of reachable
 * transports (bd-maas). Backward compatible:
 *   - new `transports` list ⇒ resolve each entry in order.
 *   - legacy single `transport` ⇒ one-element list.
 *   - neither ⇒ direct via publicUrl / ip:port (pre-bd-b7em behavior).
 * A direct entry resolves to its gatewayUrl, else the publicUrl/ip:port fallback.
 *
 * Pure — exported for testing.
 */
export declare function parseResolvedTransports(data: PeerLookupResponse, pubkey: string): ResolvedTransport[];
/**
 * Look up a peer and resolve the ordered list of ways to reach them (bd-maas).
 * Returns [] when the peer isn't registered or has no reachable address.
 */
export declare function lookupPeerTransports(config: RendezvousConfig, pubkey: string): Promise<ResolvedTransport[]>;
/**
 * Single-transport resolve (back-compat). Returns the FIRST/preferred reachable
 * transport, or null. Existing callers (heartbeat relay-reachability) keep
 * working; the delivery preference-walk uses `lookupPeerTransports`.
 */
export declare function lookupPeerTransport(config: RendezvousConfig, pubkey: string): Promise<ResolvedTransport | null>;
/**
 * Fetch a relay-only peer's signed identity card from rendezvous (bd-maas Part B).
 * Returns null when the peer isn't registered or advertised no card. The card's
 * `publicKey` is asserted to equal the looked-up pubkey (rendezvous stores it only
 * from the verified payload, but we double-check here defensively).
 */
export declare function fetchPeerCard(config: RendezvousConfig, pubkey: string): Promise<RegistrationCard | null>;
export {};
//# sourceMappingURL=rendezvous.d.ts.map