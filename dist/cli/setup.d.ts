import { type DelegatedAuthorityConfig, type HumanSurfacingMode, type InboundFederationMode, type OGPConfig, type RelayHandlingMode } from '../shared/config.js';
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
export declare function runSetup(): Promise<void>;
export declare function runSetupResetKeypair(): Promise<void>;
export declare function runAgentCommsInterview(): Promise<void>;
//# sourceMappingURL=setup.d.ts.map