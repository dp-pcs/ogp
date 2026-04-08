# OGP CLI Reference

Complete command-line reference for OGP (Open Gateway Protocol).

## Table of Contents

- [Global Options](#global-options)
- [Setup and Configuration](#setup-and-configuration)
- [Daemon Management](#daemon-management)
- [Federation Commands](#federation-commands)
- [Agent Communications](#agent-communications)
- [Project Management](#project-management)
- [Intent Management](#intent-management)
- [Tunnel Management](#tunnel-management)
- [System Integration](#system-integration)
- [Completion](#completion)
- [Multi-Framework Operations](#multi-framework-operations)

## Global Options

All commands support the following global options:

### --for <framework>

Specifies which framework configuration to use.

**Syntax:**
```bash
ogp --for <framework> <command>
```

**Arguments:**
- `<framework>` - Framework identifier: `openclaw`, `hermes`, `standalone`, or `all`

**Examples:**
```bash
# Use OpenClaw config
ogp --for openclaw federation list

# Use Hermes config
ogp --for hermes start --background

# Run on all frameworks
ogp --for all status
```

**Behavior:**
- If only one framework is configured, it's auto-selected (no `--for` needed)
- If multiple frameworks are configured and no default is set, prompts interactively
- If a default framework is set, uses default (can override with `--for`)
- `--for all` runs command on all enabled frameworks and aggregates output

### --help, -h

Shows help for any command.

**Examples:**
```bash
ogp --help
ogp federation --help
ogp federation send --help
```

### --version, -v

Shows OGP version.

**Example:**
```bash
ogp --version
```

## Setup and Configuration

### ogp setup

Interactive setup wizard. Detects installed frameworks and guides through configuration.

**Syntax:**
```bash
ogp setup [--force]
```

**Options:**
- `--force` - Force re-setup even if already configured

**Example:**
```bash
ogp setup
```

**Prompts:**
1. Framework selection (auto-detected)
2. Agent selection (auto-discovered from framework config)
3. Daemon port (default: 18790 for OpenClaw, 18793 for Hermes)
4. Framework URL and API credentials
5. Gateway URL (your public URL)
6. Rendezvous configuration (optional)
7. Display name and email

### ogp config list

List all configured frameworks.

**Syntax:**
```bash
ogp config list [--quiet]
```

**Options:**
- `--quiet` - Output framework IDs only (for scripting/completion)

**Example:**
```bash
ogp config list
```

**Output:**
```
Configured frameworks:
  openclaw  [default]  ● Enabled  ~/.ogp-openclaw/  18790
  hermes               ● Enabled  ~/.ogp-hermes/    18793
```

### ogp config set-default

Set the default framework (used when no `--for` flag is specified).

**Syntax:**
```bash
ogp config set-default <framework>
```

**Arguments:**
- `<framework>` - Framework identifier: `openclaw`, `hermes`, `standalone`

**Example:**
```bash
ogp config set-default openclaw
```

### ogp config enable

Enable a framework.

**Syntax:**
```bash
ogp config enable <framework>
```

**Arguments:**
- `<framework>` - Framework identifier

**Example:**
```bash
ogp config enable hermes
```

### ogp config disable

Disable a framework.

**Syntax:**
```bash
ogp config disable <framework>
```

**Arguments:**
- `<framework>` - Framework identifier

**Example:**
```bash
ogp config disable hermes
```

### ogp config show

Show current configuration.

**Syntax:**
```bash
ogp config show [--for <framework>]
```

**Options:**
- `--for <framework>` - Show specific framework config (default: current/default)

**Example:**
```bash
ogp config show
ogp --for hermes config show
```

## Daemon Management

### ogp start

Start the OGP daemon.

**Syntax:**
```bash
ogp start [--background] [--for <framework>]
```

**Options:**
- `--background` - Run as background process
- `--for <framework>` - Framework to start (default: current/default)

**Examples:**
```bash
# Start in foreground (shows logs)
ogp start

# Start in background
ogp start --background

# Start specific framework
ogp --for openclaw start --background

# Start all frameworks
ogp --for all start --background
```

### ogp stop

Stop the OGP daemon.

**Syntax:**
```bash
ogp stop [--for <framework>]
```

**Options:**
- `--for <framework>` - Framework to stop (default: current/default)

**Examples:**
```bash
# Stop default framework
ogp stop

# Stop specific framework
ogp --for hermes stop

# Stop all frameworks
ogp --for all stop
```

### ogp status

Show daemon status and configuration.

**Syntax:**
```bash
ogp status [--for <framework>]
```

**Options:**
- `--for <framework>` - Framework to check (default: current/default)

**Examples:**
```bash
# Check default framework
ogp status

# Check specific framework
ogp --for openclaw status

# Check all frameworks
ogp --for all status
```

**Output:**
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

## Federation Commands

### ogp federation list

List all peers.

**Syntax:**
```bash
ogp federation list [--status <status>] [--for <framework>]
```

**Options:**
- `--status <status>` - Filter by status: `pending`, `approved`, `rejected`, `removed`
- `--for <framework>` - Framework to query (default: current/default)

**Examples:**
```bash
# List all peers
ogp federation list

# List pending requests
ogp federation list --status pending

# List approved peers
ogp federation list --status approved

# List peers across all frameworks
ogp --for all federation list
```

### ogp federation request

Send a federation request to a peer.

**Syntax:**
```bash
ogp federation request <url> [--alias <alias>] [--for <framework>]
```

**Arguments:**
- `<url>` - Peer's gateway URL (e.g., `https://peer.example.com`)

**Options:**
- `--alias <alias>` - Friendly name for the peer (auto-resolves from `/.well-known/ogp` if omitted)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Request with auto-resolved alias
ogp federation request https://peer.example.com

# Request with custom alias
ogp federation request https://peer.example.com --alias apollo

# Request from specific framework
ogp --for openclaw federation request https://hermes.example.com --alias hermes-gateway
```

### ogp federation approve

Approve a pending federation request.

**Syntax:**
```bash
ogp federation approve <peer-id> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Options:**
- `--intents <list>` - Comma-separated intents (e.g., `message,agent-comms`)
- `--rate <limit>` - Rate limit as requests/seconds (e.g., `100/3600`)
- `--topics <list>` - Topics for agent-comms (e.g., `memory-management,task-delegation`)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Approve without restrictions (v0.1 compatibility)
ogp federation approve apollo

# Approve with scope grants (v0.2.0+)
ogp federation approve apollo \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation

# Approve from specific framework
ogp --for hermes federation approve bob --intents message
```

### ogp federation reject

Reject a pending federation request.

**Syntax:**
```bash
ogp federation reject <peer-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Examples:**
```bash
ogp federation reject charlie
ogp --for hermes federation reject charlie
```

### ogp federation remove

Remove a peer from federation (asymmetric tear-down).

**Syntax:**
```bash
ogp federation remove <peer-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Examples:**
```bash
ogp federation remove apollo
ogp --for openclaw federation remove apollo
```

### ogp federation send

Send a message to an approved peer.

**Syntax:**
```bash
ogp federation send <peer-id> <intent> <payload> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name
- `<intent>` - Intent type: `message`, `task-request`, `status-update`, `agent-comms`, `project.*`
- `<payload>` - JSON payload

**Options:**
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Simple message
ogp federation send apollo message '{"text":"Hello from OGP!"}'

# Task request
ogp federation send apollo task-request '{
  "taskType": "analysis",
  "description": "Analyze recent logs"
}'

# Status update
ogp federation send apollo status-update '{
  "status": "completed",
  "message": "Task finished"
}'

# From specific framework
ogp --for hermes federation send bob message '{"text":"Hello from Hermes!"}'
```

### ogp federation agent

Send an agent-comms message to a peer.

**Syntax:**
```bash
ogp federation agent <peer-id> <topic> <message> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name
- `<topic>` - Topic for routing (e.g., `memory-management`, `task-delegation`)
- `<message>` - Message text

**Options:**
- `--priority <level>` - Priority: `low`, `normal`, `high` (default: `normal`)
- `--wait` - Wait for reply
- `--timeout <ms>` - Reply timeout in milliseconds (default: 30000)
- `--conversation <id>` - Conversation ID for threading
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Simple agent-comms
ogp federation agent apollo memory-management "How do you persist context?"

# High-priority message
ogp federation agent apollo task-delegation "Schedule standup ASAP" --priority high

# Wait for reply
ogp federation agent apollo queries "What's the status?" --wait --timeout 60000

# Threaded conversation
ogp federation agent apollo project-planning "Let's discuss sprint goals" --conversation sprint-42
```

### ogp federation scopes

Show scope grants for a peer.

**Syntax:**
```bash
ogp federation scopes <peer-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Examples:**
```bash
ogp federation scopes apollo
ogp --for hermes federation scopes bob
```

### ogp federation grant

Update scope grants for an existing peer.

**Syntax:**
```bash
ogp federation grant <peer-id> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Options:**
- `--intents <list>` - Comma-separated intents
- `--rate <limit>` - Rate limit as requests/seconds
- `--topics <list>` - Topics for agent-comms
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Update intents
ogp federation grant apollo --intents agent-comms

# Update topics
ogp federation grant apollo --topics memory-management,planning

# Update rate limit
ogp federation grant apollo --rate 200/3600
```

### ogp federation alias

Manage peer aliases.

**Syntax:**
```bash
ogp federation alias <peer-id> <new-alias> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Current peer identifier or alias
- `<new-alias>` - New alias

**Examples:**
```bash
ogp federation alias 302a300506... apollo
ogp federation alias apollo big-papa
```

### ogp federation ping

Test connectivity to a peer gateway.

**Syntax:**
```bash
ogp federation ping <url> [--for <framework>]
```

**Arguments:**
- `<url>` - Peer's gateway URL

**Examples:**
```bash
ogp federation ping https://peer.example.com
```

### ogp federation invite

Generate a short-lived invite code for easy federation setup (v0.2.15+).

**Syntax:**
```bash
ogp federation invite [--ttl <seconds>] [--for <framework>]
```

**Options:**
- `--ttl <seconds>` - Time-to-live in seconds (default: 600)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Generate invite with 10-minute expiry
ogp federation invite

# Custom TTL (30 minutes)
ogp federation invite --ttl 1800
```

**Output:**
```
Your invite code: a3f7k2  (expires in 10 minutes)
Share this with your peer — they run: ogp federation accept a3f7k2
```

### ogp federation accept

Accept an invite code and auto-connect to peer (v0.2.15+).

**Syntax:**
```bash
ogp federation accept <token> [--alias <alias>] [--for <framework>]
```

**Arguments:**
- `<token>` - Invite code (e.g., `a3f7k2`)

**Options:**
- `--alias <alias>` - Custom alias for the peer
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Accept invite
ogp federation accept a3f7k2

# Accept with custom alias
ogp federation accept a3f7k2 --alias apollo
```

### ogp federation connect

Connect to a peer by public key via rendezvous (v0.2.14+).

**Syntax:**
```bash
ogp federation connect <pubkey> [--alias <alias>] [--for <framework>]
```

**Arguments:**
- `<pubkey>` - Peer's public key

**Options:**
- `--alias <alias>` - Custom alias for the peer
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp federation connect 302a300506032b6570032100...
ogp federation connect 302a300506... --alias apollo
```

## Agent Communications

### ogp agent-comms policies

Show response policies.

**Syntax:**
```bash
ogp agent-comms policies [peer-id] [--for <framework>]
```

**Arguments:**
- `[peer-id]` - Optional peer filter (shows all if omitted)

**Examples:**
```bash
# Show all policies
ogp agent-comms policies

# Show policies for specific peer
ogp agent-comms policies apollo
```

### ogp agent-comms configure

Configure response policies for one or more peers.

**Syntax:**
```bash
ogp agent-comms configure [peer-ids] [options] [--for <framework>]
```

**Arguments:**
- `[peer-ids]` - Comma-separated peer IDs, or `--global` for defaults

**Options:**
- `--global` - Configure global defaults (applies to all peers)
- `--topics <list>` - Comma-separated topics
- `--level <level>` - Response level: `full`, `summary`, `escalate`, `deny`, `off`
- `--notes <text>` - Notes about this configuration
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Configure global defaults
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level summary

# Configure specific peer
ogp agent-comms configure apollo \
  --topics "memory-management" \
  --level full \
  --notes "Trusted collaborator"

# Configure multiple peers
ogp agent-comms configure apollo,bob,charlie \
  --topics "testing,debugging" \
  --level full
```

### ogp agent-comms add-topic

Add a topic policy for a peer.

**Syntax:**
```bash
ogp agent-comms add-topic <peer-id> <topic> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<topic>` - Topic name

**Options:**
- `--level <level>` - Response level (default: `summary`)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp agent-comms add-topic apollo calendar --level escalate
ogp agent-comms add-topic bob deployment --level full
```

### ogp agent-comms remove-topic

Remove a topic policy for a peer.

**Syntax:**
```bash
ogp agent-comms remove-topic <peer-id> <topic> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<topic>` - Topic name

**Examples:**
```bash
ogp agent-comms remove-topic apollo personal
```

### ogp agent-comms reset

Reset a peer to global defaults.

**Syntax:**
```bash
ogp agent-comms reset <peer-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias

**Examples:**
```bash
ogp agent-comms reset apollo
```

### ogp agent-comms activity

Show activity log.

**Syntax:**
```bash
ogp agent-comms activity [peer-id] [options] [--for <framework>]
```

**Arguments:**
- `[peer-id]` - Optional peer filter

**Options:**
- `--last <n>` - Show last N entries (default: 10)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Show recent activity
ogp agent-comms activity

# Show last 20 entries
ogp agent-comms activity --last 20

# Filter by peer
ogp agent-comms activity apollo
```

### ogp agent-comms default

Set default response level for unknown topics.

**Syntax:**
```bash
ogp agent-comms default <level> [--for <framework>]
```

**Arguments:**
- `<level>` - Response level: `full`, `summary`, `escalate`, `deny`, `off`

**Examples:**
```bash
# Allow unknown topics (summary response)
ogp agent-comms default summary

# Default-deny (send signed rejection)
ogp agent-comms default off
```

### ogp agent-comms logging

Enable or disable activity logging.

**Syntax:**
```bash
ogp agent-comms logging <on|off> [--for <framework>]
```

**Arguments:**
- `<on|off>` - Enable or disable logging

**Examples:**
```bash
ogp agent-comms logging on
ogp agent-comms logging off
```

## Project Management

### ogp project create

Create a new project.

**Syntax:**
```bash
ogp project create <id> <name> [options] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier (alphanumeric, hyphens, underscores)
- `<name>` - Project display name

**Options:**
- `--description <text>` - Project description
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp project create expense-app "Expense Tracker App" \
  --description "Mobile expense tracking application"
```

### ogp project join

Join an existing project.

**Syntax:**
```bash
ogp project join <id> [name] [options] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier
- `[name]` - Optional project name

**Options:**
- `--description <text>` - Project description
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp project join shared-app "Shared Application"
```

### ogp project list

List all projects.

**Syntax:**
```bash
ogp project list [--for <framework>]
```

**Examples:**
```bash
ogp project list
ogp --for all project list
```

### ogp project contribute

Add a contribution to a project.

**Syntax:**
```bash
ogp project contribute <id> <type> <summary> [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier
- `<type>` - Entry type: `progress`, `decision`, `blocker`, `context`
- `<summary>` - Contribution summary

**Examples:**
```bash
ogp project contribute expense-app progress "Completed authentication system"
ogp project contribute expense-app decision "Using PostgreSQL for persistence"
ogp project contribute expense-app blocker "Waiting for API key approval"
ogp project contribute expense-app context "Target users: small business owners"
```

### ogp project query

Query project contributions.

**Syntax:**
```bash
ogp project query <id> [options] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier

**Options:**
- `--limit <n>` - Max number of entries (default: 20)
- `--type <type>` - Filter by entry type
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Query recent contributions
ogp project query expense-app --limit 10

# Filter by type
ogp project query expense-app --type progress
```

### ogp project status

Show project status.

**Syntax:**
```bash
ogp project status <id> [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier

**Examples:**
```bash
ogp project status expense-app
```

### ogp project request-join

Request to join a peer's project.

**Syntax:**
```bash
ogp project request-join <peer-id> <project-id> <name> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<project-id>` - Project identifier
- `<name>` - Project name

**Examples:**
```bash
ogp project request-join apollo mobile-app "Mobile App Project"
```

### ogp project send-contribution

Send a contribution to a peer's project.

**Syntax:**
```bash
ogp project send-contribution <peer-id> <project-id> <type> <summary> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<project-id>` - Project identifier
- `<type>` - Entry type: `progress`, `decision`, `blocker`, `context`
- `<summary>` - Contribution summary

**Examples:**
```bash
ogp project send-contribution apollo shared-app progress "Deployed staging environment"
```

### ogp project query-peer

Query a peer's project contributions.

**Syntax:**
```bash
ogp project query-peer <peer-id> <project-id> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<project-id>` - Project identifier

**Options:**
- `--limit <n>` - Max number of entries (default: 20)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp project query-peer apollo shared-app --limit 10
```

### ogp project status-peer

Get a peer's project status.

**Syntax:**
```bash
ogp project status-peer <peer-id> <project-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<project-id>` - Project identifier

**Examples:**
```bash
ogp project status-peer apollo shared-app
```

### ogp project delete

Delete a project.

**Syntax:**
```bash
ogp project delete <id> [--confirm] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier

**Options:**
- `--confirm` - Skip confirmation prompt
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp project delete old-project --confirm
```

## Intent Management

### ogp intent register

Register a custom intent handler.

**Syntax:**
```bash
ogp intent register <name> [options] [--for <framework>]
```

**Arguments:**
- `<name>` - Intent name

**Options:**
- `--session-key <key>` - Session key for routing (e.g., `agent:main:main`)
- `--description <text>` - Intent description
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp intent register deployment \
  --session-key "agent:main:main" \
  --description "Deployment notifications"
```

### ogp intent list

List all registered intents.

**Syntax:**
```bash
ogp intent list [--for <framework>]
```

**Examples:**
```bash
ogp intent list
ogp --for all intent list
```

### ogp intent remove

Remove a registered intent.

**Syntax:**
```bash
ogp intent remove <name> [--for <framework>]
```

**Arguments:**
- `<name>` - Intent name

**Examples:**
```bash
ogp intent remove deployment
```

## Tunnel Management

### ogp expose

Start a public tunnel to expose the daemon to the internet.

**Syntax:**
```bash
ogp expose [--background] [--method <method>] [--for <framework>]
```

**Options:**
- `--background` - Run as background process
- `--method <method>` - Tunnel method: `cloudflared`, `ngrok` (default: `cloudflared`)
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Start cloudflared tunnel (foreground)
ogp expose

# Start in background
ogp expose --background

# Use ngrok
ogp expose --method ngrok

# Expose specific framework
ogp --for hermes expose --background
```

### ogp expose stop

Stop the tunnel.

**Syntax:**
```bash
ogp expose stop [--for <framework>]
```

**Examples:**
```bash
ogp expose stop
ogp --for all expose stop
```

## System Integration

### ogp install

Install macOS LaunchAgent for auto-start on login.

**Syntax:**
```bash
ogp install [--for <framework>]
```

**Examples:**
```bash
ogp install
ogp --for openclaw install
```

### ogp uninstall

Remove macOS LaunchAgent.

**Syntax:**
```bash
ogp uninstall [--for <framework>]
```

**Examples:**
```bash
ogp uninstall
ogp --for openclaw uninstall
```

## Completion

### ogp completion install

Install shell completion.

**Syntax:**
```bash
ogp completion install <shell>
```

**Arguments:**
- `<shell>` - Shell type: `bash` or `zsh`

**Examples:**
```bash
# Install bash completion
ogp completion install bash

# Install zsh completion
ogp completion install zsh
```

After installation, reload your shell:

```bash
source ~/.bashrc    # Bash
source ~/.zshrc     # Zsh
```

### ogp completion uninstall

Uninstall shell completion.

**Syntax:**
```bash
ogp completion uninstall <shell>
```

**Arguments:**
- `<shell>` - Shell type: `bash` or `zsh`

**Examples:**
```bash
ogp completion uninstall bash
```

## Multi-Framework Operations

### Running Commands Across All Frameworks

Use `--for all` to run commands on all enabled frameworks:

**Examples:**
```bash
# Start all daemons
ogp --for all start --background

# Check status of all frameworks
ogp --for all status

# List peers across all frameworks
ogp --for all federation list

# Stop all daemons
ogp --for all stop
```

**Output Format:**

When using `--for all`, output is grouped by framework:

```
=== OpenClaw (Junior @ OpenClaw) ===
[command output for OpenClaw]

=== Hermes (Apollo @ Hermes) ===
[command output for Hermes]
```

### Framework-Specific Commands

Commands that don't support `--for all`:

- `ogp setup` - Must configure each framework individually
- `ogp config set-default` - Sets a single default
- Federation operations targeting specific peers (use explicit `--for`)

### Environment Variable Override

The `OGP_HOME` environment variable overrides framework selection:

```bash
# Explicitly use custom config directory
OGP_HOME=~/.ogp-custom ogp status
```

This takes precedence over `--for` flag and default framework setting.

## Response Levels Reference

Agent-comms response levels control how your agent responds to incoming messages:

| Level | Behavior |
|-------|----------|
| `full` | Respond openly with full details |
| `summary` | High-level responses only, no sensitive details |
| `escalate` | Ask human before responding |
| `deny` | Politely decline to discuss topic |
| `off` | Default-deny: send signed rejection, do not process |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Network error |
| 4 | Authentication error |
| 5 | Permission error |
| 126 | Command cannot execute |
| 127 | Command not found |
| 130 | Interrupted (Ctrl+C) |

## See Also

- [Getting Started Guide](./GETTING-STARTED.md) - Setup and workflows
- [Federation Flow](./federation-flow.md) - Message flow details
- [Scope Negotiation](./scopes.md) - Access control
- [Agent Communications](./agent-comms.md) - Agent-to-agent messaging
- [Migration Guide](./MIGRATION.md) - Upgrading to multi-framework
