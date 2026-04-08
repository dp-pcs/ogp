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
export interface OGPConfig {
    daemonPort: number;
    openclawUrl: string;
    openclawToken: string;
    gatewayUrl: string;
    displayName: string;
    email: string;
    stateDir: string;
    agentComms?: AgentCommsConfig;
    rendezvous?: RendezvousConfig;
    notifyTarget?: string;
    notifyTargets?: Record<string, string>;
    humanDeliveryTarget?: string;
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