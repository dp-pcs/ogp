import { type VerifyResult } from './verify.js';
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