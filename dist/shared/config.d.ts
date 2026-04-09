/**
 * Response level for agent-comms
 */
export type ResponseLevel = 'full' | 'summary' | 'escalate' | 'deny' | 'off';
/**
 * Topic policy configuration
 */
export interface TopicPolicy {
    level: ResponseLevel;
    notes?: string;
}
/**
 * Response policy mapping topics to policies
 */
export interface ResponsePolicy {
    [topic: string]: TopicPolicy;
}
/**
 * Agent-comms configuration
 */
export interface AgentCommsConfig {
    globalPolicy: ResponsePolicy;
    defaultLevel: ResponseLevel;
    activityLog: boolean;
}
export interface RendezvousConfig {
    enabled: boolean;
    url: string;
    publicUrl?: string;
}
export type InboundFederationMode = 'forward' | 'summarize' | 'autonomous' | 'approval-required';
export interface InboundFederationPolicy {
    mode: InboundFederationMode;
}
export type FederatedMessageClass = 'agent-work' | 'human-relay' | 'approval-request' | 'status-update';
export type HumanSurfacingMode = 'always' | 'summary-only' | 'important-only' | 'never';
export type RelayHandlingMode = 'deliver' | 'summarize' | 'approval-required';
/**
 * Rule describing how the local agent may handle a class of federated work.
 * All fields are optional so more specific scopes can override only what changes.
 */
export interface DelegatedAuthorityRule {
    mode?: InboundFederationMode;
    relayMode?: RelayHandlingMode;
    surfaceToHuman?: HumanSurfacingMode;
    allowDirectPeerReply?: boolean;
    notes?: string;
}
/**
 * Policy scope with a default rule plus more specific overrides.
 */
export interface DelegatedAuthorityScope {
    defaultRule: DelegatedAuthorityRule;
    classRules?: Partial<Record<FederatedMessageClass, DelegatedAuthorityRule>>;
    topicRules?: Record<string, DelegatedAuthorityRule>;
}
/**
 * Peer-specific delegated authority override.
 * The key in delegatedAuthority.peers is expected to be the peer ID.
 */
export interface DelegatedAuthorityPeerOverride extends DelegatedAuthorityScope {
    trust?: 'default' | 'trusted' | 'restricted';
}
/**
 * First-class governance model for inbound federated work.
 * This coexists with legacy inboundFederationPolicy during migration.
 */
export interface DelegatedAuthorityConfig {
    global: DelegatedAuthorityScope;
    peers?: Record<string, DelegatedAuthorityPeerOverride>;
}
export interface OGPConfig {
    daemonPort: number;
    openclawUrl: string;
    openclawToken: string;
    openclawHooksToken?: string;
    gatewayUrl: string;
    displayName: string;
    email: string;
    stateDir: string;
    agentComms?: AgentCommsConfig;
    rendezvous?: RendezvousConfig;
    notifyTarget?: string;
    notifyTargets?: Record<string, string>;
    humanDeliveryTarget?: string;
    delegatedAuthority?: DelegatedAuthorityConfig;
    inboundFederationPolicy?: InboundFederationPolicy;
    agentId?: string;
    platform?: 'openclaw' | 'hermes';
    hermesWebhookUrl?: string;
    hermesWebhookSecret?: string;
}
/**
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export declare function getConfigDir(): string;
/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export declare function getConfigPath(): string;
export declare function ensureConfigDir(): void;
export declare function loadConfig(): OGPConfig | null;
export declare function saveConfig(config: OGPConfig): void;
export declare function requireConfig(): OGPConfig;
//# sourceMappingURL=config.d.ts.map