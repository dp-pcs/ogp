import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export type InboundFederationMode =
  | 'forward'
  | 'summarize'
  | 'autonomous'
  | 'approval-required';

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
  // Agent-comms configuration (optional)
  agentComms?: AgentCommsConfig;
  // Rendezvous configuration (optional)
  rendezvous?: RendezvousConfig;
  // Legacy: single notification target for all agents (backward compatibility)
  notifyTarget?: string;
  // Per-agent notification targets: { "main": "telegram:...", "scribe": "telegram:..." }
  notifyTargets?: Record<string, string>;
  // Explicit human-facing delivery target for OGP-triggered followups.
  // Examples: "telegram:123456789" or "agent:main:telegram:direct:123456789"
  humanDeliveryTarget?: string;
  // Policy describing how the local agent should handle inbound federated requests.
  inboundFederationPolicy?: InboundFederationPolicy;
  // BUILD-115: Agent-specific notification routing — which agent owns this gateway
  agentId?: string;

  // Platform selection (optional, defaults to 'openclaw' for backward compatibility)
  platform?: 'openclaw' | 'hermes';

  // Hermes-specific configuration (optional, only used when platform === 'hermes')
  hermesWebhookUrl?: string;
  hermesWebhookSecret?: string;
}

/**
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export function getConfigDir(): string {
  return process.env.OGP_HOME ?? path.join(os.homedir(), '.ogp');
}

/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): OGPConfig | null {
  try {
    const configFile = getConfigPath();
    if (!fs.existsSync(configFile)) {
      return null;
    }
    const data = fs.readFileSync(configFile, 'utf-8');
    return JSON.parse(data) as OGPConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: OGPConfig): void {
  ensureConfigDir();
  const configFile = getConfigPath();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

export function requireConfig(): OGPConfig {
  const config = loadConfig();
  if (!config) {
    console.error('No configuration found. Run "ogp setup" first.');
    process.exit(1);
  }
  return config;
}
