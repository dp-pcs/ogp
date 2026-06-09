import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Framework configuration entry
 */
export interface Framework {
  id: string;           // 'openclaw' | 'hermes' | 'standalone'
  name: string;         // Display name
  enabled: boolean;     // User selected during setup
  configDir: string;    // e.g., ~/.ogp-openclaw/
  daemonPort: number;   // e.g., 18790
  gatewayUrl?: string;  // User-provided
  displayName?: string; // e.g., "Junior @ OpenClaw"
  platform?: string;    // 'openclaw' | 'hermes' | undefined
}

/**
 * Meta configuration for managing multiple OGP framework installations
 */
export interface MetaConfig {
  version: string;      // Schema version (start with "1.0.0")
  frameworks: Framework[];
  default?: string;     // Default framework ID
  aliases?: Record<string, string>; // e.g., { "oc": "openclaw" }
}

/**
 * Resolve the meta config directory.
 *
 * Computed dynamically (not frozen at import time) so deployments can override
 * the location via OGP_META_HOME. This mirrors how OGP_HOME overrides the
 * per-framework config dir in config.ts. The default is ~/.ogp-meta.
 *
 * Override matters for server/container deployments (e.g. ECS) where $HOME may
 * differ between the process that ran `ogp setup` and the process that runs the
 * CLI — without an override the registry silently "doesn't exist".
 */
function resolveMetaConfigDir(): string {
  return process.env.OGP_META_HOME ?? path.join(os.homedir(), '.ogp-meta');
}

/**
 * Get the path to the meta config file
 */
export function getMetaConfigPath(): string {
  return path.join(resolveMetaConfigDir(), 'config.json');
}

/**
 * Get the meta config directory path
 */
export function getMetaConfigDir(): string {
  return resolveMetaConfigDir();
}

/**
 * Ensure the meta config directory exists
 */
export function ensureMetaConfigDir(): void {
  const dir = resolveMetaConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load the meta configuration
 * Returns sensible defaults if the file doesn't exist
 */
export function loadMetaConfig(): MetaConfig {
  const metaConfigFile = getMetaConfigPath();
  try {
    if (!fs.existsSync(metaConfigFile)) {
      // Return default configuration
      return {
        version: '1.0.0',
        frameworks: [],
      };
    }

    const data = fs.readFileSync(metaConfigFile, 'utf-8');
    const config = JSON.parse(data) as MetaConfig;

    // Validate schema
    if (!config.version) {
      throw new Error('Meta config missing required field: version');
    }
    if (!Array.isArray(config.frameworks)) {
      throw new Error('Meta config missing or invalid field: frameworks');
    }

    // Validate each framework
    for (const framework of config.frameworks) {
      if (!framework.id || typeof framework.id !== 'string') {
        throw new Error('Framework missing required field: id');
      }
      if (!framework.name || typeof framework.name !== 'string') {
        throw new Error(`Framework ${framework.id} missing required field: name`);
      }
      if (typeof framework.enabled !== 'boolean') {
        throw new Error(`Framework ${framework.id} missing required field: enabled`);
      }
      if (!framework.configDir || typeof framework.configDir !== 'string') {
        throw new Error(`Framework ${framework.id} missing required field: configDir`);
      }
      if (typeof framework.daemonPort !== 'number') {
        throw new Error(`Framework ${framework.id} missing required field: daemonPort`);
      }
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse meta config: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Save the meta configuration
 */
export function saveMetaConfig(config: MetaConfig): void {
  ensureMetaConfigDir();

  // Validate before saving
  if (!config.version) {
    throw new Error('Cannot save meta config: missing version');
  }
  if (!Array.isArray(config.frameworks)) {
    throw new Error('Cannot save meta config: frameworks must be an array');
  }

  fs.writeFileSync(getMetaConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
