/**
 * OpenClaw Bridge for OGP Notifications
 *
 * Injects OGP federation messages into OpenClaw sessions using the Gateway RPC.
 * For Telegram-backed agents, this is the delivery path that actually surfaces
 * the message in the human-visible conversation thread.
 */
/**
 * Connect bridge (no-op for RPC-based implementation)
 */
export declare function connectBridge(): void;
/**
 * Inject a message into an OpenClaw session using the gateway RPC.
 * Note: OpenClaw currently renders these messages with sender "cli", so OGP must
 * include peer identity in the message content itself.
 */
export declare function injectMessage(sessionKey: string, message: string, from?: string): Promise<boolean>;
/**
 * Disconnect bridge (no-op for RPC-based implementation)
 */
export declare function disconnectBridge(): void;
//# sourceMappingURL=openclaw-bridge.d.ts.map