import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
  // Agent-comms configuration (optional)
  agentComms?: AgentCommsConfig;
}

const DEFAULT_CONFIG_DIR = process.env.OGP_HOME ?? path.join(os.homedir(), '.ogp');
const CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, 'config.json');

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return DEFAULT_CONFIG_DIR;
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
    fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): OGPConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as OGPConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: OGPConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function requireConfig(): OGPConfig {
  const config = loadConfig();
  if (!config) {
    console.error('No configuration found. Run "ogp setup" first.');
    process.exit(1);
  }
  return config;
}
