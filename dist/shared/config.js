import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
/**
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export function getConfigDir() {
    return process.env.OGP_HOME ?? path.join(os.homedir(), '.ogp');
}
/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}
export function ensureConfigDir() {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}
export function loadConfig() {
    try {
        const configFile = getConfigPath();
        if (!fs.existsSync(configFile)) {
            return null;
        }
        const data = fs.readFileSync(configFile, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Failed to load config:', error);
        return null;
    }
}
export function saveConfig(config) {
    ensureConfigDir();
    const configFile = getConfigPath();
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}
export function requireConfig() {
    const config = loadConfig();
    if (!config) {
        console.error('No configuration found. Run "ogp setup" first.');
        process.exit(1);
    }
    return config;
}
//# sourceMappingURL=config.js.map