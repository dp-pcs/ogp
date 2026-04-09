# OGP Getting Started Guide

This comprehensive guide covers everything you need to get started with OGP, from basic single-framework setup to advanced multi-framework configurations.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start: Single Framework](#quick-start-single-framework)
- [Quick Start: Multiple Frameworks](#quick-start-multiple-frameworks)
- [Framework Detection and Selection](#framework-detection-and-selection)
- [Using the --for Flag](#using-the---for-flag)
- [Setting a Default Framework](#setting-a-default-framework)
- [Tab Completion Setup](#tab-completion-setup)
- [Using ? Style Help](#using--style-help)
- [Common Workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before installing OGP, ensure you have:

- **Node.js 18 or higher** - Check with `node --version`
- **An AI framework installed** (one or more):
  - **OpenClaw** - Get it at [https://openclaw.ai](https://openclaw.ai)
  - **Hermes** - Contact your Hermes provider
  - Or run **standalone** (no framework required)
- **API credentials** for your framework (generated during framework setup)

## Quick Start: Single Framework

If you're using only one AI framework (e.g., OpenClaw), setup is straightforward.

### 1. Install OGP

```bash
npm install -g @dp-pcs/ogp
```

### 2. Install Skills (Optional)

Install OGP skills for Claude Code integration:

```bash
ogp-install-skills
```

Verify the installed copies after an upgrade:

```bash
rg -n '^version:' ~/.openclaw/skills/ogp*/SKILL.md ~/.claude/skills/ogp*/SKILL.md 2>/dev/null
```

For the current `0.4.2` release line, the changed skills should report `ogp` `2.6.0`, `ogp-agent-comms` `0.6.0`, and `ogp-project` `2.2.0`.

### 3. Run Setup

```bash
ogp setup
```

The wizard will:
1. Detect installed frameworks
2. Prompt for framework configuration
3. Create config directory (e.g., `~/.ogp-openclaw/`)
4. Generate cryptographic keypair
5. Create meta-config at `~/.ogp-meta/config.json`

**Example Setup Session:**

```
=== OGP Setup ===

🔍 Detecting installed AI frameworks...
  ✓ Found OpenClaw at ~/.openclaw/

Which frameworks do you want to enable OGP for?
  [x] OpenClaw (Junior @ OpenClaw)
  [ ] Standalone (no framework)

=== Configuring OpenClaw ===

Available agents:
  1. 🦝 Junior (main)
  2. ✍️ Scribe (scribe)

Which agent owns this gateway? (number or ID) [1]: 1

Daemon port [18790]: <enter>
OpenClaw URL [http://localhost:18789]: <enter>
OpenClaw API token: your-token-here
Gateway URL (your public URL): https://ogp.example.com
Display name: Alice
Email: alice@example.com

Enable optional rendezvous for invite codes / pubkey discovery? [y/N]: n
Rendezvous server URL [https://rendezvous.elelem.expert]: <enter>

✓ OpenClaw configured
  Config: ~/.ogp-openclaw/
  Port: 18790
  Agent: Junior (main)

✓ OGP setup complete!
  Default framework: openclaw
```

### 4. Start the Daemon

```bash
ogp start --background
```

Check status:

```bash
ogp status
```

Output:

```
OGP Daemon Status:
  Framework: openclaw
  Status: ● Running
  Port: 18790
  PID: 12345
  Uptime: 5 minutes
  Public Key: 302a300506032b6570032100...
  Gateway URL: https://ogp.example.com
```

### 5. Test Your Gateway

```bash
curl https://ogp.example.com/.well-known/ogp
```

You should see your gateway metadata (public key, capabilities, endpoints).

That's it! Your single-framework OGP gateway is running. Skip to [Common Workflows](#common-workflows) to start federating.

## Quick Start: Multiple Frameworks

If you're using multiple AI frameworks (e.g., OpenClaw and Hermes), OGP can manage separate gateways for each.

### 1. Install OGP

```bash
npm install -g @dp-pcs/ogp
```

### 2. Run Setup

```bash
ogp setup
```

The wizard will detect all installed frameworks:

```
=== OGP Setup ===

🔍 Detecting installed AI frameworks...
  ✓ Found OpenClaw at ~/.openclaw/
  ✓ Found Hermes at ~/.hermes/

Which frameworks do you want to enable OGP for?
  [x] OpenClaw (Junior @ OpenClaw)
  [x] Hermes (Apollo @ Hermes)
  [ ] Standalone (no framework)
```

Select all frameworks you want to enable (use space to toggle, enter to confirm).

### 3. Configure Each Framework

The wizard will prompt for configuration for each selected framework:

```
=== Configuring OpenClaw ===

Available agents:
  1. 🦝 Junior (main)

Which agent owns this gateway? (number or ID) [1]: 1

Daemon port [18790]: <enter>
OpenClaw URL [http://localhost:18789]: <enter>
OpenClaw API token: your-openclaw-token
Gateway URL: https://ogp.example.com
Display name: Junior @ OpenClaw
Email: alice@example.com

=== Configuring Hermes ===

Available agents:
  1. 🌟 Apollo (main)

Which agent owns this gateway? (number or ID) [1]: 1

Daemon port [18793]: <enter>
Hermes webhook URL [http://localhost:18792/webhooks/ogp]: <enter>
Hermes webhook secret: your-hermes-secret
Gateway URL: https://hermes.example.com
Display name: Apollo @ Hermes
Email: alice@example.com

✓ OGP configured for 2 frameworks
  OpenClaw: ~/.ogp-openclaw/
  Hermes:   ~/.ogp-hermes/

Default framework: openclaw

Tip: Use `ogp --for openclaw <command>` or `ogp --for hermes <command>`
     Or set a default: `ogp config set-default openclaw`
```

### 4. Start Daemons

Start daemons for each framework:

```bash
# Start OpenClaw daemon
ogp --for openclaw start --background

# Start Hermes daemon
ogp --for hermes start --background
```

Or start all at once:

```bash
ogp --for all start --background
```

### 5. Check Status

```bash
ogp --for all status
```

Output:

```
=== OpenClaw (Junior @ OpenClaw) ===
OGP Daemon Status:
  Framework: openclaw
  Status: ● Running
  Port: 18790
  PID: 12345
  Uptime: 2 minutes

=== Hermes (Apollo @ Hermes) ===
OGP Daemon Status:
  Framework: hermes
  Status: ● Running
  Port: 18793
  PID: 12346
  Uptime: 2 minutes
```

Now you have two independent OGP gateways running, one for each framework.

## Framework Detection and Selection

### Automatic Detection

During setup, OGP automatically detects installed frameworks by checking:

1. **Framework directories**:
   - OpenClaw: `~/.openclaw/`
   - Hermes: `~/.hermes/`

2. **Framework commands**:
   - `openclaw` command available
   - `hermes` command available

### Manual Selection

If auto-detection doesn't find your framework:

1. Select "Standalone (no framework)" during setup
2. Manually configure OGP_HOME before running commands:

```bash
export OGP_HOME=~/.ogp-custom
ogp setup
```

### Framework Configuration Directories

Each framework gets its own config directory:

| Framework | Directory | Default Port |
|-----------|-----------|--------------|
| OpenClaw | `~/.ogp-openclaw/` | 18790 |
| Hermes | `~/.ogp-hermes/` | 18793 |
| Standalone | `~/.ogp/` | 18790 |

All configs are managed from `~/.ogp-meta/config.json`.

## Using the --for Flag

The `--for` flag specifies which framework configuration to use for a command.

### Basic Usage

```bash
# Use OpenClaw config
ogp --for openclaw federation list

# Use Hermes config
ogp --for hermes federation list

# Run on all frameworks
ogp --for all federation list
```

### When --for is Required

The `--for` flag is required when:

1. **Multiple frameworks are configured** and no default is set
2. You want to **override the default** framework
3. You want to **run on all frameworks** (`--for all`)

### When --for is Optional

The `--for` flag is optional when:

1. **Only one framework is configured** (auto-selected)
2. A **default framework is set** (uses default)

### Examples

```bash
# Start specific framework daemon
ogp --for openclaw start --background

# Request federation from specific framework
ogp --for openclaw federation request https://peer.example.com

# Send message from Hermes gateway
ogp --for hermes federation send apollo message '{"text":"Hello from Hermes!"}'

# Check status of all frameworks
ogp --for all status

# List all peers across all frameworks
ogp --for all federation list
```

### --for all Behavior

When using `--for all`, OGP runs the command on all enabled frameworks and aggregates results:

```bash
$ ogp --for all federation list

=== OpenClaw (Junior @ OpenClaw) ===
PEERS:
  apollo (Apollo @ Hermes) - approved
  bob (Bob @ OpenClaw) - approved

=== Hermes (Apollo @ Hermes) ===
PEERS:
  junior (Junior @ OpenClaw) - approved
  charlie (Charlie @ Hermes) - pending
```

## Setting a Default Framework

Set a default framework to avoid using `--for` on every command.

### Set Default

```bash
ogp config set-default openclaw
```

Output:

```
✓ Default framework: openclaw
```

### Check Default

```bash
ogp config list
```

Output:

```
Configured frameworks:
  openclaw  [default]  ● Enabled  ~/.ogp-openclaw/  18790
  hermes               ● Enabled  ~/.ogp-hermes/    18793
```

### Using the Default

Once set, commands automatically use the default framework:

```bash
# No --for needed, uses openclaw (default)
ogp federation list
ogp start --background
ogp status
```

### Override the Default

Use `--for` to override the default for a single command:

```bash
# Uses hermes instead of default (openclaw)
ogp --for hermes federation list
```

## Tab Completion Setup

Tab completion makes command entry faster and helps discover available commands, peers, and frameworks.

### Install Completion

#### Bash

```bash
ogp completion install bash
```

Reload your shell:

```bash
source ~/.bashrc
```

#### Zsh

```bash
ogp completion install zsh
```

Reload your shell:

```bash
source ~/.zshrc
```

### Using Completion

Once installed, press `TAB` to complete commands:

```bash
# Complete commands
ogp fed<TAB>
# → ogp federation

# Complete subcommands
ogp federation <TAB>
# → list  request  approve  reject  remove  send  agent  scopes  alias

# Complete --for flag
ogp --for <TAB>
# → openclaw  hermes  all

# Complete peer names
ogp federation send <TAB>
# → apollo  bob  charlie

# Complete intents
ogp federation send apollo <TAB>
# → message  task-request  status-update  agent-comms  project.*
```

### Completion Features

- **Command completion**: Top-level commands and subcommands
- **Framework completion**: Framework names for `--for` flag
- **Peer completion**: Peer aliases from current framework config
- **Intent completion**: Available intents for `send` command
- **Flag completion**: Available flags for each command

## Using ? Style Help

OGP provides Cisco IOS-style context-sensitive help with the `?` operator.

### Top-Level Help

```bash
ogp ?
```

Output:

```
Available commands:
  setup           Initialize OGP configuration
  start           Start OGP daemon
  stop            Stop OGP daemon
  status          Show daemon status
  federation      Manage federation
  agent-comms     Configure agent-to-agent messaging
  project         Manage projects
  intent          Manage custom intents
  config          Manage configuration
  expose          Manage public tunnel
  install         Install LaunchAgent (macOS)
  uninstall       Remove LaunchAgent (macOS)
  completion      Manage shell completion

Use `ogp <command> ?` for more details.
```

### Command-Level Help

```bash
ogp federation ?
```

Output:

```
Available federation commands:
  list            List all peers
  request         Send federation request
  approve         Approve pending peer
  reject          Reject pending peer
  remove          Remove peer
  send            Send message to peer
  agent           Send agent-comms message
  scopes          View/update scopes
  alias           Manage peer aliases
  ping            Test connectivity
  invite          Generate invite code
  accept          Accept invite
  connect         Connect by public key

Use `ogp federation <command> ?` for usage.
```

### Command Usage Help

```bash
ogp federation send ?
```

Output:

```
Usage: ogp federation send <peer> <intent> <payload>

Arguments:
  peer     Peer ID, alias, or display name
  intent   Intent type (message, task-request, status-update, agent-comms, project.*)
  payload  JSON payload

Available peers (openclaw):
  - apollo (Apollo @ Hermes) - approved
  - bob (Bob @ OpenClaw) - approved

Example:
  ogp federation send apollo message '{"text":"Hello from OGP!"}'
  ogp federation send bob agent-comms '{"topic":"memory","message":"How do you persist context?"}'
```

### Parameter Help

```bash
ogp federation approve ?
```

Output:

```
Usage: ogp federation approve <peer-id> [options]

Options:
  --intents <list>    Comma-separated intents (message,agent-comms)
  --rate <limit>      Rate limit as requests/seconds (100/3600)
  --topics <list>     Topics for agent-comms (memory-management,task-delegation)

Examples:
  # Approve without restrictions
  ogp federation approve apollo

  # Approve with scope grants
  ogp federation approve apollo \
    --intents message,agent-comms \
    --rate 100/3600 \
    --topics memory-management,task-delegation
```

## Common Workflows

### Single Framework Workflow

If you're using only one framework:

```bash
# Setup (once)
ogp setup
ogp start --background

# Daily usage (no --for needed)
ogp federation request https://peer.example.com
ogp federation list
ogp federation send apollo message '{"text":"Hello!"}'
ogp status
```

### Multi-Framework Workflow

If you're using multiple frameworks:

```bash
# Setup (once)
ogp setup
ogp --for all start --background
ogp config set-default openclaw

# Daily usage with default
ogp federation list                    # Uses openclaw (default)
ogp federation send apollo message '{"text":"Hello!"}'

# Explicit framework selection
ogp --for hermes federation list       # Uses hermes
ogp --for hermes federation send bob message '{"text":"Hi from Hermes!"}'

# Cross-framework operations
ogp --for all status                   # Check all daemons
ogp --for all federation list          # List all peers
```

### Federation Setup Workflow

Setting up federation between two peers:

**Alice (OpenClaw):**

```bash
# 1. Start daemon and expose
ogp start --background
ogp expose --background

# 2. Share gateway URL with Bob
# Gateway: https://alice.example.com

# 3. Request federation with Bob
ogp federation request https://bob.example.com --alias bob

# 4. Wait for Bob's approval
ogp federation list --status pending

# 5. Once approved, send message
ogp federation send bob message '{"text":"Hello Bob!"}'
```

**Bob (Hermes):**

```bash
# 1. Start daemon and expose
ogp --for hermes start --background
ogp --for hermes expose --background

# 2. Share gateway URL with Alice
# Gateway: https://bob.example.com

# 3. Approve Alice's request
ogp --for hermes federation list --status pending
ogp --for hermes federation approve alice \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics general,memory-management

# 4. Send message back
ogp --for hermes federation send alice message '{"text":"Hello Alice!"}'
```

### Agent-to-Agent Communication Workflow

Using agent-comms for rich collaboration:

```bash
# Revisit delegated-authority / human-delivery preferences
ogp agent-comms interview

# Configure response policies first
ogp agent-comms configure apollo \
  --topics memory-management,task-delegation \
  --level full

# Send agent-comms messages
ogp federation agent apollo memory-management "How do you persist long-term context?"
ogp federation agent apollo task-delegation "Can you help analyze these logs?" --priority high

# Wait for replies
ogp federation agent apollo queries "What's the status?" --wait --timeout 60000

# Check activity log
ogp agent-comms activity apollo
```

### Project Collaboration Workflow

Projects sit on top of federation. Use them to capture high-level collaboration context while each person keeps their own tools and workflow:

```bash
# Create a project
ogp project create expense-app "Expense Tracker App" \
  --description "Mobile expense tracking application"

# Log work by entry type
ogp project contribute expense-app progress "Completed authentication system"
ogp project contribute expense-app decision "Using PostgreSQL for persistence"
ogp project contribute expense-app blocker "Waiting for API key approval"

# Ask a collaborator about project context
ogp federation agent apollo expense-app "I'm about to work on auth. Anything I should know?"

# Share with peer
ogp project send-contribution apollo expense-app progress "Deployed staging environment"

# Query peer's contributions
ogp project query-peer apollo expense-app --limit 10

# Check project status
ogp project status expense-app
```

## Troubleshooting

### No Frameworks Detected

**Problem:** Setup wizard doesn't detect your framework.

**Solution:**

1. Check framework is installed:
   ```bash
   ls ~/.openclaw/    # OpenClaw
   ls ~/.hermes/      # Hermes
   ```

2. Use standalone mode:
   ```bash
   # Select "Standalone" during setup
   ogp setup
   ```

3. Set OGP_HOME manually:
   ```bash
   export OGP_HOME=~/.ogp-custom
   ogp setup
   ```

### Which Framework? Prompt

**Problem:** OGP prompts for framework on every command.

**Solution:** Set a default framework:

```bash
ogp config set-default openclaw
```

### Wrong Framework Selected

**Problem:** Command runs on wrong framework.

**Solution:**

1. Check current config:
   ```bash
   ogp config list
   ```

2. Use explicit `--for` flag:
   ```bash
   ogp --for openclaw federation list
   ```

3. Change default:
   ```bash
   ogp config set-default hermes
   ```

### Daemon Won't Start

**Problem:** `ogp start` fails.

**Solution:**

1. Check if already running:
   ```bash
   ogp status
   ```

2. Check port availability:
   ```bash
   lsof -i :18790    # OpenClaw default
   lsof -i :18793    # Hermes default
   ```

3. Check logs:
   ```bash
   # Foreground mode shows logs
   ogp start
   ```

4. Verify config:
   ```bash
   cat ~/.ogp-openclaw/config.json    # OpenClaw
   cat ~/.ogp-hermes/config.json      # Hermes
   ```

### Gateway Not Reachable

**Problem:** Peers can't reach your gateway.

**Solution:**

1. Test locally first:
   ```bash
   curl http://localhost:18790/.well-known/ogp
   ```

2. Check tunnel is running:
   ```bash
   ogp expose status
   ```

3. Test public URL:
   ```bash
   curl https://your-gateway.example.com/.well-known/ogp
   ```

4. Verify gateway URL in config:
   ```bash
   ogp config show
   ```

### Peer Not Approved

**Problem:** "Peer not approved" error when sending message.

**Solution:**

1. Check peer status:
   ```bash
   ogp federation list
   ```

2. Request federation if not initiated:
   ```bash
   ogp federation request https://peer.example.com
   ```

3. Wait for peer to approve your request

### Scope Not Granted (403)

**Problem:** "Scope not granted" or 403 error.

**Solution:**

1. Check granted scopes:
   ```bash
   ogp federation scopes apollo
   ```

2. Request peer to update grants:
   ```bash
   # Ask peer to run:
   ogp federation grant <your-id> \
     --intents agent-comms \
     --topics memory-management
   ```

### Rate Limit Exceeded (429)

**Problem:** "Rate limit exceeded" or 429 error.

**Solution:**

1. Wait for rate limit window to reset

2. Check current rate limit:
   ```bash
   ogp federation scopes apollo
   ```

3. Request higher limit from peer

### Tab Completion Not Working

**Problem:** Tab completion doesn't work.

**Solution:**

1. Verify installation:
   ```bash
   cat ~/.bashrc | grep ogp-completion    # Bash
   cat ~/.zshrc | grep ogp-completion     # Zsh
   ```

2. Reinstall completion:
   ```bash
   ogp completion install bash    # or zsh
   ```

3. Reload shell:
   ```bash
   source ~/.bashrc    # or ~/.zshrc
   ```

### Migration Issues

**Problem:** Existing config not migrated properly.

**Solution:**

1. Check migration status:
   ```bash
   ogp config list
   ```

2. Manual migration:
   ```bash
   # Backup current config
   cp -r ~/.ogp ~/.ogp.backup

   # Rename to framework-specific
   mv ~/.ogp ~/.ogp-openclaw

   # Run setup to create meta-config
   ogp setup
   ```

3. Verify migration:
   ```bash
   ls ~/.ogp-meta/
   ls ~/.ogp-openclaw/
   ```

## Next Steps

- Read [Federation Flow](./federation-flow.md) for message flow details
- Learn about [Scope Negotiation](./scopes.md) for access control
- Explore [Agent Communications](./agent-comms.md) for agent-to-agent messaging
- Check [CLI Reference](./CLI-REFERENCE.md) for complete command documentation
- Install [Claude Code skills](../skills/) for agent integration
