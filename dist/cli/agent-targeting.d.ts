import type { AgentPersona } from '../shared/config.js';
export interface AgentTargetingProbeResult {
    features: string[];
    agents: AgentPersona[];
}
export type AgentTargetingProbeFn = (peer: PeerLike) => Promise<AgentTargetingProbeResult>;
interface PeerLike {
    id: string;
    gatewayUrl: string;
    displayName: string;
}
export type ValidateTargetAgentResult = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function defaultProbe(peer: Pick<PeerLike, 'gatewayUrl'>): Promise<AgentTargetingProbeResult>;
export declare function validateTargetAgent(peer: PeerLike, toAgent: string | undefined, probe?: AgentTargetingProbeFn): Promise<ValidateTargetAgentResult>;
export {};
//# sourceMappingURL=agent-targeting.d.ts.map