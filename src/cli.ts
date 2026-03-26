#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import { runSetup } from './cli/setup.js';
import { startServer, stopServer, getDaemonStatus } from './daemon/server.js';
import { requireConfig, loadConfig } from './shared/config.js';
import {
  federationList,
  federationRequest,
  federationApprove,
  federationReject,
  federationSend,
  federationShowScopes,
  federationUpdateGrants,
  federationSendAgentComms
} from './cli/federation.js';
import { expose, stopExpose } from './cli/expose.js';
import { installLaunchAgent, uninstallLaunchAgent } from './cli/install.js';
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
  projectContribute,
  projectQuery,
  projectStatus,
  projectRequestJoin,
  projectSendContribution,
  projectQueryPeer,
  projectStatusPeer
} from './cli/project.js';
import type { ResponseLevel } from './daemon/peers.js';

const program = new Command();

program
  .name('ogp')
  .description('OGP (Open Gateway Protocol) federation daemon for OpenClaw')
  .version(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version);

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    await runSetup();
  });

program
  .command('start')
  .description('Start the OGP daemon')
  .option('-b, --background', 'Run in background')
  .action((options) => {
    const config = requireConfig();
    startServer(config, options.background);
  });

program
  .command('stop')
  .description('Stop the OGP daemon')
  .action(() => {
    stopServer();
  });

program
  .command('status')
  .description('Show daemon status')
  .action(async () => {
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
  });

const federation = program
  .command('federation')
  .description('Manage federation');

federation
  .command('list')
  .description('List all peers')
  .option('-s, --status <status>', 'Filter by status (pending|approved|rejected)')
  .action(async (options) => {
    await federationList(options.status);
  });

federation
  .command('request')
  .description('Send federation request to a peer')
  .argument('<peer-url>', 'Peer gateway URL')
  .argument('[peer-id]', 'Peer ID (optional — auto-resolved from /.well-known/ogp)')
  .action(async (peerUrl, peerId) => {
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
    await federationRequest(peerUrl, peerId);
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
  .command('config')
  .description('View or update OGP configuration')
  .option('--set <key=value>', 'Set a config value (e.g. --set gatewayUrl=https://xyz.trycloudflare.com)')
  .option('--get <key>', 'Get a config value')
  .action((opts) => {
    const config = loadConfig() || {};
    if (opts.set) {
      const [key, ...rest] = opts.set.split('=');
      const value = rest.join('=');
      (config as any)[key] = value;
      const { saveConfig } = require('./shared/config.js');
      saveConfig(config);
      console.log(`✓ Set ${key} = ${value}`);
    } else if (opts.get) {
      console.log((config as any)[opts.get] ?? 'not set');
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });

// Agent-comms configuration commands
const agentComms = program
  .command('agent-comms')
  .description('Configure agent-to-agent communication policies');

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
      topic: options.type || options.topic, // --type takes precedence
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
      topic: options.type || options.topic, // --type takes precedence
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

program.parse();
