import { type RelayFrame, type FederationRelayFrame } from '../shared/relay-protocol.js';
/**
 * Start the persistent receiver socket. Call from server.ts startup ONLY when
 * transport.mode === 'relay'. Idempotent; reconnects with backoff on drop.
 */
export declare function startRelayClient(relayUrl: string): Promise<void>;
/** Stop the receiver and reject any in-flight work. Returns when torn down. */
export declare function stopRelayClient(): Promise<void>;
/**
 * Deliver a signed envelope to a relay-mode peer and await their MessageResponse.
 * Reuses the live receiver socket when it's on the same relay; otherwise opens a
 * short-lived sender socket just for this exchange. Throws on timeout or
 * peer-not-connected (callers map that to a failed-send result).
 */
export declare function deliverViaRelay(relayUrl: string, toPubkey: string, frame: RelayFrame, timeoutMs?: number): Promise<unknown>;
/**
 * Send a signed federation handshake envelope (request or approve) to a relay-mode
 * peer over the relay and await their {statusCode, body} (bd-63bs). Lets two
 * relay-only peers federate with no public HTTP gateway. Reuses the live receiver
 * socket on the same relay; otherwise opens a transient sender socket. Throws on
 * timeout / peer-not-connected (callers map that to a failed handshake).
 */
export declare function federationViaRelay(relayUrl: string, toPubkey: string, op: 'request' | 'approve', frame: FederationRelayFrame, timeoutMs?: number): Promise<unknown>;
//# sourceMappingURL=relay-client.d.ts.map