import { type FederatedMessageClass, type HumanSurfacingMode, type RelayHandlingMode, type InboundFederationMode, type OGPConfig } from '../shared/config.js';
export interface NotificationPayload {
    text: string;
    sessionKey?: string;
    metadata?: Record<string, any>;
    messageClass?: FederatedMessageClass;
    /**
     * Target agent for routing the notification.
     * If specified, looks up notifyTargets[agent] first, then falls back to legacy notifyTarget.
     */
    agent?: string;
    /**
     * Peer ID of the sender (for hook payload)
     */
    peerId?: string;
    /**
     * Intent that triggered this notification (for hook payload)
     */
    intent?: string;
    /**
     * Topic for agent-comms notifications (for hook payload)
     */
    topic?: string;
    /**
     * Display name of the peer (for Hermes integration)
     */
    peerDisplayName?: string;
    /**
     * Priority level (for Hermes integration)
     */
    priority?: 'low' | 'normal' | 'high';
    /**
     * Conversation ID for threading (for Hermes integration)
     */
    conversationId?: string;
    /**
     * B0032 v0.7.0 — Persona-specific OpenClaw `agentId` for the hook payload.
     * Set by the message handler after persona resolution. Falls through to
     * legacy `config.agentId || 'main'` when omitted.
     */
    hookAgentId?: string;
}
export interface EffectiveFederatedHandlingPolicy {
    messageClass: FederatedMessageClass;
    topic?: string;
    mode: InboundFederationMode;
    relayMode: RelayHandlingMode;
    surfaceToHuman: HumanSurfacingMode;
    allowDirectPeerReply: boolean;
}
export declare function classifyFederatedMessage(payload: NotificationPayload): FederatedMessageClass;
export declare function resolveFederatedHandlingPolicy(config: OGPConfig, payload: NotificationPayload): EffectiveFederatedHandlingPolicy;
export declare function formatHandlingGuidance(config: OGPConfig, payload: NotificationPayload): string;
export declare function notifyOpenClaw(payload: NotificationPayload): Promise<boolean>;
/**
 * Send notification to the local AI agent using the configured platform backend.
 * This is the recommended function for new code.
 *
 * @param payload Notification data including message, peer info, and metadata
 * @returns Promise<boolean> indicating success
 */
export declare function notifyLocalAgent(payload: NotificationPayload): Promise<boolean>;
/**
 * Inject plain text into the local OpenClaw session without wrapping it as an
 * inbound federation message. This is used to mirror local outbound actions
 * into the agent's visible conversation state.
 */
export declare function deliverLocalSessionText(text: string, agent?: string): Promise<boolean>;
//# sourceMappingURL=notify.d.ts.map