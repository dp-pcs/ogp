import { Command } from 'commander';
import { loadMetaConfig, saveMetaConfig } from '../shared/meta-config.js';
import { detectFrameworks } from '../shared/framework-detection.js';
import { loadConfig, saveConfig, requireConfig, type OGPConfig } from '../shared/config.js';
import { loadHealthCheckConfig, getHeartbeatConfig } from '../daemon/heartbeat.js';

/**
 * Show all configured frameworks and default
 */
function showConfig(): void {
  const meta = loadMetaConfig();
  const detected = detectFrameworks();

  console.log('\nOGP Configuration');
  console.log('━'.repeat(44));
  console.log('');

  // Default framework
  if (meta.default) {
    console.log(`Default framework: ${meta.default}`);
  } else {
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
  } else {
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
function setDefault(frameworkId: string): void {
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
function listFrameworks(quiet: boolean = false): void {
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
function enableFramework(frameworkId: string): void {
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
function disableFramework(frameworkId: string): void {
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
function showFrameworks(): void {
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
  } else {
    console.log('  (none)');
  }
  console.log('');
}

/**
 * Show current health check configuration
 */
function showHealthCheckConfig(): void {
  const config = loadConfig();
  if (!config) {
    console.error('Error: No configuration found. Run "ogp setup" first.');
    process.exit(1);
  }

  // Load and show active config (including env var overrides)
  loadHealthCheckConfig();
  const active = getHeartbeatConfig();

  console.log('\nHealth Check Configuration');
  console.log('━'.repeat(44));
  console.log('');
  console.log(`Check interval:           ${active.intervalMs / 1000}s (${active.intervalMs}ms)`);
  console.log(`Check timeout:            ${active.timeoutMs / 1000}s (${active.timeoutMs}ms)`);
  console.log(`Max consecutive failures: ${active.maxConsecutiveFailures}`);
  console.log(`Heartbeat status:         ${active.isRunning ? 'Running' : 'Stopped'}`);
  console.log('');

  // Show config file values if different from active
  const configValues = config.healthCheck || {};
  if (Object.keys(configValues).length > 0) {
    console.log('Config file values:');
    if (configValues.intervalMs !== undefined) {
      console.log(`  intervalMs:              ${configValues.intervalMs}`);
    }
    if (configValues.timeoutMs !== undefined) {
      console.log(`  timeoutMs:               ${configValues.timeoutMs}`);
    }
    if (configValues.maxConsecutiveFailures !== undefined) {
      console.log(`  maxConsecutiveFailures:  ${configValues.maxConsecutiveFailures}`);
    }
    console.log('');
  }

  console.log('Environment variable overrides:');
  console.log(`  OGP_HEARTBEAT_INTERVAL_MS:   ${process.env.OGP_HEARTBEAT_INTERVAL_MS || '(not set)'}`);
  console.log(`  OGP_HEARTBEAT_TIMEOUT_MS:    ${process.env.OGP_HEARTBEAT_TIMEOUT_MS || '(not set)'}`);
  console.log(`  OGP_HEARTBEAT_MAX_FAILURES:  ${process.env.OGP_HEARTBEAT_MAX_FAILURES || '(not set)'}`);
  console.log('');
}

/**
 * Set health check interval
 */
function setHealthCheckInterval(intervalMs: string): void {
  const config = requireConfig();
  const value = parseInt(intervalMs, 10);

  if (isNaN(value) || value < 1000) {
    console.error('Error: Interval must be a positive number >= 1000 milliseconds');
    process.exit(1);
  }

  if (!config.healthCheck) {
    config.healthCheck = {};
  }

  config.healthCheck.intervalMs = value;
  saveConfig(config);

  console.log(`✓ Set health check interval to ${value}ms (${value / 1000}s)`);
  console.log('  Restart daemon for changes to take effect: ogp stop && ogp start --background');
}

/**
 * Set health check timeout
 */
function setHealthCheckTimeout(timeoutMs: string): void {
  const config = requireConfig();
  const value = parseInt(timeoutMs, 10);

  if (isNaN(value) || value < 1000) {
    console.error('Error: Timeout must be a positive number >= 1000 milliseconds');
    process.exit(1);
  }

  if (!config.healthCheck) {
    config.healthCheck = {};
  }

  config.healthCheck.timeoutMs = value;
  saveConfig(config);

  console.log(`✓ Set health check timeout to ${value}ms (${value / 1000}s)`);
  console.log('  Restart daemon for changes to take effect: ogp stop && ogp start --background');
}

/**
 * Show current identity configuration
 */
function showIdentity(): void {
  const config = requireConfig();

  console.log('\nIdentity Configuration');
  console.log('━'.repeat(44));
  console.log('');
  console.log(`Human name:    ${config.humanName || '(not set)'}`);
  console.log(`Agent name:    ${config.agentName || '(not set)'}`);
  console.log(`Organization:  ${config.organization || '(not set)'}`);
  console.log(`Tags:          ${config.tags && config.tags.length > 0 ? config.tags.join(', ') : '(none)'}`);
  console.log('');
  console.log(`Display name:  ${config.displayName}`);
  console.log(`Email:         ${config.email}`);
  console.log('');
}

/**
 * Update identity information
 */
function setIdentity(options: { humanName?: string; agentName?: string; organization?: string }): void {
  const config = requireConfig();
  let changed = false;

  if (options.humanName !== undefined) {
    config.humanName = options.humanName || undefined;
    changed = true;
  }

  if (options.agentName !== undefined) {
    config.agentName = options.agentName || undefined;
    changed = true;
  }

  if (options.organization !== undefined) {
    config.organization = options.organization || undefined;
    changed = true;
  }

  if (!changed) {
    console.error('Error: No changes specified. Use --human-name, --agent-name, or --organization');
    process.exit(1);
  }

  // Auto-update displayName if both humanName and agentName are set
  if (config.humanName && config.agentName) {
    config.displayName = `${config.humanName} - ${config.agentName}`;
  }

  saveConfig(config);

  console.log('✓ Identity updated');
  if (config.humanName) console.log(`  Human name: ${config.humanName}`);
  if (config.agentName) console.log(`  Agent name: ${config.agentName}`);
  if (config.organization) console.log(`  Organization: ${config.organization}`);
  if (config.humanName && config.agentName) {
    console.log(`  Display name: ${config.displayName}`);
  }
}

/**
 * Set tags (replaces existing)
 */
function setTags(tags: string[]): void {
  const config = requireConfig();
  config.tags = tags.filter(t => t.trim().length > 0);
  saveConfig(config);

  console.log(`✓ Tags set to: ${config.tags.join(', ')}`);
}

/**
 * Add a single tag
 */
function addTag(tag: string): void {
  const config = requireConfig();
  if (!config.tags) {
    config.tags = [];
  }

  const trimmed = tag.trim();
  if (config.tags.includes(trimmed)) {
    console.log(`Tag '${trimmed}' already exists`);
    return;
  }

  config.tags.push(trimmed);
  saveConfig(config);

  console.log(`✓ Added tag: ${trimmed}`);
  console.log(`  Current tags: ${config.tags.join(', ')}`);
}

/**
 * Remove a single tag
 */
function removeTag(tag: string): void {
  const config = requireConfig();
  if (!config.tags || config.tags.length === 0) {
    console.log('No tags to remove');
    return;
  }

  const trimmed = tag.trim();
  const before = config.tags.length;
  config.tags = config.tags.filter(t => t !== trimmed);

  if (config.tags.length === before) {
    console.log(`Tag '${trimmed}' not found`);
    return;
  }

  saveConfig(config);

  console.log(`✓ Removed tag: ${trimmed}`);
  if (config.tags.length > 0) {
    console.log(`  Remaining tags: ${config.tags.join(', ')}`);
  } else {
    console.log('  No tags remaining');
  }
}

/**
 * Set max consecutive failures threshold
 */
function setHealthCheckMaxFailures(maxFailures: string): void {
  const config = requireConfig();
  const value = parseInt(maxFailures, 10);

  if (isNaN(value) || value < 1) {
    console.error('Error: Max failures must be a positive number >= 1');
    process.exit(1);
  }

  if (!config.healthCheck) {
    config.healthCheck = {};
  }

  config.healthCheck.maxConsecutiveFailures = value;
  saveConfig(config);

  console.log(`✓ Set max consecutive failures to ${value}`);
  console.log('  Restart daemon for changes to take effect: ogp stop && ogp start --background');
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

// Health check configuration commands
const healthCheckCommand = configCommand
  .command('health-check')
  .description('Manage health check configuration');

healthCheckCommand
  .command('show')
  .description('Show current health check configuration')
  .action(() => {
    showHealthCheckConfig();
  });

healthCheckCommand
  .command('interval')
  .description('Set health check interval in milliseconds')
  .argument('<ms>', 'Interval in milliseconds (minimum 1000)')
  .action((ms) => {
    setHealthCheckInterval(ms);
  });

healthCheckCommand
  .command('timeout')
  .description('Set health check timeout in milliseconds')
  .argument('<ms>', 'Timeout in milliseconds (minimum 1000)')
  .action((ms) => {
    setHealthCheckTimeout(ms);
  });

healthCheckCommand
  .command('max-failures')
  .description('Set maximum consecutive failures before marking unhealthy')
  .argument('<count>', 'Number of failures (minimum 1)')
  .action((count) => {
    setHealthCheckMaxFailures(count);
  });

// Identity management commands
configCommand
  .command('show-identity')
  .description('Show current identity configuration')
  .action(() => {
    showIdentity();
  });

configCommand
  .command('set-identity')
  .description('Update identity information')
  .option('--human-name <name>', 'Human operator name')
  .option('--agent-name <name>', 'Agent name')
  .option('--organization <org>', 'Organization name')
  .action((options) => {
    setIdentity(options);
  });

configCommand
  .command('set-tags')
  .description('Set tags (replaces existing tags)')
  .argument('<tags...>', 'Tags to set')
  .action((tags) => {
    setTags(tags);
  });

configCommand
  .command('add-tag')
  .description('Add a tag')
  .argument('<tag>', 'Tag to add')
  .action((tag) => {
    addTag(tag);
  });

configCommand
  .command('remove-tag')
  .description('Remove a tag')
  .argument('<tag>', 'Tag to remove')
  .action((tag) => {
    removeTag(tag);
  });
