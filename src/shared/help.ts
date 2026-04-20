import { loadPeers } from '../daemon/peers.js';
import { loadMetaConfig } from './meta-config.js';

/**
 * Show context-sensitive help based on command chain
 */
export function showContextHelp(commandChain: string[]): void {
  const context = commandChain.join(' ').trim();

  if (!context) {
    showTopLevelHelp();
  } else if (context === 'federation') {
    showFederationHelp();
  } else if (context.startsWith('federation send')) {
    showFederationSendHelp();
  } else if (context.startsWith('federation agent')) {
    showFederationAgentHelp();
  } else if (context === 'agent-comms') {
    showAgentCommsHelp();
  } else if (context === 'config') {
    showConfigHelp();
  } else if (context.startsWith('config health-check')) {
    showConfigHealthCheckHelp();
  } else if (context === 'project') {
    showProjectHelp();
  } else if (context === 'intent') {
    showIntentHelp();
  } else {
    // Fallback to generic help
    console.log(`No specific help available for: ${context}`);
    console.log('Try: ogp --help or ogp <command> --help');
  }
}

/**
 * Top-level commands help
 */
function showTopLevelHelp(): void {
  console.log('\nAvailable commands:');
  console.log('  setup           Initialize OGP configuration');
  console.log('  start           Start OGP daemon');
  console.log('  stop            Stop OGP daemon');
  console.log('  status          Show daemon status');
  console.log('  federation      Manage federation with peers');
  console.log('  agent-comms     Configure agent-to-agent communication policies');
  console.log('  project         Manage project contexts for collaboration');
  console.log('  intent          Manage custom intent handlers');
  console.log('  config          Manage framework configuration');
  console.log('  expose          Expose daemon via tunnel (cloudflared/ngrok)');
  console.log('  expose-stop     Stop background tunnel');
  console.log('  shutdown        Stop both daemon and tunnel');
  console.log('  install         Install LaunchAgent (macOS)');
  console.log('  uninstall       Uninstall LaunchAgent (macOS)');
  console.log('');
  console.log('Global options:');
  console.log('  --for <framework>  Select framework to use');
  console.log('  --help            Show help');
  console.log('  --version         Show version');
  console.log('');
  console.log('Examples:');
  console.log('  ogp setup');
  console.log('  ogp setup --reset-keypair');
  console.log('  ogp start');
  console.log('  ogp --for hermes federation list');
  console.log('  ogp federation help  (or: ogp federation \\\'?\\\')');
  console.log('');
}

/**
 * Federation commands help
 */
function showFederationHelp(): void {
  console.log('\nFederation commands:');
  console.log('  list            List all federated peers');
  console.log('  status          Show federation status and alias mappings');
  console.log('  request         Send federation request to a peer');
  console.log('  connect         Connect to a peer via optional rendezvous lookup');
  console.log('  invite          Generate optional invite token for a peer');
  console.log('  accept          Accept an optional rendezvous invite token');
  console.log('  approve         Approve a pending federation request');
  console.log('  reject          Reject a pending federation request');
  console.log('  remove          Remove a peer from federation list');
  console.log('  alias           Set a user-friendly alias for a peer');
  console.log('  tag             Add tags to a peer (local categorization)');
  console.log('  untag           Remove tags from a peer');
  console.log('  update-identity Send updated identity to an approved peer');
  console.log('  ping            Test connectivity to a peer');
  console.log('  send            Send a message to a federated peer');
  console.log('  agent           Send an agent-comms message to a peer');
  console.log('  scopes          Show scope grants for a peer');
  console.log('  grant           Update scope grants for a peer');
  console.log('');
  console.log('Examples:');
  console.log('  ogp federation list');
  console.log('  ogp federation request https://peer.example.com --alias big-papa');
  console.log('  ogp federation approve <peer-id> --intents message,agent-comms');
  console.log('  ogp federation send help');
  console.log('');
}

/**
 * Federation send command help with available peers
 */
