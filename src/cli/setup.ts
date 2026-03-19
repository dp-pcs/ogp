import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { saveConfig, type OGPConfig } from '../shared/config.js';
import { loadOrGenerateKeyPair } from '../daemon/keypair.js';

export async function runSetup(): Promise<void> {
  console.log('=== OGP Setup ===\n');

  const rl = readline.createInterface({ input, output });

  const daemonPort = await rl.question('Daemon port [18790]: ');
  const openclawUrl = await rl.question('OpenClaw URL [http://localhost:18789]: ');
  const openclawToken = await rl.question('OpenClaw API token: ');
  const gatewayUrl = await rl.question('Gateway URL (your public URL): ');
  const displayName = await rl.question('Display name: ');
  const email = await rl.question('Email: ');
  const stateDir = await rl.question('State directory [~/.ogp]: ');

  rl.close();

  const config: OGPConfig = {
    daemonPort: parseInt(daemonPort) || 18790,
    openclawUrl: openclawUrl || 'http://localhost:18789',
    openclawToken,
    gatewayUrl,
    displayName,
    email,
    stateDir: stateDir || '~/.ogp'
  };

  saveConfig(config);
  console.log('\n✓ Configuration saved');

  // Generate keypair
  const keypair = loadOrGenerateKeyPair();
  console.log(`✓ Ed25519 keypair generated`);
  console.log(`  Public key: ${keypair.publicKey.substring(0, 16)}...`);

  console.log('\nSetup complete! Run "ogp start" to start the daemon.');
}
