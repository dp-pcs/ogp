#!/usr/bin/env node
import { Command } from 'commander';
import { runSetup } from './cli/setup.js';
import { startServer, stopServer, getDaemonStatus } from './daemon/server.js';
import { requireConfig, loadConfig } from './shared/config.js';
import { federationList, federationRequest, federationApprove, federationReject, federationSend } from './cli/federation.js';
import { expose, stopExpose } from './cli/expose.js';
import { installLaunchAgent, uninstallLaunchAgent } from './cli/install.js';
const program = new Command();
program
    .name('ogp')
    .description('OGP (Open Gateway Protocol) federation daemon for OpenClaw')
    .version('0.1.0');
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
    .action(() => {
    const status = getDaemonStatus();
    if (status.running) {
        console.log(`Status: Running (PID: ${status.pid})`);
    }
    else {
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
    .argument('<peer-id>', 'Peer ID')
    .action(async (peerUrl, peerId) => {
    await federationRequest(peerUrl, peerId);
});
federation
    .command('approve')
    .description('Approve a pending federation request')
    .argument('<peer-id>', 'Peer ID')
    .action(async (peerId) => {
    await federationApprove(peerId);
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
            const data = await res.json();
            console.log(`✓ Pong from ${data.displayName} (${data.gatewayUrl})`);
            console.log(`  Time: ${data.timestamp}`);
        }
        else {
            console.error(`✗ Ping failed: ${res.status} ${res.statusText}`);
        }
    }
    catch (err) {
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
program.parse();
program
    .command('config')
    .description('View or update OGP configuration')
    .option('--set <key=value>', 'Set a config value (e.g. --set gatewayUrl=https://xyz.trycloudflare.com)')
    .option('--get <key>', 'Get a config value')
    .action((opts) => {
    const { loadConfig, saveConfig } = require('./shared/config.js');
    const config = loadConfig() || {};
    if (opts.set) {
        const [key, ...rest] = opts.set.split('=');
        const value = rest.join('=');
        config[key] = value;
        saveConfig(config);
        console.log(`✓ Set ${key} = ${value}`);
    }
    else if (opts.get) {
        console.log(config[opts.get] ?? 'not set');
    }
    else {
        console.log(JSON.stringify(config, null, 2));
    }
});
//# sourceMappingURL=cli.js.map