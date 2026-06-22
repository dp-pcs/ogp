export interface RelayWS {
    send(data: string): void;
    close(code?: number): void;
    readonly id: number;
}
export type VerifyFn = (envelope: {
    payloadStr?: string;
    signature?: string;
}, publicKeyHex: string, opts?: {
    maxAgeMs?: number;
    now?: number;
}) => {
    ok: boolean;
    reason?: string;
};
export interface RelayCoreDeps {
    verifyCanonical: VerifyFn;
    now: () => number;
    randomId: () => string;
    randomNonce: () => string;
    log?: (msg: string) => void;
}
export declare class RelayCore {
    private readonly deps;
    /** pubkey → live receiver socket. In-process; SINGLE Fargate task for the pilot.
     *  Multi-task scale-out needs a shared table (Redis pub/sub) — deferred. */
    readonly routing: Map<string, RelayWS>;
    private readonly challenges;
    private readonly conns;
    constructor(deps: RelayCoreDeps);
    private log;
    /** Call when a new socket connects. Issues the auth challenge immediately. */
    onConnection(socket: RelayWS): void;
    /** Call for each text frame received on `socket`. */
    onMessage(socket: RelayWS, raw: string): void;
    /** Call when a socket closes. Removes it from routing and cleans state. */
    onClose(socket: RelayWS): void;
    private handleAuth;
    /**
     * Pure auth check: validates the auth frame against its stored challenge and
     * the Ed25519 signature over the canonical payload. Exposed for unit tests.
     */
    verifyAuthFrame(frame: Record<string, unknown>): {
        ok: true;
        pubkey: string;
        role: 'receiver' | 'sender';
        challengeId: string;
    } | {
        ok: false;
        reason: string;
    };
    private handleDeliver;
    /**
     * Route a deliver from `fromPubkey` to `to`'s live receiver socket, tagging it
     * so the response leg can be returned. Errors back to `replyTo` if `to` is not
     * connected. Exposed for unit tests.
     */
    routeDeliver(fromPubkey: string, reqId: string, to: string, innerFrame: unknown, replyTo: RelayWS): void;
    /**
     * Federation handshake over relay (bd-63bs). Same untrusted forward-by-pubkey +
     * reqId↔response path as deliver, but the forwarded frame keeps its `op` so the
     * receiver routes it to the request vs approve handler. The relay never inspects
     * `frame` (the signed handshake envelope). Exposed for unit tests.
     */
    private handleFederation;
    /** Route a federation frame to `to`'s receiver, preserving `op`. Exposed for tests. */
    routeFederation(fromPubkey: string, op: 'request' | 'approve', reqId: string, to: string, innerFrame: unknown, replyTo: RelayWS): void;
    private readonly responseRoute;
    private handleResponse;
    private sweepChallenges;
}
//# sourceMappingURL=relay-core.d.ts.map