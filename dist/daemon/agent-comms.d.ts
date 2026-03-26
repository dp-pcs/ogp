/**
 * OGP Agent-Comms - Response policies and activity logging
 *
 * This module handles:
 * 1. Global and per-peer response policies
 * 2. Activity logging for agent-comms messages
 * 3. Policy resolution (peer-specific overrides global)
 */
import { type ResponseLevel, type ResponsePolicy, type TopicPolicy, type AgentCommsConfig } from '../shared/config.js';
export type { ResponseLevel, ResponsePolicy, TopicPolicy, AgentCommsConfig };
/**
 * Load agent-comms configuration from main config
 */
export declare function loadAgentCommsConfig(): AgentCommsConfig;
/**
 * Save agent-comms configuration to main config
 */
export declare function saveAgentCommsConfig(agentCommsConfig: AgentCommsConfig): void;
/**
 * Update global policy
 */
export declare function updateGlobalPolicy(policy: ResponsePolicy): void;
/**
 * Set a topic in global policy
 */
export declare function setGlobalTopicPolicy(topic: string, level: ResponseLevel, notes?: string): void;
/**
 * Remove a topic from global policy
 */
export declare function removeGlobalTopicPolicy(topic: string): void;
/**
 * Set default response level
 */
export declare function setDefaultLevel(level: ResponseLevel): void;
/**
 * Get effective policy for a peer and topic
 * Priority: peer-topic > global-topic > peer-default > global-default
 */
export declare function getEffectivePolicy(peerId: string, topic: string): TopicPolicy;
/**
 * Get all effective policies for a peer (merged global + peer-specific)
 */
export declare function getAllEffectivePolicies(peerId: string): ResponsePolicy;
/**
 * Activity log entry
 */
export interface ActivityEntry {
    timestamp: string;
    direction: 'in' | 'out';
    peerId: string;
    peerName: string;
    topic: string;
    message: string;
    level?: ResponseLevel;
    truncated?: boolean;
}
/**
 * Log an activity entry
 */
export declare function logActivity(entry: Omit<ActivityEntry, 'timestamp'>): void;
/**
 * Read activity log entries
 */
export declare function readActivityLog(options?: {
    peerId?: string;
    last?: number;
}): string[];
/**
 * Clear activity log
 */
export declare function clearActivityLog(): void;
/**
 * Enable/disable activity logging
 */
export declare function setActivityLogging(enabled: boolean): void;
//# sourceMappingURL=agent-comms.d.ts.map