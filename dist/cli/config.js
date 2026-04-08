import { Command } from 'commander';
import { loadMetaConfig, saveMetaConfig } from '../shared/meta-config.js';
import { detectFrameworks } from '../shared/framework-detection.js';
/**
 * Show all configured frameworks and default
 */
function showConfig() {
    const meta = loadMetaConfig();
    const detected = detectFrameworks();
    console.log('\nOGP Configuration');
    console.log('━'.repeat(44));
    console.log('');
    // Default framework
    if (meta.default) {
        console.log(`Default framework: ${meta.default}`);
    }
    else {
        console.log('Default framework: (none)');
    }
    console.log('');
    // Enabled frameworks
    const enabledFrameworks = meta.frameworks.filter(f => f.enabled);
    if (enabledFrameworks.length > 0) {
        console.log('Enabled frameworks:');
        enabledFrameworks.forEach(f => {
            const port = f.daemonPort ? `:${f.daemonPort}` : '';
            console.log(`  ${f.id.padEnd(12)} ${f.name.padEnd(10)} ${f.configDir.padEnd(20)} ${port}`);
        });
    }
    else {
        console.log('Enabled frameworks: (none)');
    }
    console.log('');
    // Aliases
    if (meta.aliases && Object.keys(meta.aliases).length > 0) {
        console.log('Aliases:');
        Object.entries(meta.aliases).forEach(([alias, target]) => {
            console.log(`  ${alias} → ${target}`);
        });
        console.log('');
    }
    // Meta config path
    console.log(`Meta config: ~/.ogp-meta/config.json`);
    console.log('');
}
/**
 * Set default framework
 */
function setDefault(frameworkId) {
    const meta = loadMetaConfig();
    // Check if framework exists in meta config
    const framework = meta.frameworks.find(f => f.id === frameworkId);
    if (!framework) {
        console.error(`Error: Framework '${frameworkId}' not found in configuration.`);
        console.error(`Available frameworks: ${meta.frameworks.map(f => f.id).join(', ')}`);
        process.exit(1);
    }
    // Check if framework is enabled
    if (!framework.enabled) {
        console.error(`Error: Framework '${frameworkId}' is not enabled. Enable it first with 'ogp config enable ${frameworkId}'`);
        process.exit(1);
    }
    meta.default = frameworkId;
    saveMetaConfig(meta);
    console.log(`✓ Set default framework to '${frameworkId}'`);
}
/**
 * List all frameworks (short format)
 */
function listFrameworks(quiet = false) {
    const meta = loadMetaConfig();
    if (quiet) {
        // Just print IDs, one per line (for shell completion)
        meta.frameworks.forEach(f => console.log(f.id));
        return;
    }
    // Short format
    if (meta.frameworks.length === 0) {
        console.log('No frameworks configured.');
        return;
    }
    console.log('\nConfigured frameworks:');
    meta.frameworks.forEach(f => {
        const status = f.enabled ? '✓' : '✗';
        const defaultMark = meta.default === f.id ? ' (default)' : '';
        console.log(`  ${status} ${f.id} - ${f.name}${defaultMark}`);
    });
    console.log('');
}
/**
 * Enable a framework
 */
function enableFramework(frameworkId) {
    const meta = loadMetaConfig();
    const framework = meta.frameworks.find(f => f.id === frameworkId);
    if (!framework) {
        console.error(`Error: Framework '${frameworkId}' not found in configuration.`);
        console.error(`Available frameworks: ${meta.frameworks.map(f => f.id).join(', ')}`);
        process.exit(1);
    }
    if (framework.enabled) {
        console.log(`Framework '${frameworkId}' is already enabled.`);
        return;
    }
    framework.enabled = true;
    saveMetaConfig(meta);
    console.log(`✓ Enabled framework '${frameworkId}'`);
}
/**
 * Disable a framework
 */
function disableFramework(frameworkId) {
    const meta = loadMetaConfig();
    const framework = meta.frameworks.find(f => f.id === frameworkId);
    if (!framework) {
        console.error(`Error: Framework '${frameworkId}' not found in configuration.`);
        console.error(`Available frameworks: ${meta.frameworks.map(f => f.id).join(', ')}`);
        process.exit(1);
    }
    if (!framework.enabled) {
        console.log(`Framework '${frameworkId}' is already disabled.`);
        return;
    }
    // Check if it's the default framework
    if (meta.default === frameworkId) {
        console.error(`Error: Cannot disable the default framework '${frameworkId}'.`);
        console.error(`Set a different default first with 'ogp config set-default <framework>'`);
        process.exit(1);
    }
    framework.enabled = false;
    saveMetaConfig(meta);
    console.log(`✓ Disabled framework '${frameworkId}'`);
}
/**
 * Show all detected frameworks (detected vs enabled)
 */
function showFrameworks() {
    const meta = loadMetaConfig();
    const detected = detectFrameworks();
    console.log('\nFramework Detection');
    console.log('━'.repeat(44));
    console.log('');
    console.log('Detected frameworks:');
    detected.forEach(d => {
        const status = d.detected ? '✓ detected' : '✗ not detected';
        const enabled = meta.frameworks.find(f => f.id === d.id)?.enabled ? ' (enabled)' : '';
        console.log(`  ${d.id.padEnd(12)} ${d.name.padEnd(12)} ${status}${enabled}`);
    });
    console.log('');
    console.log('Enabled frameworks:');
    const enabledFrameworks = meta.frameworks.filter(f => f.enabled);
    if (enabledFrameworks.length > 0) {
        enabledFrameworks.forEach(f => {
            const detectedInfo = detected.find(d => d.id === f.id);
            const detectedStatus = detectedInfo?.detected ? '✓' : '✗';
            console.log(`  ${detectedStatus} ${f.id.padEnd(12)} ${f.name}`);
        });
    }
    else {
        console.log('  (none)');
    }
    console.log('');
}
// Create the config command
export const configCommand = new Command('config')
    .description('Manage OGP framework configuration');
configCommand
    .command('show')
    .description('Show all configured frameworks and default')
    .action(() => {
    showConfig();
});
configCommand
    .command('set-default')
    .description('Set default framework')
    .argument('<framework>', 'Framework ID to set as default')
    .action((framework) => {
    setDefault(framework);
});
configCommand
    .command('list')
    .description('List all frameworks (short format)')
    .option('-q, --quiet', 'Output framework IDs only (for completion)')
    .action((options) => {
    listFrameworks(options.quiet);
});
configCommand
    .command('enable')
    .description('Enable a framework')
    .argument('<framework>', 'Framework ID to enable')
    .action((framework) => {
    enableFramework(framework);
});
configCommand
    .command('disable')
    .description('Disable a framework')
    .argument('<framework>', 'Framework ID to disable')
    .action((framework) => {
    disableFramework(framework);
});
configCommand
    .command('frameworks')
    .description('Show all detected frameworks (detected vs enabled)')
    .action(() => {
    showFrameworks();
});
//# sourceMappingURL=config.js.map