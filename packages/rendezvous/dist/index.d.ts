import { type VerifyResult } from './verify.js';
/**
 * Transport descriptor (bd-b7em) — how a peer wants to be reached. Carried
 * INSIDE the signed registration payload, so it inherits the same proof-of-key
 * guarantee as pubkey/port: the rendezvous cannot advertise a transport the
 * keyholder did not sign. Absent ⇒ treated as 'direct' (backward compatible).
 *
 * Phase 1 stores + returns the descriptor; no delivery path consumes relay/iroh
 * yet (that's Phase 2/3). 'iroh' fields are carried but unused for now.
 */
export type TransportDescriptor = {
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
 * Validate an optional transport descriptor parsed from an already-signature-
 * verified payload. Returns the normalized descriptor, `undefined` if absent
 * (⇒ direct), or an error string if malformed.
 */
export declare function validateTransportDescriptor(raw: unknown): {
    ok: true;
    descriptor?: TransportDescriptor;
} | {
    ok: false;
    error: string;
};
/**
 * Validate a signed registration envelope. Pure function, exported for tests.
 *
 * SECURITY (F-02): The previous version stored whatever pubkey the caller
 * claimed, with no proof of possession. A malicious client could register
 * THEIR ip:port under VICTIM's pubkey, intercepting subsequent rendezvous
 * lookups. This forces the caller to prove possession of the private key
 * matching the announced pubkey before we'll publish anything.
 *
 * Wire shape:
 *   { payloadStr: "<JSON of {pubkey, port, timestamp}>", signature: "<hex>" }
 * Inner payload timestamp is an ISO-8601 string (5 min freshness window).
 */
export interface RegistrationValidationOk {
    ok: true;
    pubkey: string;
    port: number;
    /** Optional public URL the peer wants other peers to use to reach them. */
    publicUrl?: string;
    /** Optional transport descriptor (bd-b7em). Absent ⇒ direct. */
    transport?: TransportDescriptor;
}
export interface RegistrationValidationErr {
    ok: false;
    status: number;
    error: string;
}
export type RegistrationValidation = RegistrationValidationOk | RegistrationValidationErr;
export declare function validateSignedRegistration(body: any, verifyImpl?: (env: {
    payloadStr?: string;
    signature?: string;
}, pk: string) => VerifyResult): RegistrationValidation;
//# sourceMappingURL=index.d.ts.map