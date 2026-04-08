import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveMetaConfig } from './meta-config.js';
/**
 * Determine framework type from OGP config
 */
function determineFrameworkType(config) {
    // Explicit platform field takes precedence
    if (config.platform === 'hermes') {
        return 'hermes';
    }
    if (config.platform === 'openclaw') {
        return 'openclaw';
    }
    // Heuristics: check for framework-specific fields
    if (config.hermesWebhookUrl || config.hermesWebhookSecret) {
        return 'hermes';
    }
    if (config.openclawUrl && config.openclawToken) {
        return 'openclaw';
    }
    // Default to standalone if we can't determine
    return 'standalone';
}
/**
 * Check if a directory exists and contains a valid OGP config
 */
function checkInstallation(dirPath) {
    const expandedPath = dirPath.replace(/^~/, os.homedir());
    const configPath = path.join(expandedPath, 'config.json');
    if (!fs.existsSync(expandedPath) || !fs.existsSync(configPath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(data);
        const framework = determineFrameworkType(config);
        return {
            path: expandedPath,
            framework,
            config,
        };
    }
    catch (error) {
        // Invalid or corrupted config
        return null;
    }
}
/**
 * Detect all existing OGP installations
 * Returns a migration plan describing what needs to be done
 */
export function detectExistingInstallations() {
    const plan = {
        needed: false,
        existingInstalls: [],
        actions: [],
    };
    // Check for meta config - if it exists, no migration needed
    const metaConfigPath = path.join(os.homedir(), '.ogp-meta', 'config.json');
    if (fs.existsSync(metaConfigPath)) {
        return plan; // Already migrated
    }
    // Check for legacy installations
    const ogpInstall = checkInstallation('~/.ogp');
    const hermesInstall = checkInstallation('~/.ogp-hermes');
    if (ogpInstall) {
        plan.existingInstalls.push(ogpInstall);
    }
    if (hermesInstall) {
        plan.existingInstalls.push(hermesInstall);
    }
    // No existing installations found
    if (plan.existingInstalls.length === 0) {
        return plan;
    }
    // Migration is needed
    plan.needed = true;
    // Build migration actions based on what we found
    if (ogpInstall && hermesInstall) {
        // Both exist - rename .ogp to .ogp-openclaw if it's an OpenClaw install
        if (ogpInstall.framework === 'openclaw') {
            plan.actions.push({
                type: 'rename',
                from: ogpInstall.path,
                to: path.join(os.homedir(), '.ogp-openclaw'),
                framework: 'openclaw',
                description: 'Rename ~/.ogp to ~/.ogp-openclaw',
            });
        }
        // .ogp-hermes stays as-is
        plan.actions.push({
            type: 'register',
            framework: 'hermes',
            description: 'Register Hermes installation at ~/.ogp-hermes',
        });
        plan.actions.push({
            type: 'create-meta',
            description: 'Create meta config with both frameworks',
        });
    }
    else if (ogpInstall && !hermesInstall) {
        // Only .ogp exists
        if (ogpInstall.framework === 'openclaw') {
            plan.actions.push({
                type: 'rename',
                from: ogpInstall.path,
                to: path.join(os.homedir(), '.ogp-openclaw'),
                framework: 'openclaw',
                description: 'Rename ~/.ogp to ~/.ogp-openclaw',
            });
        }
        else if (ogpInstall.framework === 'standalone') {
            // Keep as ~/.ogp for standalone
            plan.actions.push({
                type: 'register',
                framework: 'standalone',
                description: 'Register standalone installation at ~/.ogp',
            });
        }
        plan.actions.push({
            type: 'create-meta',
            description: 'Create meta config',
        });
    }
    else if (!ogpInstall && hermesInstall) {
        // Only .ogp-hermes exists
        plan.actions.push({
            type: 'register',
            framework: 'hermes',
            description: 'Register Hermes installation at ~/.ogp-hermes',
        });
        plan.actions.push({
            type: 'create-meta',
            description: 'Create meta config with Hermes framework',
        });
    }
    return plan;
}
/**
 * Execute the migration plan
 * This will:
 * - Rename directories as needed
 * - Create the meta config
 * - Register all frameworks
 */
export async function executeMigration(plan) {
    if (!plan.needed) {
        return; // Nothing to do
    }
    const metaConfig = {
        version: '1.0.0',
        frameworks: [],
    };
    // Track renamed installations
    const renamedPaths = new Map();
    // Step 1: Execute rename actions
    for (const action of plan.actions) {
        if (action.type === 'rename' && action.from && action.to) {
            if (fs.existsSync(action.to)) {
                throw new Error(`Cannot rename ${action.from} to ${action.to}: target already exists`);
            }
            // Create backup of original location
            const backupPath = `${action.from}.backup-${Date.now()}`;
            fs.cpSync(action.from, backupPath, { recursive: true });
            try {
                fs.renameSync(action.from, action.to);
                renamedPaths.set(action.from, action.to);
                console.log(`✓ Renamed ${action.from} to ${action.to}`);
                console.log(`  Backup created at ${backupPath}`);
            }
            catch (error) {
                // Restore from backup on error
                if (fs.existsSync(backupPath)) {
                    fs.cpSync(backupPath, action.from, { recursive: true });
                }
                throw new Error(`Failed to rename ${action.from} to ${action.to}: ${error}`);
            }
        }
    }
    // Step 2: Register frameworks
    for (const install of plan.existingInstalls) {
        let configDir = install.path;
        // If this path was renamed, use the new path
        if (renamedPaths.has(install.path)) {
            configDir = renamedPaths.get(install.path);
        }
        // Determine framework ID based on type and path
        let frameworkId;
        let frameworkName;
        if (install.framework === 'openclaw') {
            frameworkId = 'openclaw';
            frameworkName = 'OpenClaw';
        }
        else if (install.framework === 'hermes') {
            frameworkId = 'hermes';
            frameworkName = 'Hermes';
        }
        else {
            frameworkId = 'standalone';
            frameworkName = 'Standalone OGP';
        }
        const framework = {
            id: frameworkId,
            name: frameworkName,
            enabled: true,
            configDir,
            daemonPort: install.config.daemonPort,
            gatewayUrl: install.config.gatewayUrl,
            displayName: install.config.displayName,
            platform: install.config.platform,
        };
        metaConfig.frameworks.push(framework);
        console.log(`✓ Registered ${frameworkName} at ${configDir}`);
    }
    // Step 3: Set default framework
    // Prefer openclaw, then hermes, then first available
    const openclawFramework = metaConfig.frameworks.find(f => f.id === 'openclaw');
    const hermesFramework = metaConfig.frameworks.find(f => f.id === 'hermes');
    if (openclawFramework) {
        metaConfig.default = 'openclaw';
    }
    else if (hermesFramework) {
        metaConfig.default = 'hermes';
    }
    else if (metaConfig.frameworks.length > 0) {
        metaConfig.default = metaConfig.frameworks[0].id;
    }
    // Step 4: Save meta config
    saveMetaConfig(metaConfig);
    console.log('✓ Created meta configuration');
    console.log(`  Default framework: ${metaConfig.default}`);
}
/**
 * Check if migration is needed and return a summary
 */
export function checkMigrationStatus() {
    const plan = detectExistingInstallations();
    if (!plan.needed) {
        return {
            migrationNeeded: false,
            summary: 'No migration needed',
        };
    }
    const installCount = plan.existingInstalls.length;
    const installTypes = plan.existingInstalls.map(i => i.framework).join(', ');
    const summary = `Found ${installCount} existing installation(s): ${installTypes}`;
    return {
        migrationNeeded: true,
        summary,
        plan,
    };
}
//# sourceMappingURL=migration.js.map