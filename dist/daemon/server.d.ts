import { type OGPConfig } from '../shared/config.js';
import type { ScopeBundle } from './scopes.js';
/**
 * Validate an inbound /federation/approve body. Pure function, exported for tests.
 * Returns either a parsed-and-verified payload or a structured failure with the
 * HTTP status the route should return.
 *
 * SECURITY (F-01): Verifies against `peer.publicKey` (the value already stored
 * for the pending peer), NOT against `body.fromPublicKey`. Also rejects any
 * body that tries to claim a different publicKey for the pending peer — that's
 * the publicKey-replacement hijack vector.
 */
export interface ApprovalValidationOk {
    ok: true;
    parsed: {
        fromGatewayId?: string;
        fromGatewayUrl?: string;
        fromDisplayName?: string;
        fromPublicKey?: string;
        fromEmail?: string;
        peerId?: string;
        scopeGrants?: ScopeBundle;
        protocolVersion?: string;
        timestamp?: string;
        [k: string]: unknown;
    };
}
export interface ApprovalValidationErr {
    ok: false;
    status: number;
    error: string;
}
export type ApprovalValidation = ApprovalValidationOk | ApprovalValidationErr;
interface ApprovalValidationDeps {
    verifyEnvelope: (env: {
        payloadStr?: string;
        signature?: string;
    }, publicKey: string) => {
        ok: boolean;
        reason?: string;
    };
}
/**
 * Verify a signed `X-OGP-Peer-ID` / `X-OGP-Timestamp` / `X-OGP-Signature`
 * header set against a known peer publicKey. Used by `/.well-known/ogp` to
 * authenticate the F-12 bidirectional-health peerStatus exposure.
 *
 * The signed message is `JSON.stringify({peerId, timestamp})` so both sides
 * produce identical bytes.
 */
export interface SignedPeerIdHeaders {
    peerId: string;
    timestamp: string;
    signature: string;
}
export declare function verifySignedPeerIdHeader(headers: SignedPeerIdHeaders, publicKey: string, verifyImpl: (msg: string, sig: string, pk: string) => boolean, opts?: {
    now?: number;
    maxAgeMs?: number;
}): boolean;
/**
 * Validate an inbound /federation/request body. Pure function, exported for tests.
 *
 * SECURITY (F-04): The receiver doesn't know this peer yet, so we verify
 * against the publicKey *in the body* — that proves the caller possesses the
 * private key for the publicKey they're announcing. The previous code
 * destructured `signature` but never actually called verify().
 */
export interface RequestValidationOk {
    ok: true;
    parsed: {
        peer: {
            displayName: string;
            email: string;
            gatewayUrl: string;
            publicKey: string;
            humanName?: string;
            agentName?: string;
            organization?: string;
            [k: string]: unknown;
        };
        offeredIntents?: string[];
        timestamp?: string;
        [k: string]: unknown;
    };
}
export type RequestValidation = RequestValidationOk | ApprovalValidationErr;
export declare function validateSignedRequest(body: any, deps: ApprovalValidationDeps): RequestValidation;
export declare function validateSignedApproval(body: any, storedPublicKey: string, deps: ApprovalValidationDeps): ApprovalValidation;
interface ShutdownDeps {
    disconnectBridge: () => void;
    stopDoormanCleanup: () => void;
    stopReplyCleanup: () => void;
    stopRendezvous: () => Promise<void>;
    stopHeartbeat: () => void;
    getServer: () => {
        close: (cb: (error?: Error) => void) => void;
    } | null;
    exit: (code: number) => never;
    setTimer: typeof setTimeout;
    clearTimer: typeof clearTimeout;
    logError: (message?: any, ...optionalParams: any[]) => void;
}
export declare function createGracefulShutdownHandler(deps: ShutdownDeps): (signal: "SIGTERM" | "SIGINT") => Promise<void>;
export declare function resetGracefulShutdownStateForTests(): void;
export declare function startServer(config?: OGPConfig, background?: boolean): void;
export declare function stopServer(): void;
export declare function getDaemonStatus(): Promise<{
    running: boolean;
    pid?: number;
    portDetected?: boolean;
}>;
export {};
//# sourceMappingURL=server.d.ts.map