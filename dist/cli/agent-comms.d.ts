/**
 * CLI commands for agent-comms configuration
 */
import { type ResponseLevel } from '../daemon/peers.js';
/**
 * Show all policies (global + per-peer)
 */
export declare function showPolicies(peerId?: string): void;
/**
 * Configure policies
 */
export interface ConfigureOptions {
    global?: boolean;
    topics?: string;
    level?: ResponseLevel;
    notes?: string;
}
export declare function configurePolicies(peerIds: string | undefined, options: ConfigureOptions): void;
/**
 * Add a topic to a peer's policy
 */
export declare function addTopic(peerId: string, topic: string, level: ResponseLevel, notes?: string): void;
/**
 * Remove a topic from a peer's policy
 */
export declare function removeTopic(peerId: string, topic: string): void;
/**
 * Reset a peer's policy to global defaults
 */
export declare function resetPolicy(peerId: string): void;
/**
 * Show activity log
 */
export declare function showActivity(peerId?: string, last?: number): void;
/**
 * Clear activity log
 */
export declare function clearActivity(): void;
/**
 * Set default response level
 */
export declare function setDefault(level: ResponseLevel): void;
/**
 * Enable/disable activity logging
 */
export declare function setLogging(enabled: boolean): void;
/**
 * Interactive peer selection (returns peer IDs)
 */
export declare function listPeersForSelection(): {
    id: string;
    name: string;
    hasPolicy: boolean;
}[];
//# sourceMappingURL=agent-comms.d.ts.map