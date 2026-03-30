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
import type { RendezvousConfig } from '../shared/config.js';
/**
 * Start rendezvous registration and heartbeat.
 * Call this from server.ts after the daemon begins listening.
 */
export declare function startRendezvous(config: RendezvousConfig, pubkey: string, port: number): Promise<void>;
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
//# sourceMappingURL=rendezvous.d.ts.map