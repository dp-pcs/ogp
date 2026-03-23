/**
 * OGP Agent-Comms - Response policies and activity logging
 *
 * This module handles:
 * 1. Global and per-peer response policies
 * 2. Activity logging for agent-comms messages
 * 3. Policy resolution (peer-specific overrides global)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  getConfigDir,
  ensureConfigDir,
  loadConfig,
  saveConfig,
  type ResponseLevel,
  type ResponsePolicy,
  type TopicPolicy,
  type AgentCommsConfig,
  type OGPConfig
} from '../shared/config.js';
import { getPeer } from './peers.js';

const ACTIVITY_LOG_FILE = path.join(getConfigDir(), 'activity.log');
const MAX_LOG_LINES = 1000;

// Re-export types for convenience
export type { ResponseLevel, ResponsePolicy, TopicPolicy, AgentCommsConfig };

const DEFAULT_AGENT_COMMS_CONFIG: AgentCommsConfig = {
  globalPolicy: {
    'general': { level: 'summary' },
    'testing': { level: 'full' }
  },
  defaultLevel: 'summary',
  activityLog: true
};

/**
 * Load agent-comms configuration from main config
 */
export function loadAgentCommsConfig(): AgentCommsConfig {
  const config = loadConfig();
  if (!config) return DEFAULT_AGENT_COMMS_CONFIG;
  return config.agentComms || DEFAULT_AGENT_COMMS_CONFIG;
}

/**
 * Save agent-comms configuration to main config
 */
export function saveAgentCommsConfig(agentCommsConfig: AgentCommsConfig): void {
  const config = loadConfig();
  if (!config) {
    console.error('No config found. Run "ogp setup" first.');
    return;
  }
  config.agentComms = agentCommsConfig;
  saveConfig(config);
}

/**
 * Update global policy
 */
export function updateGlobalPolicy(policy: ResponsePolicy): void {
  const config = loadAgentCommsConfig();
  config.globalPolicy = { ...config.globalPolicy, ...policy };
  saveAgentCommsConfig(config);
}

/**
 * Set a topic in global policy
 */
export function setGlobalTopicPolicy(topic: string, level: ResponseLevel, notes?: string): void {
  const config = loadAgentCommsConfig();
  config.globalPolicy[topic] = { level, ...(notes && { notes }) };
  saveAgentCommsConfig(config);
}

/**
 * Remove a topic from global policy
 */
export function removeGlobalTopicPolicy(topic: string): void {
  const config = loadAgentCommsConfig();
  delete config.globalPolicy[topic];
  saveAgentCommsConfig(config);
}

/**
 * Set default response level
 */
export function setDefaultLevel(level: ResponseLevel): void {
  const config = loadAgentCommsConfig();
  config.defaultLevel = level;
  saveAgentCommsConfig(config);
}

/**
 * Get effective policy for a peer and topic
 * Priority: peer-specific > global > default
 */
export function getEffectivePolicy(peerId: string, topic: string): TopicPolicy {
  const config = loadAgentCommsConfig();
  const peer = getPeer(peerId);

  // Check peer-specific policy first
  if (peer?.responsePolicy?.[topic]) {
    return peer.responsePolicy[topic];
  }

  // Fall back to global policy
  if (config.globalPolicy[topic]) {
    return config.globalPolicy[topic];
  }

  // Fall back to default level
  return { level: config.defaultLevel };
}

/**
 * Get all effective policies for a peer (merged global + peer-specific)
 */
export function getAllEffectivePolicies(peerId: string): ResponsePolicy {
  const config = loadAgentCommsConfig();
  const peer = getPeer(peerId);

  // Start with global policies
  const effective: ResponsePolicy = { ...config.globalPolicy };

  // Override with peer-specific policies
  if (peer?.responsePolicy) {
    for (const [topic, policy] of Object.entries(peer.responsePolicy)) {
      effective[topic] = policy;
    }
  }

  return effective;
}

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
export function logActivity(entry: Omit<ActivityEntry, 'timestamp'>): void {
  const config = loadAgentCommsConfig();
  if (!config.activityLog) return;

  ensureConfigDir();

  const fullEntry: ActivityEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };

  // Truncate message for logging
  const maxMsgLen = 100;
  let msgPreview = entry.message;
  if (msgPreview.length > maxMsgLen) {
    msgPreview = msgPreview.substring(0, maxMsgLen) + '...';
    fullEntry.truncated = true;
  }

  // Format log line
  const dirSymbol = entry.direction === 'in' ? '[IN] ' : '[OUT]';
  const arrow = entry.direction === 'in' ? '→' : '←';
  const levelTag = entry.level ? ` [${entry.level.toUpperCase()}]` : '';
  const logLine = `${fullEntry.timestamp} ${dirSymbol} ${entry.peerName} ${arrow} ${entry.topic}:${levelTag} ${msgPreview}\n`;

  // Append to log file
  fs.appendFileSync(ACTIVITY_LOG_FILE, logLine, 'utf-8');

  // Rotate if too large
  rotateActivityLog();
}

/**
 * Rotate activity log if it exceeds max lines
 */
function rotateActivityLog(): void {
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return;

  const content = fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length > MAX_LOG_LINES) {
    // Keep only the last MAX_LOG_LINES entries
    const trimmed = lines.slice(-MAX_LOG_LINES).join('\n') + '\n';
    fs.writeFileSync(ACTIVITY_LOG_FILE, trimmed, 'utf-8');
  }
}

/**
 * Read activity log entries
 */
export function readActivityLog(options?: {
  peerId?: string;
  last?: number;
}): string[] {
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];

  const content = fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8');
  let lines = content.split('\n').filter(l => l.trim());

  // Filter by peer if specified
  if (options?.peerId) {
    const peerId = options.peerId;
    lines = lines.filter(l => l.includes(peerId));
  }

  // Limit to last N entries
  if (options?.last && options.last > 0) {
    lines = lines.slice(-options.last);
  }

  return lines;
}

/**
 * Clear activity log
 */
export function clearActivityLog(): void {
  if (fs.existsSync(ACTIVITY_LOG_FILE)) {
    fs.unlinkSync(ACTIVITY_LOG_FILE);
  }
}

/**
 * Enable/disable activity logging
 */
export function setActivityLogging(enabled: boolean): void {
  const config = loadAgentCommsConfig();
  config.activityLog = enabled;
  saveAgentCommsConfig(config);
}
