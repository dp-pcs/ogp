import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.ogp');
const CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, 'config.json');
export function getConfigPath() {
    return CONFIG_FILE;
}
export function getConfigDir() {
    return DEFAULT_CONFIG_DIR;
}
export function ensureConfigDir() {
    if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
        fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
    }
}
export function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Failed to load config:', error);
        return null;
    }
}
export function saveConfig(config) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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