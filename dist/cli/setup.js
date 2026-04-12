import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { requireConfig, saveConfig } from '../shared/config.js';
import { loadOrGenerateKeyPair } from '../daemon/keypair.js';
import { detectFrameworks } from '../shared/framework-detection.js';
import { loadMetaConfig, saveMetaConfig } from '../shared/meta-config.js';
import { detectExistingInstallations, executeMigration } from '../shared/migration.js';
const DEFAULT_HERMES_WEBHOOK_URL = 'http://localhost:8644/webhooks/ogp_federation';
const DEFAULT_HERMES_WEBHOOK_SECRET = 'ogp-test-secret-hermes-2026';
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
function getHumanSurfacingDefault(mode) {
    if (mode === 'forward') {
        return 'always';
    }
    if (mode === 'approval-required') {
        return 'important-only';
    }
    return 'summary-only';
}
function getRelayHandlingDefault(mode) {
    if (mode === 'approval-required') {
        return 'approval-required';
    }
    if (mode === 'summarize') {
        return 'summarize';
    }
    return 'deliver';
}
async function promptInboundFederationMode(rl, currentMode = 'summarize') {
    console.log('\nHow should this agent handle inbound federated requests by default?');
    console.log('  1. forward           Tell me everything');
    console.log('  2. summarize         Tell me only the important/actionable parts');
    console.log('  3. autonomous        Act on your own unless blocked or asked to relay something');
    console.log('  4. approval-required Do not act or reply without my approval');
    const defaultChoice = currentMode === 'forward'
        ? '1'
        : currentMode === 'autonomous'
            ? '3'
            : currentMode === 'approval-required'
                ? '4'
                : '2';
    const answer = await rl.question(`\nChoose handling mode [${defaultChoice}]: `);
    const trimmed = answer.trim().toLowerCase();
    switch (trimmed) {
        case '1':
        case 'forward':
            return 'forward';
        case '3':
        case 'autonomous':
            return 'autonomous';
        case '4':
        case 'approval-required':
        case 'approval':
            return 'approval-required';
        case '':
            return currentMode;
        case '2':
        case 'summarize':
        default:
            return 'summarize';
    }
}
async function promptHumanSurfacingMode(rl, defaultMode, currentMode = getHumanSurfacingDefault(defaultMode)) {
    console.log('\nHow much of inbound federated work should be surfaced to the human by default?');
    console.log('  1. always         Forward or surface every inbound item');
    console.log('  2. summary-only   Surface a concise summary');
    console.log('  3. important-only Surface only important, uncertain, or actionable items');
    console.log('  4. never          Do not proactively surface unless another rule requires it');
    const defaultChoice = currentMode === 'always'
        ? '1'
        : currentMode === 'important-only'
            ? '3'
            : currentMode === 'never'
                ? '4'
                : '2';
    const answer = await rl.question(`\nChoose human surfacing mode [${defaultChoice}]: `);
    const trimmed = answer.trim().toLowerCase();
    switch (trimmed) {
        case '1':
        case 'always':
            return 'always';
        case '3':
        case 'important':
        case 'important-only':
            return 'important-only';
        case '4':
        case 'never':
            return 'never';
        case '':
            return currentMode;
        case '2':
        case 'summary':
        case 'summary-only':
        default:
            return 'summary-only';
    }
}
async function promptRelayHandlingMode(rl, defaultMode, currentMode = getRelayHandlingDefault(defaultMode)) {
    console.log('\nIf a peer explicitly asks your agent to tell the human something, what should happen?');
    console.log('  1. deliver           Treat it as a delivery obligation');
    console.log('  2. summarize         Summarize it for the human instead of relaying verbatim');
    console.log('  3. approval-required Hold it for approval before treating it as delivered');
    const defaultChoice = currentMode === 'summarize'
        ? '2'
        : currentMode === 'approval-required'
            ? '3'
            : '1';
    const answer = await rl.question(`\nChoose relay handling [${defaultChoice}]: `);
    const trimmed = answer.trim().toLowerCase();
    switch (trimmed) {
        case '2':
        case 'summarize':
            return 'summarize';
        case '3':
        case 'approval':
        case 'approval-required':
            return 'approval-required';
        case '':
            return currentMode;
        case '1':
        case 'deliver':
        default:
            return 'deliver';
    }
}
async function promptApprovalTopics(rl, currentTopics = []) {
    const currentDisplay = currentTopics.join(', ');
    const answer = await rl.question(`\nTopics that should always require approval before the agent acts or replies (comma-separated${currentDisplay ? `, blank to keep ${currentDisplay}` : ', blank for none'}): `);
    if (!answer.trim()) {
        return currentTopics;
    }
    return answer
        .split(',')
        .map(topic => topic.trim())
        .filter(Boolean);
}
async function promptTrustedPeerAutonomy(rl, currentValue = true) {
    return promptYesNo(rl, 'Should trusted peers be eligible for more autonomy than the default policy later?', currentValue);
}
export function buildDelegatedAuthorityConfig(options) {
    const { inboundMode, humanSurfacingMode, relayHandlingMode, approvalTopics, trustedPeerAutonomy } = options;
    const topicRules = approvalTopics.reduce((rules, topic) => {
        rules[topic] = {
            mode: 'approval-required',
            relayMode: 'approval-required',
            surfaceToHuman: 'always',
            allowDirectPeerReply: false,
            notes: 'Approval-required topic from setup interview.'
        };
        return rules;
    }, {});
    return {
        global: {
            defaultRule: {
                mode: inboundMode,
                relayMode: relayHandlingMode,
                surfaceToHuman: humanSurfacingMode,
                allowDirectPeerReply: inboundMode !== 'approval-required',
                notes: trustedPeerAutonomy
                    ? 'Trusted peers may receive more autonomy through future per-peer overrides.'
                    : 'Trusted peers should not receive more autonomy than the default policy without an explicit future change.'
            },
            classRules: {
                'agent-work': {
                    mode: inboundMode,
                    surfaceToHuman: humanSurfacingMode,
                    allowDirectPeerReply: inboundMode !== 'approval-required'
                },
                'human-relay': {
                    mode: inboundMode === 'approval-required' ? 'approval-required' : 'forward',
                    relayMode: relayHandlingMode,
                    surfaceToHuman: relayHandlingMode === 'deliver' ? 'always' : humanSurfacingMode,
                    allowDirectPeerReply: false
                },
                'approval-request': {
                    mode: 'approval-required',
                    relayMode: 'approval-required',
                    surfaceToHuman: 'always',
                    allowDirectPeerReply: false
                },
                'status-update': {
                    mode: 'summarize',
                    surfaceToHuman: humanSurfacingMode === 'never' ? 'never' : 'summary-only',
                    allowDirectPeerReply: false
                }
            },
            ...(Object.keys(topicRules).length > 0 ? { topicRules } : {})
        },
        peers: {}
    };
}
export function deriveDelegatedAuthorityInterviewAnswers(config) {
    const inboundFederationMode = config.delegatedAuthority?.global.defaultRule.mode ??
        config.inboundFederationPolicy?.mode ??
        'summarize';
    const humanSurfacingMode = config.delegatedAuthority?.global.defaultRule.surfaceToHuman ??
        getHumanSurfacingDefault(inboundFederationMode);
    const relayHandlingMode = config.delegatedAuthority?.global.classRules?.['human-relay']?.relayMode ??
        config.delegatedAuthority?.global.defaultRule.relayMode ??
        getRelayHandlingDefault(inboundFederationMode);
    const approvalTopics = Object.entries(config.delegatedAuthority?.global.topicRules ?? {})
        .filter(([, rule]) => rule.mode === 'approval-required')
        .map(([topic]) => topic)
        .sort();
    const notes = config.delegatedAuthority?.global.defaultRule.notes?.toLowerCase() ?? '';
    const trustedPeerAutonomy = notes
        ? !notes.includes('should not receive more autonomy')
        : true;
    return {
        humanDeliveryTarget: config.humanDeliveryTarget,
        inboundFederationMode,
        humanSurfacingMode,
        relayHandlingMode,
        approvalTopics,
        trustedPeerAutonomy
    };
}
export function applyDelegatedAuthorityInterviewAnswers(config, answers) {
    return {
        ...config,
        humanDeliveryTarget: answers.humanDeliveryTarget?.trim() || undefined,
        delegatedAuthority: buildDelegatedAuthorityConfig({
            inboundMode: answers.inboundFederationMode,
            humanSurfacingMode: answers.humanSurfacingMode,
            relayHandlingMode: answers.relayHandlingMode,
            approvalTopics: answers.approvalTopics,
            trustedPeerAutonomy: answers.trustedPeerAutonomy
        }),
        inboundFederationPolicy: {
            mode: answers.inboundFederationMode
        }
    };
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
    const gatewayUrl = await rl.question('Gateway URL (your public URL — run "ogp expose" first; leave blank only if you understand federation/invites will not work until you set it later): ');
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
        if (useDefaults) {
            hermesWebhookUrl = DEFAULT_HERMES_WEBHOOK_URL;
            hermesWebhookSecret = DEFAULT_HERMES_WEBHOOK_SECRET;
        }
        else {
            hermesWebhookUrl = await rl.question('Hermes webhook URL: ');
            hermesWebhookSecret = await rl.question('Hermes webhook secret: ');
        }
    }
    // Prompt for agent ID
    const agentId = await promptForAgentId(rl, agents);
    let humanDeliveryTarget = '';
    if (framework.id !== 'hermes') {
        humanDeliveryTarget = await rl.question('Primary human delivery target for OGP followups (e.g. telegram:123456789, or leave blank to use notifyTarget/default): ');
    }
    else {
        console.log('  Hermes uses webhook delivery for OGP followups; skipping human delivery target prompt.');
    }
    const inboundFederationMode = await promptInboundFederationMode(rl);
    const humanSurfacingMode = await promptHumanSurfacingMode(rl, inboundFederationMode);
    const relayHandlingMode = await promptRelayHandlingMode(rl, inboundFederationMode);
    const approvalTopics = await promptApprovalTopics(rl);
    const trustedPeerAutonomy = await promptTrustedPeerAutonomy(rl);
    const delegatedAuthority = buildDelegatedAuthorityConfig({
        inboundMode: inboundFederationMode,
        humanSurfacingMode,
        relayHandlingMode,
        approvalTopics,
        trustedPeerAutonomy
    });
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
        humanDeliveryTarget: humanDeliveryTarget.trim() || undefined,
        delegatedAuthority,
        inboundFederationPolicy: {
            mode: inboundFederationMode
        },
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
        if (humanDeliveryTarget.trim()) {
            console.log(`  ✓ Human delivery target: ${humanDeliveryTarget.trim()}`);
        }
        console.log(`  ✓ Inbound federation mode: ${inboundFederationMode}`);
        console.log(`  ✓ Human surfacing mode: ${humanSurfacingMode}`);
        console.log(`  ✓ Relay handling mode: ${relayHandlingMode}`);
        if (approvalTopics.length > 0) {
            console.log(`  ✓ Approval-required topics: ${approvalTopics.join(', ')}`);
        }
        console.log(`  ✓ Trusted peers may receive extra autonomy later: ${trustedPeerAutonomy ? 'yes' : 'no'}`);
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
        const openclawAgents = openclawConfig ? getAgentsFromConfig(openclawConfig) : [];
        // Step 5: Setup each selected framework
        const metaConfig = loadMetaConfig();
        for (const framework of selectedFrameworks) {
            // Only OpenClaw currently supports agent auto-discovery from local config.
            // Other frameworks should not inherit the OpenClaw agent list.
            const frameworkAgents = framework.id === 'openclaw' ? openclawAgents : [];
            const frameworkConfig = await setupFramework(rl, framework, frameworkAgents);
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
export async function runAgentCommsInterview() {
    const config = requireConfig();
    const defaults = deriveDelegatedAuthorityInterviewAnswers(config);
    console.log('=== OGP Agent-Comms Interview ===\n');
    console.log('This updates delegated-authority and human-delivery behavior for the active framework.');
    const rl = readline.createInterface({ input, output });
    try {
        let humanDeliveryTarget = defaults.humanDeliveryTarget ?? '';
        if (config.platform !== 'hermes') {
            const humanDeliveryPrompt = defaults.humanDeliveryTarget?.trim()
                ? `Primary human delivery target for OGP followups [${defaults.humanDeliveryTarget.trim()}]: `
                : 'Primary human delivery target for OGP followups (e.g. telegram:123456789, or leave blank to use notifyTarget/default): ';
            const answer = await rl.question(humanDeliveryPrompt);
            humanDeliveryTarget = answer.trim() || humanDeliveryTarget;
        }
        else {
            console.log('  Hermes uses webhook delivery for OGP followups; skipping human delivery target prompt.');
        }
        const inboundFederationMode = await promptInboundFederationMode(rl, defaults.inboundFederationMode);
        const humanSurfacingMode = await promptHumanSurfacingMode(rl, inboundFederationMode, defaults.humanSurfacingMode);
        const relayHandlingMode = await promptRelayHandlingMode(rl, inboundFederationMode, defaults.relayHandlingMode);
        const approvalTopics = await promptApprovalTopics(rl, defaults.approvalTopics);
        const trustedPeerAutonomy = await promptTrustedPeerAutonomy(rl, defaults.trustedPeerAutonomy);
        const updatedConfig = applyDelegatedAuthorityInterviewAnswers(config, {
            humanDeliveryTarget,
            inboundFederationMode,
            humanSurfacingMode,
            relayHandlingMode,
            approvalTopics,
            trustedPeerAutonomy
        });
        saveConfig(updatedConfig);
        console.log('\n✓ Agent-comms interview saved');
        if (updatedConfig.humanDeliveryTarget) {
            console.log(`  ✓ Human delivery target: ${updatedConfig.humanDeliveryTarget}`);
        }
        console.log(`  ✓ Inbound federation mode: ${inboundFederationMode}`);
        console.log(`  ✓ Human surfacing mode: ${humanSurfacingMode}`);
        console.log(`  ✓ Relay handling mode: ${relayHandlingMode}`);
        console.log(`  ✓ Approval-required topics: ${approvalTopics.length > 0 ? approvalTopics.join(', ') : '(none)'}`);
        console.log(`  ✓ Trusted peers may receive extra autonomy later: ${trustedPeerAutonomy ? 'yes' : 'no'}`);
    }
    finally {
        rl.close();
    }
}
//# sourceMappingURL=setup.js.map