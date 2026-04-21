#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAgentCommsInterview, runSetup, runSetupResetKeypair } from './cli/setup.js';
import { startServer, stopServer, getDaemonStatus } from './daemon/server.js';
import { getHeartbeatConfig, loadHealthCheckConfig } from './daemon/heartbeat.js';
import { requireConfig, loadConfig, saveConfig } from './shared/config.js';
import { loadMetaConfig } from './shared/meta-config.js';
import {
  federationList,
  federationStatus,
  federationRequest,
  federationApprove,
  federationReject,
  federationRemove,
  federationSend,
  federationShowScopes,
  federationUpdateGrants,
  federationSendAgentComms,
  federationConnect,
  federationInvite,
  federationAccept,
  federationSetAlias,
  federationTagPeer,
  federationUntagPeer,
  federationUpdateIdentity
} from './cli/federation.js';
import { expose, stopExpose } from './cli/expose.js';
import { installLaunchAgent, uninstallLaunchAgent } from './cli/install.js';
import { installCompletion } from './cli/completion.js';
import {
  showPolicies,
  configurePolicies,
  addTopic,
  removeTopic,
  resetPolicy,
  showActivity,
  clearActivity,
  setDefault,
  setLogging,
  setTopic,
  setPeerDefault
} from './cli/agent-comms.js';
import {
  registerNewIntent,
  listRegisteredIntents,
  removeIntent
} from './cli/intent-registry.js';
import {
  projectCreate,
  projectJoin,
  projectList,
  projectRemove,
  projectContribute,
  projectQuery,
  projectStatus,
  projectRequestJoin,
  projectSendContribution,
  projectQueryPeer,
  projectStatusPeer
} from './cli/project.js';
import { configCommand, whoami } from './cli/config.js';
import type { ResponseLevel } from './daemon/peers.js';
import { showContextHelp } from './shared/help.js';

/**
 * Expand tilde in paths
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Select framework based on --for flag and other rules
 */
function selectFramework(forFlag: string | undefined): void {
  // Special case: --for all doesn't set OGP_HOME (multi-framework operation)
  if (forFlag === 'all') {
    // Set a marker for multi-framework operations
    process.env.OGP_FOR_ALL = 'true';
    return;
  }

  // If --for is provided, use it
  if (forFlag) {
    const metaConfig = loadMetaConfig();

    // No frameworks configured
    if (!metaConfig.frameworks || metaConfig.frameworks.length === 0) {
      console.error('Error: No frameworks configured. Run "ogp setup" first.');
      process.exit(1);
    }

    // Resolve alias
    const resolvedId = metaConfig.aliases?.[forFlag] || forFlag;

    // Find framework by ID
    const framework = metaConfig.frameworks.find(f => f.id === resolvedId);

    if (!framework) {
      console.error(`Error: Framework '${forFlag}' not found.`);
      console.error('Available frameworks:');
      metaConfig.frameworks.forEach(f => {
        console.error(`  - ${f.id} (${f.name})${f.enabled ? '' : ' [disabled]'}`);
      });
      if (metaConfig.aliases && Object.keys(metaConfig.aliases).length > 0) {
        console.error('Aliases:');
        Object.entries(metaConfig.aliases).forEach(([alias, id]) => {
          console.error(`  - ${alias} -> ${id}`);
        });
      }
      process.exit(1);
    }

    if (!framework.enabled) {
      console.error(`Error: Framework '${framework.name}' (${framework.id}) is disabled.`);
      process.exit(1);
    }

    // Set OGP_HOME to the framework's config directory
    process.env.OGP_HOME = expandTilde(framework.configDir);
    return;
  }

  // No --for flag: apply selection logic
  const metaConfig = loadMetaConfig();

  // If no frameworks configured, fall back to OGP_HOME or default
  if (!metaConfig.frameworks || metaConfig.frameworks.length === 0) {
    if (!process.env.OGP_HOME) {
      process.env.OGP_HOME = path.join(os.homedir(), '.ogp');
    }
    return;
  }

  const enabledFrameworks = metaConfig.frameworks.filter(f => f.enabled);

  // If OGP_HOME is already set, honor it (background child processes rely on this)
  if (process.env.OGP_HOME) {
    return;
  }

  // If only one framework enabled, auto-select it
  if (enabledFrameworks.length === 1) {
    process.env.OGP_HOME = expandTilde(enabledFrameworks[0].configDir);
    return;
  }

  // If default is set, use it
  if (metaConfig.default) {
    const defaultFramework = metaConfig.frameworks.find(f => f.id === metaConfig.default);
    if (defaultFramework && defaultFramework.enabled) {
      process.env.OGP_HOME = expandTilde(defaultFramework.configDir);
      return;
    }
  }

  // Otherwise, error: multiple frameworks, no default
  console.error('Error: Multiple frameworks configured but no default set.');
  console.error('Use --for <framework> to specify which framework to use, or set a default:');
  console.error('  ogp setup  (and select a default framework)');
  console.error('\nAvailable frameworks:');
  enabledFrameworks.forEach(f => {
    console.error(`  - ${f.id} (${f.name})`);
  });
  process.exit(1);
}

