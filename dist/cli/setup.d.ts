import { type DelegatedAuthorityConfig, type HumanSurfacingMode, type InboundFederationMode, type OGPConfig, type RelayHandlingMode } from '../shared/config.js';
import { type Framework } from '../shared/meta-config.js';
export interface DelegatedAuthorityInterviewAnswers {
    humanDeliveryTarget?: string;
    inboundFederationMode: InboundFederationMode;
    humanSurfacingMode: HumanSurfacingMode;
    relayHandlingMode: RelayHandlingMode;
    approvalTopics: string[];
    trustedPeerAutonomy: boolean;
}
export declare function normalizeGatewayUrlInput(value: string): string;
export declare function isValidGatewayUrl(value: string): boolean;
export declare function buildDelegatedAuthorityConfig(options: {
    inboundMode: InboundFederationMode;
    humanSurfacingMode: HumanSurfacingMode;
    relayHandlingMode: RelayHandlingMode;
    approvalTopics: string[];
    trustedPeerAutonomy: boolean;
}): DelegatedAuthorityConfig;
export declare function deriveDelegatedAuthorityInterviewAnswers(config: OGPConfig): DelegatedAuthorityInterviewAnswers;
export declare function applyDelegatedAuthorityInterviewAnswers(config: OGPConfig, answers: DelegatedAuthorityInterviewAnswers): OGPConfig;
export declare function formatKeypairResetSummary(publicKey: string): string[];
export interface NonInteractiveFrameworkAnswers {
    id: 'openclaw' | 'hermes' | 'standalone';
    gatewayUrl?: string;
    humanName?: string;
    agentName?: string;
    organization?: string;
    tags?: string[];
    email?: string;
    agentId?: string;
    humanDeliveryTarget?: string;
    openclawUrl?: string;
    openclawToken?: string;
    hermesWebhookUrl?: string;
    hermesWebhookSecret?: string;
    inboundFederationMode?: InboundFederationMode;
    humanSurfacingMode?: HumanSurfacingMode;
    relayHandlingMode?: RelayHandlingMode;
    approvalTopics?: string[];
    trustedPeerAutonomy?: boolean;
    configDir?: string;
    daemonPort?: number;
    keychainPath?: string;
    keychainPasswordFile?: string;
}
export interface NonInteractiveAnswers {
    default?: string;
    framework?: NonInteractiveFrameworkAnswers;
    frameworks?: NonInteractiveFrameworkAnswers[];
    migrateExisting?: boolean;
}
export declare function buildFrameworkConfigsFromAnswers(answers: NonInteractiveFrameworkAnswers): {
    framework: Framework;
    ogpConfig: OGPConfig;
    expandedConfigDir: string;
};
export declare function runNonInteractiveSetup(answersPath: string): Promise<void>;
export declare function runSetup(): Promise<void>;
export declare function runSetupResetKeypair(): Promise<void>;
export declare function runAgentCommsInterview(): Promise<void>;
//# sourceMappingURL=setup.d.ts.map