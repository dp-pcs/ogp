import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { saveConfig, type OGPConfig } from '../shared/config.js';
import { loadOrGenerateKeyPair } from '../daemon/keypair.js';

interface AgentBinding {
  agentId: string;
  match?: {
    channel?: string;
    accountId?: string;
  };
}

interface AgentInfo {
  id: string;
  identity?: {
    name?: string;
    emoji?: string;
  };
}

interface OpenClawConfig {
  agents?: {
    list?: AgentInfo[];
  };
  bindings?: AgentBinding[];
}

function loadOpenClawConfig(): OpenClawConfig | null {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data) as OpenClawConfig;
  } catch (error) {
    return null;
  }
}

function getAgentsFromConfig(config: OpenClawConfig): AgentInfo[] {
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

async function promptForAgentId(rl: readline.Interface, agents: AgentInfo[]): Promise<string> {
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

export async function runSetup(): Promise<void> {
  console.log('=== OGP Setup ===\n');

  const rl = readline.createInterface({ input, output });

  // Load agents from OpenClaw config
  const openclawConfig = loadOpenClawConfig();
  const agents = openclawConfig ? getAgentsFromConfig(openclawConfig) : [];

  const agentId = await promptForAgentId(rl, agents);

  const daemonPort = await rl.question('Daemon port [18790]: ');
  const openclawUrl = await rl.question('OpenClaw URL [http://localhost:18789]: ');
  const openclawToken = await rl.question('OpenClaw API token: ');
  const gatewayUrl = await rl.question('Gateway URL (your public URL — run "ogp expose" first to get this, or leave blank to set later): ');
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
    stateDir: stateDir || '~/.ogp',
    agentId
  };

  saveConfig(config);
  console.log('\n✓ Configuration saved');

  // Generate keypair
  const keypair = loadOrGenerateKeyPair();
  console.log(`✓ Ed25519 keypair generated`);
  console.log(`  Public key: ${keypair.publicKey.substring(0, 16)}...`);
  console.log(`  Agent: ${agentId}`);

  console.log('\nSetup complete! Run "ogp start" to start the daemon.');
}