function showFederationSendHelp(): void {
  console.log('\nSend a message to a federated peer');
  console.log('');
  console.log('Usage:');
  console.log('  ogp federation send <peer-id> <intent> <payload>');
  console.log('');
  console.log('Arguments:');
  console.log('  peer-id    Peer identifier (alias, ID, or public key)');
  console.log('  intent     Intent name (e.g., message, custom-intent)');
  console.log('  payload    JSON payload string');
  console.log('');

  // Show available peers
  const peers = loadPeers();
  const approvedPeers = peers.filter(p => p.status === 'approved');

  if (approvedPeers.length > 0) {
    console.log('Available peers:');
    approvedPeers.forEach(peer => {
      const identifier = peer.alias || peer.id;
      const displayInfo = peer.alias ? `${peer.displayName} (${peer.id})` : peer.displayName;
      console.log(`  ${identifier.padEnd(20)} ${displayInfo}`);
    });
    console.log('');
  }

  console.log('Examples:');
  console.log('  ogp federation send big-papa message \'{"text":"Hello"}\'');
  console.log('  ogp federation send <peer-id> custom-intent \'{"data":"value"}\'');
  console.log('');
}

/**
 * Federation agent command help with available peers
 */
function showFederationAgentHelp(): void {
  console.log('\nSend an agent-comms message to a peer');
  console.log('');
  console.log('Usage:');
  console.log('  ogp federation agent <peer-id> <topic> <message> [options]');
  console.log('');
  console.log('Arguments:');
  console.log('  peer-id    Peer identifier (alias, ID, or public key)');
  console.log('  topic      Topic for message routing (e.g., memory-management)');
  console.log('  message    Message text content');
  console.log('');
  console.log('Options:');
  console.log('  -p, --priority <level>      Priority (low|normal|high), default: normal');
  console.log('  -c, --conversation <id>     Conversation ID for threading');
  console.log('  -w, --wait                  Wait for reply');
  console.log('  -t, --timeout <ms>          Reply timeout in milliseconds, default: 30000');
  console.log('');

  // Show available peers
  const peers = loadPeers();
  const approvedPeers = peers.filter(p => p.status === 'approved');

  if (approvedPeers.length > 0) {
    console.log('Available peers:');
    approvedPeers.forEach(peer => {
      const identifier = peer.alias || peer.id;
      const displayInfo = peer.alias ? `${peer.displayName} (${peer.id})` : peer.displayName;
      const topics = peer.responsePolicy?.topics ? Object.keys(peer.responsePolicy.topics).join(', ') : '-';
      console.log(`  ${identifier.padEnd(20)} ${displayInfo}`);
      if (topics !== '-') {
        console.log(`    Topics: ${topics}`);
      }
    });
    console.log('');
  }

  console.log('Examples:');
  console.log('  ogp federation agent big-papa memory-management "Store this context"');
  console.log('  ogp federation agent <peer-id> task-delegation "Create task X" -w');
  console.log('');
}

/**
 * Agent-comms configuration help
 */
function showAgentCommsHelp(): void {
  console.log('\nAgent-comms policy management:');
  console.log('  interview       Run the delegated-authority / human-delivery interview');
  console.log('  policies        Show response policies (global and per-peer)');
  console.log('  configure       Configure response policies for peers or globally');
  console.log('  add-topic       Add a topic to a peer\'s response policy');
  console.log('  set-topic       Set a topic policy for a peer (upsert)');
  console.log('  set-default     Set per-peer default level');
  console.log('  remove-topic    Remove a topic from a peer\'s response policy');
  console.log('  reset           Reset a peer\'s policy to global defaults');
  console.log('  activity        Show agent-comms activity log');
  console.log('  default         Set global default response level');
  console.log('  logging         Enable or disable activity logging');
  console.log('');
  console.log('Response levels:');
  console.log('  full            Provide full context and detailed responses');
  console.log('  summary         Provide summarized responses');
  console.log('  escalate        Escalate to human for approval');
  console.log('  deny            Deny the request');
  console.log('  off             No response (silent)');
  console.log('');
  console.log('Examples:');
  console.log('  ogp agent-comms interview');
  console.log('  ogp agent-comms policies');
  console.log('  ogp agent-comms configure --global --level summary');
  console.log('  ogp agent-comms set-topic <peer-id> memory-management full');
  console.log('  ogp agent-comms activity --last 20');
  console.log('');
}