// Cisco IOS-style ? help interceptor (must run before Commander parses)
// Support both '?' (needs quoting in shell) and 'help' (no quoting needed)
const args = process.argv;
const hasQuestionMark = args.includes('?');
const hasHelp = args.includes('help');

if (hasQuestionMark || hasHelp) {
  // Extract command chain (everything after 'ogp' but before '?'/'help', excluding --flags)
  const commandChain = args.slice(2).filter(a => a !== '?' && a !== 'help' && !a.startsWith('--'));
  showContextHelp(commandChain);
  process.exit(0);
}

const program = new Command();

program
  .name('ogp')
  .description('OGP (Open Gateway Protocol) federation daemon for OpenClaw')
  .version(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version)
  .option('--for <framework>', 'Select framework to use (use "all" for multi-framework operations)')
  .hook('preAction', (thisCommand) => {
    // Skip framework selection for commands that don't need it
    const commandName = thisCommand.name();
    const skipFrameworkSelection = ['setup', 'config'];
    if (skipFrameworkSelection.includes(commandName)) {
      return;
    }

    // Get the --for option from the program (global option)
    const forFlag = program.opts().for;
    selectFramework(forFlag);
  });

program
  .command('setup')
  .description('Interactive setup wizard')
  .option('--reset-keypair', 'Delete the active framework keypair and generate a new one')
  .action(async (options) => {
    if (options.resetKeypair) {
      const forFlag = program.opts().for;
      selectFramework(forFlag);
      await runSetupResetKeypair();
      return;
    }

    await runSetup();
  });

program
  .command('start')
  .description('Start the OGP daemon (use --for all to start all enabled frameworks)')
  .option('-b, --background', 'Run in background')
  .option('--all', 'Start daemons for all enabled frameworks')
  .action(async (options) => {
    const forFlag = program.opts().for;

    // Handle --all flag (overrides --for)
    if (options.all || forFlag === 'all') {
      const metaConfig = loadMetaConfig();
      const enabledFrameworks = metaConfig.frameworks.filter(f => f.enabled);

      if (enabledFrameworks.length === 0) {
        console.error('Error: No enabled frameworks found. Run "ogp setup" first.');
        process.exit(1);
      }

      console.log(`Starting daemons for ${enabledFrameworks.length} enabled framework(s)...\n`);

      for (const framework of enabledFrameworks) {
        // Set OGP_HOME for this framework
        const originalOgpHome = process.env.OGP_HOME;
        process.env.OGP_HOME = expandTilde(framework.configDir);

        try {
          const config = loadConfig();
          if (!config) {
            console.error(`⚠ Framework '${framework.name}' (${framework.id}) has no config - skipping`);
            continue;
          }

          // Check if already running
          const status = await getDaemonStatus();
          if (status.running) {
            console.log(`⚠ Framework '${framework.name}' (${framework.id}) daemon already running (PID: ${status.pid || 'unknown'})`);
          } else {
            startServer(config, true); // Always background mode for multi-framework
            console.log(`✓ Started daemon for '${framework.name}' (${framework.id}) on port ${config.daemonPort}`);
          }
        } catch (error: any) {
          console.error(`✗ Failed to start daemon for '${framework.name}' (${framework.id}):`, error.message);
        } finally {
          // Restore original OGP_HOME
          if (originalOgpHome) {
            process.env.OGP_HOME = originalOgpHome;
          } else {
            delete process.env.OGP_HOME;
          }
        }
      }

      console.log('\n✓ Multi-framework daemon startup complete');
      return;
    }

    // Single framework mode
    const config = requireConfig();
    startServer(config, options.background);
  });

