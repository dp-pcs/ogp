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
import { getConfigDir, ensureConfigDir, loadConfig, saveConfig } from '../shared/config.js';
import { getPeer } from './peers.js';
const MAX_LOG_LINES = 1000;
function getActivityLogFile() {
    return path.join(getConfigDir(), 'activity.log');
}
// Structured (machine-readable) activity store, written alongside the human
// text log so UIs (e.g. the companion app) can render full, untruncated entries.
function getActivityJsonlFile() {
    return path.join(getConfigDir(), 'activity.jsonl');
}
const DEFAULT_AGENT_COMMS_CONFIG = {
    globalPolicy: {
        'general': { level: 'summary' },
        'testing': { level: 'full' }
    },
    defaultLevel: 'off',
    activityLog: true
};
/**
 * Load agent-comms configuration from main config
 */
export function loadAgentCommsConfig() {
    const config = loadConfig();
    if (!config)
        return DEFAULT_AGENT_COMMS_CONFIG;
    return config.agentComms || DEFAULT_AGENT_COMMS_CONFIG;
}
/**
 * Save agent-comms configuration to main config
 */
export function saveAgentCommsConfig(agentCommsConfig) {
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
export function updateGlobalPolicy(policy) {
    const config = loadAgentCommsConfig();
    config.globalPolicy = { ...config.globalPolicy, ...policy };
    saveAgentCommsConfig(config);
}
/**
 * Set a topic in global policy
 */
export function setGlobalTopicPolicy(topic, level, notes) {
    const config = loadAgentCommsConfig();
    config.globalPolicy[topic] = { level, ...(notes && { notes }) };
    saveAgentCommsConfig(config);
}
/**
 * Remove a topic from global policy
 */
export function removeGlobalTopicPolicy(topic) {
    const config = loadAgentCommsConfig();
    delete config.globalPolicy[topic];
    saveAgentCommsConfig(config);
}
/**
 * Set default response level
 */
export function setDefaultLevel(level) {
    const config = loadAgentCommsConfig();
    config.defaultLevel = level;
    saveAgentCommsConfig(config);
}
/**
 * Get effective policy for a peer and topic
 * Priority: peer-topic > global-topic > peer-default > global-default
 */
export function getEffectivePolicy(peerId, topic) {
    const config = loadAgentCommsConfig();
    const peer = getPeer(peerId);
    // 1. Check peer-specific topic policy first
    if (peer?.responsePolicy?.[topic]) {
        return peer.responsePolicy[topic];
    }
    // 2. Fall back to global topic policy
    if (config.globalPolicy[topic]) {
        return config.globalPolicy[topic];
    }
    // 3. Fall back to peer-specific default level
    if (peer?.defaultLevel) {
        return { level: peer.defaultLevel };
    }
    // 4. Fall back to global default level
    return { level: config.defaultLevel };
}
/**
 * Get all effective policies for a peer (merged global + peer-specific)
 */
export function getAllEffectivePolicies(peerId) {
    const config = loadAgentCommsConfig();
    const peer = getPeer(peerId);
    // Start with global policies
    const effective = { ...config.globalPolicy };
    // Override with peer-specific policies
    if (peer?.responsePolicy) {
        for (const [topic, policy] of Object.entries(peer.responsePolicy)) {
            effective[topic] = policy;
        }
    }
    return effective;
}
/**
 * Log an activity entry
 */
export function logActivity(entry) {
    const config = loadAgentCommsConfig();
    if (!config.activityLog)
        return;
    ensureConfigDir();
    const fullEntry = {
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
    fs.appendFileSync(getActivityLogFile(), logLine, 'utf-8');
    // Also append the full, structured entry to the JSONL store. This keeps the
    // untruncated message and all fields so UIs can render real activity.
    // The `truncated` flag only applies to the text preview above, not here.
    const jsonlEntry = {
        timestamp: fullEntry.timestamp,
        direction: entry.direction,
        peerId: entry.peerId,
        peerName: entry.peerName,
        topic: entry.topic,
        message: entry.message,
        ...(entry.level ? { level: entry.level } : {})
    };
    fs.appendFileSync(getActivityJsonlFile(), JSON.stringify(jsonlEntry) + '\n', 'utf-8');
    // Rotate if too large
    rotateActivityLog();
    rotateActivityJsonl();
}
/**
 * Rotate activity log if it exceeds max lines
 */
function rotateActivityLog() {
    const activityLogFile = getActivityLogFile();
    if (!fs.existsSync(activityLogFile))
        return;
    const content = fs.readFileSync(activityLogFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > MAX_LOG_LINES) {
        // Keep only the last MAX_LOG_LINES entries
        const trimmed = lines.slice(-MAX_LOG_LINES).join('\n') + '\n';
        fs.writeFileSync(activityLogFile, trimmed, 'utf-8');
    }
}
/**
 * Rotate the JSONL activity store if it exceeds max lines
 */
function rotateActivityJsonl() {
    const jsonlFile = getActivityJsonlFile();
    if (!fs.existsSync(jsonlFile))
        return;
    const content = fs.readFileSync(jsonlFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > MAX_LOG_LINES) {
        const trimmed = lines.slice(-MAX_LOG_LINES).join('\n') + '\n';
        fs.writeFileSync(jsonlFile, trimmed, 'utf-8');
    }
}
/**
 * Read activity log entries
 */
export function readActivityLog(options) {
    const activityLogFile = getActivityLogFile();
    if (!fs.existsSync(activityLogFile))
        return [];
    const content = fs.readFileSync(activityLogFile, 'utf-8');
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
 * Read structured activity entries from the JSONL store.
 * Mirrors readActivityLog's filter/limit semantics, but returns full
 * ActivityEntry objects (untruncated). Malformed lines are skipped.
 */
export function readActivityJsonl(options) {
    const jsonlFile = getActivityJsonlFile();
    if (!fs.existsSync(jsonlFile))
        return [];
    const content = fs.readFileSync(jsonlFile, 'utf-8');
    let entries = [];
    for (const line of content.split('\n')) {
        if (!line.trim())
            continue;
        try {
            entries.push(JSON.parse(line));
        }
        catch {
            // Tolerate a malformed/partial line (e.g. interrupted append)
        }
    }
    // Filter by peer if specified (match peerId or peerName)
    if (options?.peerId) {
        const needle = options.peerId;
        entries = entries.filter(e => e.peerId === needle || e.peerName === needle);
    }
    // Limit to last N entries
    if (options?.last && options.last > 0) {
        entries = entries.slice(-options.last);
    }
    return entries;
}
/**
 * Clear activity log
 */
export function clearActivityLog() {
    const activityLogFile = getActivityLogFile();
    if (fs.existsSync(activityLogFile)) {
        fs.unlinkSync(activityLogFile);
    }
}
/**
 * Enable/disable activity logging
 */
export function setActivityLogging(enabled) {
    const config = loadAgentCommsConfig();
    config.activityLog = enabled;
    saveAgentCommsConfig(config);
}
//# sourceMappingURL=agent-comms.js.map