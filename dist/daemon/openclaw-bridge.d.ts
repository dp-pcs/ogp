/**
 * OpenClaw Bridge for OGP Notifications
 *
 * Primary path: /hooks/agent so OpenClaw can run an isolated agent turn and
 * deliver the result through its normal channel-routing logic.
 *
 * Secondary path: Gateway RPC sessions.send for direct session injection.
 */
type DeliveryTarget = {
    channel?: string;
    to?: string;
};
type HookDispatchOptions = {
    deliver?: boolean;
    target?: DeliveryTarget;
    sessionKey?: string;
};
/**
 * Connect bridge (no-op for request-based implementation)
 */
export declare function connectBridge(): void;
export declare function dispatchAgentHook(message: string, from: string, options?: HookDispatchOptions): Promise<boolean>;
/**
 * Inject a message into an OpenClaw session using the gateway RPC.
 * Note: OpenClaw currently renders these messages with sender "cli", so OGP must
 * include peer identity in the message content itself.
 */
export declare function injectMessage(sessionKey: string, message: string, from?: string): Promise<boolean>;
/**
 * Disconnect bridge (no-op for request-based implementation)
 */
export declare function disconnectBridge(): void;
export {};
//# sourceMappingURL=openclaw-bridge.d.ts.map