program
  .command('stop')
  .description('Stop the OGP daemon (use --for all to stop all framework daemons)')
  .option('--all', 'Stop daemons for all frameworks')
  .action(async (options) => {
    const forFlag = program.opts().for;

    // Handle --all flag (overrides --for)
    if (options.all || forFlag === 'all') {
      const metaConfig = loadMetaConfig();
      const allFrameworks = metaConfig.frameworks; // Check all frameworks, not just enabled

      if (allFrameworks.length === 0) {
        console.error('Error: No frameworks configured. Run "ogp setup" first.');
        process.exit(1);
      }

      console.log(`Stopping daemons for ${allFrameworks.length} framework(s)...\n`);

      let stoppedCount = 0;
      let notRunningCount = 0;

      for (const framework of allFrameworks) {
        // Set OGP_HOME for this framework
        const originalOgpHome = process.env.OGP_HOME;
        process.env.OGP_HOME = expandTilde(framework.configDir);

        try {
          // Check if running first
          const status = await getDaemonStatus();
          if (status.running) {
            stopServer();
            stoppedCount++;
            console.log(`✓ Stopped daemon for '${framework.name}' (${framework.id})`);
          } else {
            notRunningCount++;
            console.log(`• Framework '${framework.name}' (${framework.id}) daemon not running`);
          }
        } catch (error: any) {
          console.error(`✗ Failed to stop daemon for '${framework.name}' (${framework.id}):`, error.message);
        } finally {
          // Restore original OGP_HOME
          if (originalOgpHome) {
            process.env.OGP_HOME = originalOgpHome;
          } else {
            delete process.env.OGP_HOME;
          }
        }
      }

      console.log(`\n✓ Stopped ${stoppedCount} daemon(s), ${notRunningCount} not running`);
      return;
    }

    // Single framework mode
    stopServer();
  });

program
  .command('status')
  .description('Show daemon status (use --for all to show all frameworks)')
  .option('--all', 'Show status for all frameworks')
  .action(async (options) => {
    const forFlag = program.opts().for;

    // Handle --all flag (overrides --for)
    if (options.all || forFlag === 'all') {
      const metaConfig = loadMetaConfig();
      const allFrameworks = metaConfig.frameworks;

      if (allFrameworks.length === 0) {
        console.error('Error: No frameworks configured. Run "ogp setup" first.');
        process.exit(1);
      }

      // Build status table
      interface FrameworkStatus {
        framework: string;
        status: string;
        pid: string;
        port: string;
        uptime: string;
        gateway: string;
      }

      const rows: FrameworkStatus[] = [];

      for (const framework of allFrameworks) {
        const originalOgpHome = process.env.OGP_HOME;
        process.env.OGP_HOME = expandTilde(framework.configDir);

        try {
          const config = loadConfig();
          const status = await getDaemonStatus();

          let statusStr = 'Stopped';
          let pidStr = '-';
          let uptimeStr = '-';

          if (status.running) {
            statusStr = status.portDetected ? 'Running*' : 'Running';
            pidStr = status.pid ? status.pid.toString() : 'unknown';

            // Calculate uptime if we have PID file
            if (status.pid && !status.portDetected) {
              try {
                const pidFile = path.join(expandTilde(framework.configDir), 'daemon.pid');
                const pidFileStat = fs.statSync(pidFile);
                const uptimeMs = Date.now() - pidFileStat.mtimeMs;
                const uptimeSeconds = Math.floor(uptimeMs / 1000);
                const minutes = Math.floor(uptimeSeconds / 60);
                const seconds = uptimeSeconds % 60;
                uptimeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
              } catch {
                uptimeStr = 'unknown';
              }
            }
          }

          const portStr = config?.daemonPort?.toString() || framework.daemonPort?.toString() || '-';
          const gatewayStr = config?.gatewayUrl || framework.gatewayUrl || '-';

          // Add enabled/disabled indicator
          const frameworkName = framework.enabled ? framework.name : `${framework.name} [disabled]`;

          rows.push({
            framework: frameworkName,
            status: statusStr,
            pid: pidStr,
            port: portStr,
            uptime: uptimeStr,
            gateway: gatewayStr
          });
        } catch (error: any) {
          rows.push({
            framework: `${framework.name} [error]`,
            status: 'Error',
            pid: '-',
            port: '-',
            uptime: '-',
            gateway: error.message
          });
        } finally {
          if (originalOgpHome) {
            process.env.OGP_HOME = originalOgpHome;
          } else {
            delete process.env.OGP_HOME;
          }
        }
      }

      // Print table header
      console.log('\nFramework Status Overview:');
      console.log('─'.repeat(120));
      console.log(
        padRight('Framework', 20) +
        padRight('Status', 12) +
        padRight('PID', 10) +
        padRight('Port', 8) +
        padRight('Uptime', 12) +
        'Gateway'
      );
      console.log('─'.repeat(120));

      // Print rows
      for (const row of rows) {
        console.log(
          padRight(row.framework, 20) +
          padRight(row.status, 12) +
          padRight(row.pid, 10) +
          padRight(row.port, 8) +
          padRight(row.uptime, 12) +
          row.gateway
        );
      }

      console.log('─'.repeat(120));
      console.log('\n* Running (detected on port — started externally)');
      console.log(`\nDefault framework: ${metaConfig.default || '(none set)'}`);

      if (metaConfig.aliases && Object.keys(metaConfig.aliases).length > 0) {
        console.log('\nAliases:');
        Object.entries(metaConfig.aliases).forEach(([alias, id]) => {
          console.log(`  ${alias} → ${id}`);
        });
      }

      return;
    }

    // Single framework mode (existing behavior)
    const status = await getDaemonStatus();

    if (status.running) {
      if (status.portDetected) {
        console.log(`Status: Running (detected on port — started externally)`);
      } else {
        console.log(`Status: Running (PID: ${status.pid})`);
      }
    } else {
      console.log('Status: Stopped');
    }

    const config = loadConfig();
    if (!config) {
      console.log('\nConfiguration: Not configured (run "ogp setup")');
      return;
    }
    console.log('\nConfiguration:');
    console.log(`  Daemon port: ${config.daemonPort}`);
    console.log(`  OpenClaw URL: ${config.openclawUrl}`);
    console.log(`  Gateway URL: ${config.gatewayUrl}`);
    console.log(`  Display name: ${config.displayName}`);
    console.log(`  Email: ${config.email}`);

    // Show health check configuration
    loadHealthCheckConfig();
    const heartbeatConfig = getHeartbeatConfig();
    console.log('\nHealth Check Configuration:');
    console.log(`  Check interval: ${heartbeatConfig.intervalMs / 1000}s`);
    console.log(`  Check timeout: ${heartbeatConfig.timeoutMs / 1000}s`);
    console.log(`  Max consecutive failures: ${heartbeatConfig.maxConsecutiveFailures}`);
    console.log(`  Heartbeat status: ${heartbeatConfig.isRunning ? 'Running' : 'Stopped'}`);
  });

