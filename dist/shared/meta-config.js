import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const DEFAULT_META_CONFIG_DIR = path.join(os.homedir(), '.ogp-meta');
const META_CONFIG_FILE = path.join(DEFAULT_META_CONFIG_DIR, 'config.json');
/**
 * Get the path to the meta config file
 */
export function getMetaConfigPath() {
    return META_CONFIG_FILE;
}
/**
 * Get the meta config directory path
 */
export function getMetaConfigDir() {
    return DEFAULT_META_CONFIG_DIR;
}
/**
 * Ensure the meta config directory exists
 */
export function ensureMetaConfigDir() {
    if (!fs.existsSync(DEFAULT_META_CONFIG_DIR)) {
        fs.mkdirSync(DEFAULT_META_CONFIG_DIR, { recursive: true });
    }
}
/**
 * Load the meta configuration
 * Returns sensible defaults if the file doesn't exist
 */
export function loadMetaConfig() {
    try {
        if (!fs.existsSync(META_CONFIG_FILE)) {
            // Return default configuration
            return {
                version: '1.0.0',
                frameworks: [],
            };
        }
        const data = fs.readFileSync(META_CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data);
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
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse meta config: ${error.message}`);
        }
        throw error;
    }
}
/**
 * Save the meta configuration
 */
export function saveMetaConfig(config) {
    ensureMetaConfigDir();
    // Validate before saving
    if (!config.version) {
        throw new Error('Cannot save meta config: missing version');
    }
    if (!Array.isArray(config.frameworks)) {
        throw new Error('Cannot save meta config: frameworks must be an array');
    }
    fs.writeFileSync(META_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
//# sourceMappingURL=meta-config.js.map