/**
 * Config commands help
 */
function showConfigHelp(): void {
  console.log('\nConfiguration management:');
  console.log('  list            List all configured frameworks');
  console.log('  add             Add a new framework');
  console.log('  remove          Remove a framework');
  console.log('  enable          Enable a framework');
  console.log('  disable         Disable a framework');
  console.log('  set-default     Set default framework');
  console.log('  set-alias       Set an alias for a framework');
  console.log('  show            Show configuration for a framework');
  console.log('  health-check    Manage health check configuration');
  console.log('  show-identity   Show current identity configuration');
  console.log('  set-identity    Update identity information');
  console.log('  set-tags        Set tags (replaces existing)');
  console.log('  add-tag         Add a tag');
  console.log('  remove-tag      Remove a tag');
  console.log('');

  // Show current frameworks
  try {
    const metaConfig = loadMetaConfig();
    if (metaConfig.frameworks && metaConfig.frameworks.length > 0) {
      console.log('Configured frameworks:');
      metaConfig.frameworks.forEach(f => {
        const status = f.enabled ? '✓' : '✗';
        const isDefault = metaConfig.default === f.id ? ' (default)' : '';
        console.log(`  ${status} ${f.id.padEnd(20)} ${f.name}${isDefault}`);
      });
      console.log('');
    }
  } catch (err) {
    // Ignore if meta config not found
  }

  console.log('Examples:');
  console.log('  ogp config list');
  console.log('  ogp config add my-framework "My Framework" ~/.ogp-my-framework');
  console.log('  ogp config set-default my-framework');
  console.log('  ogp config set-alias mf my-framework');
  console.log('');
}

/**
 * Config health-check commands help
 */
function showConfigHealthCheckHelp(): void {
  console.log('\nHealth check configuration:');
  console.log('  show            Show current health check configuration');
  console.log('  interval        Set health check interval in milliseconds');
  console.log('  timeout         Set health check timeout in milliseconds');
  console.log('  max-failures    Set max consecutive failures before unhealthy');
  console.log('');

  console.log('Examples:');
  console.log('  ogp config health-check show');
  console.log('  ogp config health-check interval 60000');
  console.log('  ogp config health-check timeout 10000');
  console.log('  ogp config health-check max-failures 3');
  console.log('');

  console.log('Note: Restart daemon for changes to take effect');
  console.log('  ogp stop && ogp start --background');
  console.log('');
}

/**
 * Project commands help
 */
function showProjectHelp(): void {
  console.log('\nProject collaboration commands:');
  console.log('  create          Create a new project locally');
  console.log('  join            Join an existing project');
  console.log('  list            List all local projects');
  console.log('  remove          Remove a local project');
  console.log('  delete          Delete a project and all contributions');
  console.log('  contribute      Add a contribution by entry type');
  console.log('  query           Query project contributions');
  console.log('  status          Show project status overview');
  console.log('');
  console.log('Federation commands:');
  console.log('  request-join    Request to join a peer\'s project');
  console.log('  send-contribution  Send a contribution to a peer');
  console.log('  query-peer      Query a peer\'s project contributions');
  console.log('  status-peer     Request project status from a peer');
  console.log('');
  console.log('Examples:');
  console.log('  ogp project create my-project "My Project" --description "..."');
  console.log('  ogp project contribute my-project task "Complete feature X"');
  console.log('  ogp project query my-project --type decision --limit 10');
  console.log('');
}

/**
 * Intent registry help
 */
function showIntentHelp(): void {
  console.log('\nIntent registry management:');
  console.log('  register        Register a new intent handler');
  console.log('  list            List all registered intents');
  console.log('  remove          Remove a registered intent');
  console.log('');
  console.log('Examples:');
  console.log('  ogp intent register my-intent --script ./handler.sh --description "..."');
  console.log('  ogp intent list');
  console.log('  ogp intent remove my-intent');
  console.log('');
}