/**
 * Pad string to the right with spaces
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

const federation = program
  .command('federation')
  .description('Manage federation');

federation
  .command('list')
  .description('List all peers (use --for all to show all frameworks)')
  .option('-s, --status <status>', 'Filter by status (pending|approved|rejected)')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action(async (options) => {
    await federationList(options.status, options.tag);
  });

federation
  .command('status')
  .description('Show federation status and alias → public key mappings (use --for all for all frameworks)')
  .action(async () => {
    await federationStatus();
  });

federation
  .command('request')
  .description('Send federation request to a peer')
  .argument('<peer-url>', 'Peer gateway URL')
  .argument('[peer-id]', 'Peer ID (optional — auto-resolved from /.well-known/ogp)')
  .option('-a, --alias <name>', 'User-friendly alias for this peer (e.g., "big-papa")')
  .option('--petname <name>', 'Deprecated: use --alias instead')
  .action(async (peerUrl, peerId, options) => {
    // Handle backward compatibility: --petname maps to --alias with deprecation warning
    let alias = options.alias;
    if (options.petname) {
      if (!alias) {
        console.warn('⚠️  --petname is deprecated. Use --alias instead.');
        alias = options.petname;
      } else {
        console.warn('⚠️  Both --alias and --petname provided. Using --alias.');
      }
    }
    
    // Auto-resolve peer ID from /.well-known/ogp if not provided
    if (!peerId) {
      try {
        const wellKnownUrl = `${peerUrl.replace(/\/$/, '')}/.well-known/ogp`;
        console.log(`Resolving peer ID from ${wellKnownUrl}...`);
        const res = await fetch(wellKnownUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { publicKey?: string; displayName?: string };
        if (!data.publicKey) throw new Error('No publicKey in response');
        peerId = data.publicKey;
        console.log(`✓ Resolved peer: ${data.displayName || 'Unknown'} (${peerId.slice(0, 16)}...)`);
      } catch (err: any) {
        console.error(`✗ Could not resolve peer ID from ${peerUrl}/.well-known/ogp: ${err.message}`);
        console.error(`  Provide it manually: ogp federation request <peer-url> <peer-id>`);
        process.exit(1);
      }
    }
    await federationRequest(peerUrl, peerId, alias);
  });

federation
  .command('connect')
  .description('Connect to a peer by public key using rendezvous server discovery')
  .argument('<pubkey>', 'Peer public key (hex)')
  .option('-a, --alias <name>', 'User-friendly alias for this peer (e.g., "big-papa")')
  .option('--petname <name>', 'Deprecated: use --alias instead')
  .action(async (pubkey, options) => {
    // Handle backward compatibility: --petname maps to --alias with deprecation warning
    let alias = options.alias;
    if (options.petname) {
      if (!alias) {
        console.warn('⚠️  --petname is deprecated. Use --alias instead.');
        alias = options.petname;
      } else {
        console.warn('⚠️  Both --alias and --petname provided. Using --alias.');
      }
    }
    await federationConnect(pubkey, alias);
  });

federation
  .command('invite')
  .description('Generate a short invite token to share with a peer (requires rendezvous)')
  .action(async () => {
    await federationInvite();
  });

federation
  .command('accept')
  .description('Accept a peer\'s invite token and auto-connect via rendezvous')
  .argument('<token>', 'Invite token from peer (e.g. a3f7k2)')
  .option('-a, --alias <name>', 'User-friendly alias for this peer (e.g., "big-papa")')
  .option('--petname <name>', 'Deprecated: use --alias instead')
  .action(async (token, options) => {
    // Handle backward compatibility: --petname maps to --alias with deprecation warning
    let alias = options.alias;
    if (options.petname) {
      if (!alias) {
        console.warn('⚠️  --petname is deprecated. Use --alias instead.');
        alias = options.petname;
      } else {
        console.warn('⚠️  Both --alias and --petname provided. Using --alias.');
      }
    }
    await federationAccept(token, alias);
  });

federation
  .command('approve')
  .description('Approve a pending federation request with optional scope grants')
  .argument('<peer-id>', 'Peer ID')
  .option('--intents <list>', 'Comma-separated intents to grant (e.g., message,agent-comms)')
  .option('--rate <limit>', 'Rate limit as requests/seconds (e.g., 100/3600)')
  .option('--topics <list>', 'Comma-separated topics for agent-comms (e.g., memory-management,task-delegation)')
  .action(async (peerId, options) => {
    const approveOptions = {
      intents: options.intents ? options.intents.split(',').map((s: string) => s.trim()) : undefined,
      rate: options.rate,
      topics: options.topics ? options.topics.split(',').map((s: string) => s.trim()) : undefined
    };
    await federationApprove(peerId, approveOptions);
  });

federation
  .command('reject')
  .description('Reject a pending federation request')
  .argument('<peer-id>', 'Peer ID')
  .action(async (peerId) => {
    await federationReject(peerId);
  });

federation
  .command('remove')
  .description('Remove a peer from your federation list')
  .argument('<peer-id>', 'Peer ID to remove')
  .action(async (peerId) => {
    await federationRemove(peerId);
  });

federation
  .command('alias')
  .description('Set a user-friendly alias for a peer (alternative: use --alias when connecting/requesting)')
  .argument('<peer-id>', 'Peer ID')
  .argument('<alias>', 'Alias name (e.g., "big-papa", "staging-server")')
  .action(async (peerId, alias) => {
    await federationSetAlias(peerId, alias);
  });

federation
  .command('tag')
  .description('Add tags to a peer (local categorization)')
  .argument('<peer-id>', 'Peer ID')
  .argument('<tags...>', 'Tags to add (e.g., work production)')
  .action(async (peerId, tags) => {
    await federationTagPeer(peerId, tags);
  });

federation
  .command('untag')
  .description('Remove tags from a peer')
  .argument('<peer-id>', 'Peer ID')
  .argument('<tags...>', 'Tags to remove')
  .action(async (peerId, tags) => {
    await federationUntagPeer(peerId, tags);
  });

federation
  .command('update-identity')
  .description('Send updated identity information to an approved peer')
  .argument('<peer-id>', 'Peer ID')
  .action(async (peerId) => {
    await federationUpdateIdentity(peerId);
  });

federation
  .command('ping')
  .description('Ping a peer gateway to test connectivity')
  .argument('<peer-url>', 'Peer gateway URL')
  .action(async (peerUrl) => {
    try {
      const res = await fetch(`${peerUrl}/federation/ping`);
      if (res.ok) {
        const data = await res.json() as { displayName?: string; gatewayUrl?: string; timestamp?: string };
        console.log(`✓ Pong from ${data.displayName} (${data.gatewayUrl})`);
        console.log(`  Time: ${data.timestamp}`);
      } else {
        console.error(`✗ Ping failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error(`✗ Ping failed:`, err);
    }
  });

federation
  .command('send')
  .description('Send a message to a federated peer')
  .argument('<peer-id>', 'Peer ID')
  .argument('<intent>', 'Intent name')
  .argument('<payload>', 'Payload as JSON string')
  .action(async (peerId, intent, payload) => {
    await federationSend(peerId, intent, payload);
  });

federation
  .command('scopes')
  .description('Show scope grants for a peer')
  .argument('<peer-id>', 'Peer ID')
  .action(async (peerId) => {
    await federationShowScopes(peerId);
  });

federation
  .command('grant')
  .description('Update scope grants for an approved peer')
  .argument('<peer-id>', 'Peer ID')
  .option('--intents <list>', 'Comma-separated intents to grant (e.g., message,agent-comms)')
  .option('--rate <limit>', 'Rate limit as requests/seconds (e.g., 100/3600)')
  .option('--topics <list>', 'Comma-separated topics for agent-comms')
  .action(async (peerId, options) => {
    const grantOptions = {
      intents: options.intents ? options.intents.split(',').map((s: string) => s.trim()) : undefined,
      rate: options.rate,
      topics: options.topics ? options.topics.split(',').map((s: string) => s.trim()) : undefined
    };
    await federationUpdateGrants(peerId, grantOptions);
  });

federation
  .command('agent')
  .description('Send an agent-comms message to a peer')
  .argument('<peer-id>', 'Peer ID')
  .argument('<topic>', 'Topic (e.g., memory-management)')
  .argument('<message>', 'Message text')
  .option('-p, --priority <level>', 'Priority (low|normal|high)', 'normal')
  .option('-c, --conversation <id>', 'Conversation ID for threading')
  .option('-w, --wait', 'Wait for reply')
  .option('-t, --timeout <ms>', 'Reply timeout in milliseconds', '30000')
  .action(async (peerId, topic, message, options) => {
    await federationSendAgentComms(peerId, topic, message, {
      priority: options.priority as 'low' | 'normal' | 'high',
      conversationId: options.conversation,
      waitForReply: options.wait,
      replyTimeout: parseInt(options.timeout, 10)
    });
  });

program
  .command('expose')
  .description('Expose daemon via tunnel (cloudflared or ngrok)')
  .option('-m, --method <method>', 'Tunnel method (cloudflared|ngrok)', 'cloudflared')
  .option('-b, --background', 'Run in background')
  .action(async (options) => {
    await expose(options.method, options.background);
  });

program
  .command('expose-stop')
  .description('Stop background tunnel')
  .action(() => {
    stopExpose();
  });

program
  .command('shutdown')
  .description('Stop both the OGP daemon and tunnel')
  .action(() => {
    console.log('Shutting down OGP...');
    stopExpose();
    stopServer();
    console.log('✓ OGP daemon and tunnel stopped.');
  });

program
  .command('install')
  .description('Install LaunchAgent to start daemon on login (macOS)')
  .action(async () => {
    await installLaunchAgent();
  });

program
  .command('uninstall')
  .description('Uninstall LaunchAgent (macOS)')
  .action(async () => {
    await uninstallLaunchAgent();
  });

program
  .command('whoami')
  .description('Show current identity and configuration')
  .action(() => {
    whoami();
  });

program.addCommand(configCommand);

// Agent-comms configuration commands
const agentComms = program
  .command('agent-comms')
  .description('Configure agent-to-agent communication policies');

agentComms
  .command('interview')
  .description('Run the delegated-authority and human-delivery interview for the active framework')
  .action(async () => {
    await runAgentCommsInterview();
  });

agentComms
  .command('policies')
  .description('Show response policies (global and per-peer)')
  .argument('[peer-id]', 'Optional peer ID to show specific peer policies')
  .action((peerId) => {
    showPolicies(peerId);
  });

agentComms
  .command('configure')
  .description('Configure response policies for peers or globally')
  .argument('[peer-ids]', 'Comma-separated peer IDs (or use --global)')
  .option('--global', 'Configure global default policies')
  .option('--topics <list>', 'Comma-separated topics to configure')
  .option('--level <level>', 'Response level (full|summary|escalate|deny|off)')
  .option('--notes <text>', 'Notes about this policy')
  .action((peerIds, options) => {
    configurePolicies(peerIds, {
      global: options.global,
      topics: options.topics,
      level: options.level as ResponseLevel,
      notes: options.notes
    });
  });

agentComms
  .command('add-topic')
  .description('Add a topic to a peer\'s response policy')
  .argument('<peer-id>', 'Peer ID')
  .argument('<topic>', 'Topic name')
  .option('--level <level>', 'Response level (full|summary|escalate|deny|off)', 'summary')
  .option('--notes <text>', 'Notes about this topic')
  .action((peerId, topic, options) => {
    addTopic(peerId, topic, options.level as ResponseLevel, options.notes);
  });

agentComms
  .command('set-topic')
  .description('Set a topic policy for a peer (upsert: creates or updates)')
  .argument('<peer-id>', 'Peer ID')
  .argument('<topic>', 'Topic name')
  .argument('<level>', 'Response level (full|summary|escalate|deny|off)')
  .option('--notes <text>', 'Notes about this topic')
  .action((peerId, topic, level, options) => {
    setTopic(peerId, topic, level as ResponseLevel, options.notes);
  });

agentComms
  .command('set-default')
  .description('Set the per-peer default level for a specific peer')
  .argument('<peer-id>', 'Peer ID')
  .argument('<level>', 'Response level (full|summary|escalate|deny|off)')
  .action((peerId, level) => {
    setPeerDefault(peerId, level as ResponseLevel);
  });

agentComms
  .command('remove-topic')
  .description('Remove a topic from a peer\'s response policy')
  .argument('<peer-id>', 'Peer ID')
  .argument('<topic>', 'Topic name')
  .action((peerId, topic) => {
    removeTopic(peerId, topic);
  });

agentComms
  .command('reset')
  .description('Reset a peer\'s policy to global defaults')
  .argument('<peer-id>', 'Peer ID')
  .action((peerId) => {
    resetPolicy(peerId);
  });

agentComms
  .command('activity')
  .description('Show agent-comms activity log')
  .argument('[peer-id]', 'Optional peer ID to filter')
  .option('--last <n>', 'Show last N entries', '50')
  .option('--clear', 'Clear the activity log')
  .action((peerId, options) => {
    if (options.clear) {
      clearActivity();
    } else {
      showActivity(peerId, parseInt(options.last, 10));
    }
  });

agentComms
  .command('default')
  .description('Set default response level for unknown topics (use "off" for default-deny)')
  .argument('<level>', 'Response level (full|summary|escalate|deny|off)')
  .action((level) => {
    setDefault(level as ResponseLevel);
  });

agentComms
  .command('logging')
  .description('Enable or disable activity logging')
  .argument('<state>', 'on or off')
  .action((state) => {
    setLogging(state === 'on' || state === 'true' || state === 'enable');
  });

// Intent registry management commands
const intent = program
  .command('intent')
  .description('Manage custom intents');

intent
  .command('register')
  .description('Register a new intent handler')
  .argument('<name>', 'Intent name')
  .option('--script <path>', 'Path to handler script')
  .option('--description <text>', 'Description of the intent')
  .action((name, options) => {
    if (!options.description) {
      console.error('Error: --description is required');
      process.exit(1);
    }
    registerNewIntent(name, {
      script: options.script,
      description: options.description
    });
  });

intent
  .command('list')
  .description('List all registered intents')
  .action(() => {
    listRegisteredIntents();
  });

intent
  .command('remove')
  .description('Remove a registered intent')
  .argument('<name>', 'Intent name')
  .action((name) => {
    removeIntent(name);
  });

// Project management commands
const project = program
  .command('project')
  .description('Manage project contexts for shared collaboration');

project
  .command('create')
  .description('Create a new project locally')
  .argument('<project-id>', 'Unique project identifier')
  .argument('<project-name>', 'Human-readable project name')
  .option('--description <text>', 'Project description')
  .action(async (projectId, projectName, options) => {
    await projectCreate(projectId, projectName, options);
  });

project
  .command('join')
  .description('Join an existing project (local or create new)')
  .argument('<project-id>', 'Project identifier to join')
  .argument('[project-name]', 'Project name (required with --create)')
  .option('--create', 'Create the project if it doesn\'t exist locally')
  .option('--description <text>', 'Project description (with --create)')
  .action(async (projectId, projectName, options) => {
    await projectJoin(projectId, projectName, options);
  });

project
  .command('list')
  .description('List all local projects')
  .action(async () => {
    await projectList();
  });

project
  .command('remove')
  .description('Remove a local project')
  .argument('<project-id>', 'Project ID to remove')
  .action(async (projectId) => {
    await projectRemove(projectId);
  });

project
  .command('contribute')
  .description('Add a contribution to a project entry type')
  .argument('<project-id>', 'Project to contribute to')
  .argument('<type>', 'Entry type for this contribution (e.g., decision, task, note)')
  .argument('<summary>', 'Summary of the contribution')
  .option('--metadata <json>', 'Additional structured data as JSON')
  .option('--local-only', 'Skip auto-push to federated peers')
  .action(async (projectId, entryType, summary, options) => {
    await projectContribute(projectId, entryType, summary, { ...options, localOnly: options.localOnly });
  });

project
  .command('query')
  .description('Query project contributions')
  .argument('<project-id>', 'Project to query')
  .option('--type <name>', 'Filter by entry type')
  .option('--topic <name>', 'Filter by entry type (alias for --type)')
  .option('--author <id>', 'Filter by author')
  .option('--search <text>', 'Search by text content')
  .option('--limit <n>', 'Maximum results to return', '20')
  .action(async (projectId, options) => {
    const queryOptions = {
      ...options,
      entryType: options.type || options.topic, // --type takes precedence; --topic remains a legacy alias
      limit: parseInt(options.limit, 10)
    };
    await projectQuery(projectId, queryOptions);
  });

project
  .command('status')
  .description('Show project status overview')
  .argument('<project-id>', 'Project to show status for')
  .action(async (projectId) => {
    await projectStatus(projectId);
  });

// Project federation commands (peer-to-peer)
project
  .command('request-join')
  .description('Request to join a project from a peer')
  .argument('<peer-id>', 'Peer to request from')
  .argument('<project-id>', 'Project identifier')
  .argument('<project-name>', 'Project name')
  .option('--description <text>', 'Project description')
  .action(async (peerId, projectId, projectName, options) => {
    await projectRequestJoin(peerId, projectId, projectName, options);
  });

project
  .command('send-contribution')
  .description('Send a contribution to a peer\'s project')
  .argument('<peer-id>', 'Peer to send to')
  .argument('<project-id>', 'Project identifier')
  .argument('<type>', 'Entry type (e.g., decision, task, note)')
  .argument('<summary>', 'Contribution summary')
  .option('--metadata <json>', 'Additional structured data as JSON')
  .action(async (peerId, projectId, entryType, summary, options) => {
    await projectSendContribution(peerId, projectId, entryType, summary, options);
  });

project
  .command('query-peer')
  .description('Query a peer\'s project contributions')
  .argument('<peer-id>', 'Peer to query')
  .argument('<project-id>', 'Project identifier')
  .option('--type <name>', 'Filter by entry type')
  .option('--topic <name>', 'Filter by entry type (alias for --type)')
  .option('--author <id>', 'Filter by author')
  .option('--limit <n>', 'Maximum results to return', '20')
  .option('--timeout <ms>', 'Response timeout in milliseconds', '10000')
  .action(async (peerId, projectId, options) => {
    const queryOptions = {
      ...options,
      entryType: options.type || options.topic, // --type takes precedence; --topic remains a legacy alias
      limit: parseInt(options.limit, 10),
      timeout: parseInt(options.timeout, 10)
    };
    await projectQueryPeer(peerId, projectId, queryOptions);
  });

project
  .command('status-peer')
  .description('Request project status from a peer')
  .argument('<peer-id>', 'Peer to request from')
  .argument('<project-id>', 'Project identifier')
  .action(async (peerId, projectId) => {
    await projectStatusPeer(peerId, projectId);
  });

project
  .command('delete')
  .description('Delete a local project and all its contributions')
  .argument('<project-id>', 'Project to delete')
  .option('--force', 'Skip confirmation prompt')
  .action(async (projectId, options) => {
    const { getProject, deleteProject } = await import('./daemon/projects.js');
    const proj = getProject(projectId);
    if (!proj) {
      console.error(`Project '${projectId}' not found`);
      process.exit(1);
    }
    if (!options.force) {
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => rl.question(`Delete project '${proj.name}' (${projectId})? This cannot be undone. [y/N] `, resolve));
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        process.exit(0);
      }
    }
    deleteProject(projectId);
    console.log(`✓ Deleted project '${proj.name}' (${projectId})`);
  });

// Completion commands
const completion = program
  .command('completion')
  .description('Manage shell completion');

completion
  .command('install')
  .description('Install shell completion for the current shell')
  .action(async () => {
    await installCompletion();
  });

program.parse();
