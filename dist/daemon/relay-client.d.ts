import { type RelayFrame } from '../shared/relay-protocol.js';
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
//# sourceMappingURL=relay-client.d.ts.map