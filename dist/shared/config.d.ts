/**
 * Response level for agent-comms
 */
export type ResponseLevel = 'full' | 'summary' | 'escalate' | 'deny';
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
export interface OGPConfig {
    daemonPort: number;
    openclawUrl: string;
    openclawToken: string;
    gatewayUrl: string;
    displayName: string;
    email: string;
    stateDir: string;
    agentComms?: AgentCommsConfig;
}
export declare function getConfigPath(): string;
export declare function getConfigDir(): string;
export declare function ensureConfigDir(): void;
export declare function loadConfig(): OGPConfig | null;
export declare function saveConfig(config: OGPConfig): void;
export declare function requireConfig(): OGPConfig;
//# sourceMappingURL=config.d.ts.map