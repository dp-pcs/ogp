import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { detectFrameworks } from '../shared/framework-detection.js';
import { loadMetaConfig, saveMetaConfig } from '../shared/meta-config.js';
import { detectExistingInstallations, executeMigration } from '../shared/migration.js';
function loadOpenClawConfig() {
    try {
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        if (!fs.existsSync(configPath)) {
            return null;
        }
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        return null;
    }
}
function getAgentsFromConfig(config) {
    // Prefer agents.list for full identity info
    if (config.agents?.list && config.agents.list.length > 0) {
        return config.agents.list;
    }
    // Fall back to bindings
    if (config.bindings && config.bindings.length > 0) {
        return config.bindings.map(b => ({ id: b.agentId }));
    }
    return [];
}
async function promptForAgentId(rl, agents) {
    if (agents.length === 0) {
        const answer = await rl.question('Agent ID that owns this gateway [main]: ');
        return answer.trim() || 'main';
    }
    if (agents.length === 1) {
        const defaultAgent = agents[0].id;
        const answer = await rl.question(`Agent ID that owns this gateway [${defaultAgent}]: `);
        return answer.trim() || defaultAgent;
    }
    console.log('\nAvailable agents:');
    agents.forEach((agent, idx) => {
        const displayName = agent.identity?.name || agent.id;
        const emoji = agent.identity?.emoji || '🤖';
        console.log(`  ${idx + 1}. ${emoji} ${displayName} (${agent.id})`);
    });
    const answer = await rl.question('\nWhich agent owns this gateway? (number or ID) [1]: ');
    const trimmed = answer.trim();
    if (!trimmed) {
        return agents[0].id;
    }
    // Check if they entered a number
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
        return agents[num - 1].id;
    }
    // Otherwise treat as agent ID
    const found = agents.find(a => a.id === trimmed);
    if (found) {
        return found.id;
    }
    // If not found but they entered something, use it as custom ID
    if (trimmed) {
        return trimmed;
    }
    return agents[0].id;
}
async function promptYesNo(rl, question, defaultYes = true) {
    const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
    const answer = await rl.question(question + suffix);
    const trimmed = answer.trim().toLowerCase();
    if (!trimmed) {
        return defaultYes;
    }
    return trimmed === 'y' || trimmed === 'yes';
}
async function promptMultiSelect(rl, frameworks) {
    console.log('\nAvailable frameworks:');
    frameworks.forEach((fw, idx) => {
        const status = fw.detected ? '(detected)' : '(not detected)';
        console.log(`  ${idx + 1}. ${fw.name} ${status}`);
    });
    const answer = await rl.question('\nSelect frameworks (comma-separated numbers or "all") [all detected]: ');
    const trimmed = answer.trim().toLowerCase();
    if (!trimmed || trimmed === 'all') {
        // Select all detected frameworks
        const detected = frameworks.filter(f => f.detected);
        return detected.length > 0 ? detected : [frameworks[frameworks.length - 1]]; // Fallback to standalone
    }
    // Parse comma-separated numbers
    const selected = [];
    const parts = trimmed.split(',').map(s => s.trim());
    for (const part of parts) {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= frameworks.length) {
            selected.push(frameworks[num - 1]);
        }
    }
    return selected.length > 0 ? selected : frameworks.filter(f => f.detected);
}
async function setupFramework(rl, framework, agents) {
    console.log(`\n--- Setting up ${framework.name} ---`);
    // Prompt for gateway URL
    const gatewayUrl = await rl.question('Gateway URL (your public URL — run "ogp expose" first, or leave blank to set later): ');
    // Prompt for display name
    const displayName = await rl.question(`Display name [${framework.name} Gateway]: `);
    // Prompt for email
    const email = await rl.question('Email: ');
    // Framework-specific configuration
    let openclawUrl = '';
    let openclawToken = '';
    let hermesWebhookUrl = '';
    let hermesWebhookSecret = '';
    if (framework.id === 'openclaw') {
        openclawUrl = await rl.question('OpenClaw URL [http://localhost:18789]: ');
        openclawToken = await rl.question('OpenClaw API token: ');
    }
    else if (framework.id === 'hermes') {
        const useDefaults = await promptYesNo(rl, 'Use default Hermes webhook settings?', true);
        if (!useDefaults) {
            hermesWebhookUrl = await rl.question('Hermes webhook URL: ');
            hermesWebhookSecret = await rl.question('Hermes webhook secret: ');
        }
    }
    // Prompt for agent ID
    const agentId = await promptForAgentId(rl, agents);
    // Create framework configuration
    const frameworkConfig = {
        id: framework.id,
        name: framework.name,
        enabled: true,
        configDir: framework.suggestedConfigDir,
        daemonPort: framework.suggestedPort,
        gatewayUrl: gatewayUrl.trim() || undefined,
        displayName: displayName.trim() || `${framework.name} Gateway`,
        platform: framework.id === 'standalone' ? undefined : framework.id,
    };
    // Save individual OGP config for this framework
    const ogpConfig = {
        daemonPort: framework.suggestedPort,
        openclawUrl: openclawUrl.trim() || 'http://localhost:18789',
        openclawToken: openclawToken.trim() || '',
        gatewayUrl: gatewayUrl.trim() || '',
        displayName: displayName.trim() || `${framework.name} Gateway`,
        email: email.trim() || '',
        stateDir: framework.suggestedConfigDir,
        agentId,
        platform: framework.id === 'standalone' ? undefined : framework.id,
        hermesWebhookUrl: hermesWebhookUrl.trim() || undefined,
        hermesWebhookSecret: hermesWebhookSecret.trim() || undefined,
    };
    // Ensure config directory exists
    const expandedConfigDir = framework.suggestedConfigDir.replace(/^~/, os.homedir());
    if (!fs.existsSync(expandedConfigDir)) {
        fs.mkdirSync(expandedConfigDir, { recursive: true });
    }
    // Save OGP config
    const configPath = path.join(expandedConfigDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(ogpConfig, null, 2), 'utf-8');
    // Generate keypair for this framework
    // We need to temporarily set OGP_HOME to this framework's config dir
    const originalOgpHome = process.env.OGP_HOME;
    process.env.OGP_HOME = expandedConfigDir;
    try {
        const keypair = loadOrGenerateKeyPair();
        console.log(`  ✓ Configuration saved to ${expandedConfigDir}`);
        console.log(`  ✓ Ed25519 keypair generated`);
        console.log(`  ✓ Public key: ${keypair.publicKey.substring(0, 16)}...`);
        console.log(`  ✓ Agent: ${agentId}`);
    }
    finally {
        // Restore original OGP_HOME
        if (originalOgpHome) {
            process.env.OGP_HOME = originalOgpHome;
        }
        else {
            delete process.env.OGP_HOME;
        }
    }
    return frameworkConfig;
}
export async function runSetup() {
    console.log('=== OGP Multi-Framework Setup ===\n');
    const rl = readline.createInterface({ input, output });
    try {
        // Step 1: Check for existing installations and migrate if needed
        const migrationPlan = detectExistingInstallations();
        if (migrationPlan.needed) {
            console.log('Found existing OGP installation(s):');
            migrationPlan.existingInstalls.forEach(install => {
                console.log(`  - ${install.path} (${install.framework})`);
            });
            console.log('\nMigration plan:');
            migrationPlan.actions.forEach(action => {
                console.log(`  - ${action.description}`);
            });
            const shouldMigrate = await promptYesNo(rl, '\nMigrate to new multi-framework setup?', true);
            if (shouldMigrate) {
                console.log('\nExecuting migration...');
                await executeMigration(migrationPlan);
                console.log('\n✓ Migration complete!');
                console.log('\nRun "ogp setup" again to configure additional frameworks if needed.');
                rl.close();
                return;
            }
            else {
                console.log('\nSkipping migration. Proceeding with fresh setup...');
            }
        }
        // Step 2: Detect available frameworks
        const availableFrameworks = detectFrameworks();
        // Step 3: Show framework selection
        const selectedFrameworks = await promptMultiSelect(rl, availableFrameworks);
        if (selectedFrameworks.length === 0) {
            console.log('\nNo frameworks selected. Exiting setup.');
            rl.close();
            return;
        }
        console.log(`\nSelected frameworks: ${selectedFrameworks.map(f => f.name).join(', ')}`);
        // Step 4: Load agents from OpenClaw config (if available)
        const openclawConfig = loadOpenClawConfig();
        const agents = openclawConfig ? getAgentsFromConfig(openclawConfig) : [];
        // Step 5: Setup each selected framework
        const metaConfig = loadMetaConfig();
        for (const framework of selectedFrameworks) {
            const frameworkConfig = await setupFramework(rl, framework, agents);
            // Remove existing framework config if present
            const existingIndex = metaConfig.frameworks.findIndex(f => f.id === framework.id);
            if (existingIndex !== -1) {
                metaConfig.frameworks.splice(existingIndex, 1);
            }
            metaConfig.frameworks.push(frameworkConfig);
        }
        // Step 6: Set default framework (first selected)
        if (!metaConfig.default && metaConfig.frameworks.length > 0) {
            metaConfig.default = selectedFrameworks[0].id;
        }
        // Step 7: Save meta config
        saveMetaConfig(metaConfig);
        console.log(`\n✓ Meta configuration saved`);
        console.log(`  Default framework: ${metaConfig.default}`);
        // Step 8: Show success message with next steps
        console.log('\n=== Setup Complete! ===');
        console.log('\nNext steps:');
        console.log('  1. Start the daemon(s):');
        metaConfig.frameworks.forEach(fw => {
            if (fw.enabled) {
                console.log(`     ogp start --framework ${fw.id}`);
            }
        });
        console.log('  2. Expose your gateway (if needed):');
        console.log(`     ogp expose --framework ${metaConfig.default}`);
        console.log('  3. Start federating with peers:');
        console.log('     ogp peers add <peer-gateway-url>');
        rl.close();
    }
    catch (error) {
        rl.close();
        throw error;
    }
}
//# sourceMappingURL=setup.js.map