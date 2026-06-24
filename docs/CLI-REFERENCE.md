# OGP CLI Reference

Complete command-line reference for OGP (Open Gateway Protocol).

## Table of Contents

- [Global Options](#global-options)
- [Environment Variables](#environment-variables)
- [Setup and Configuration](#setup-and-configuration)
- [Daemon Management](#daemon-management)
- [Identity](#identity)
- [Federation Commands](#federation-commands)
- [Agent Communications](#agent-communications)
- [Project Management](#project-management)
- [App Management](#app-management)
- [Intent Management](#intent-management)
- [Tunnel Management](#tunnel-management)
- [Keychain Management](#keychain-management)
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
- If the meta-registry is empty (no `ogp setup` was run) but `OGP_HOME` is set,
  `--for <framework>` honors `OGP_HOME` and prints a warning instead of failing.
  This is the common case in server/container deployments where the daemon is
  launched by setting `OGP_HOME` directly. See [Environment Variables](#environment-variables).

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

## Environment Variables

OGP does **not** hardcode its storage location. The default is `~/.ogp`, but
every path is resolved at runtime and can be overridden via environment
variables. This is the supported way to run OGP in containers, on servers
(ECS/nginx), or anywhere `$HOME` is not where you want config to live — no code
changes or recompilation required.

| Variable | Overrides | Default |
| --- | --- | --- |
| `OGP_HOME` | Per-framework data dir: `config.json`, `peers.json`, identity, keychain. **The daemon only needs this.** | `~/.ogp` |
| `OGP_META_HOME` | The multi-framework meta-registry (`config.json` listing frameworks for `--for`). | `~/.ogp-meta` |

**Server / container deployment (recommended):**
```bash
# Point both the daemon and the CLI at the same writable location.
export OGP_HOME=/data/ogp        # or e.g. /home/node/.openclaw/.ogp
ogp start --background
ogp peers list                   # CLI inherits OGP_HOME, talks to the daemon
```

**Common pitfall:** If the daemon is launched with `OGP_HOME` set but you then
run `ogp --for openclaw ...`, the CLI looks up `openclaw` in the meta-registry
(`OGP_META_HOME`), which was never populated by an interactive `ogp setup`.
As of this version, `--for` falls back to `OGP_HOME` with a warning instead of
erroring. The clean fix is to **not pass `--for` on a single-home server** — just
export `OGP_HOME` and let every `ogp` invocation inherit it.

**$HOME mismatch:** If the daemon and CLI run under different users/`$HOME`
values (common in containers), the meta-registry can silently "not exist" for
one of them. Set `OGP_META_HOME` (and `OGP_HOME`) explicitly so both processes
resolve the same paths.

## Setup and Configuration

### ogp setup

Interactive setup wizard. Detects installed frameworks and guides through configuration, keypair generation, and human-delivery preferences.

**Syntax:**
```bash
ogp setup [options]
```

**Options:**
- `--force` - Force re-setup even if already configured
- `--reset-keypair` - Generate a new Ed25519 keypair (new gateway identity — existing peers must re-federate)
- `--non-interactive` - Skip all prompts; requires `--answers`
- `--answers <path>` - JSON file with pre-filled answers for non-interactive setup

**Examples:**
```bash
ogp setup                          # interactive first-time setup
ogp setup --force                  # re-run setup
ogp setup --reset-keypair          # rotate keypair (peers must re-federate)
ogp setup --non-interactive --answers /etc/ogp-setup.json  # automated provisioning
```

**Interactive prompts:**
1. Framework selection (auto-detected)
2. Agent selection (auto-discovered from framework config)
3. Daemon port (default: 18790 for OpenClaw, 18793 for Hermes)
4. Framework URL and API credentials
5. Gateway URL (your public HTTPS URL)
6. Rendezvous configuration (optional)
7. Display name and email
8. Delegated-authority / human-delivery interview

### ogp agent-comms interview

Re-run the delegated-authority / human-delivery interview for the active framework without repeating full setup.

**Syntax:**
```bash
ogp agent-comms interview [--for <framework>]
```

**Examples:**
```bash
ogp --for openclaw agent-comms interview
ogp --for hermes agent-comms interview
```

**What it updates:**
- `humanDeliveryTarget` (OpenClaw-style human destination)
- `inboundFederationPolicy.mode`
- delegated-authority defaults for human surfacing, relay handling, approval-required topics, and trusted-peer autonomy posture

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

### ogp config show-identity

Show current identity configuration.

**Syntax:**
```bash
ogp config show-identity [--for <framework>]
```

**Options:**
- `--for <framework>` - Show identity for specific framework (default: current/default)

**Example:**
```bash
ogp config show-identity
```

Displays:
- Human name
- Agent name
- Organization
- Tags

### ogp config set-identity

Update your identity information. Identity includes separate human and agent attribution.

**Syntax:**
```bash
ogp config set-identity [options] [--for <framework>]
```

**Options:**
- `--human-name <name>` - Human operator name (e.g., "David Proctor")
- `--agent-name <name>` - Agent name (e.g., "Junior", "Apollo")
- `--organization <org>` - Organization (e.g., "Trilogy", "AICOE")
- `--for <framework>` - Framework to configure (default: current/default)

**Examples:**
```bash
# Set human name
ogp config set-identity --human-name "David Proctor"

# Set agent name
ogp config set-identity --agent-name "Junior"

# Set organization
ogp config set-identity --organization "Trilogy"

# Set multiple fields at once
ogp config set-identity \
  --human-name "David Proctor" \
  --agent-name "Junior" \
  --organization "Trilogy"
```

**Note:** After updating identity, use `ogp federation update-identity <peer-id>` to send the updated information to existing federated peers.

### ogp config set-tags

Set tags (replaces existing).

**Syntax:**
```bash
ogp config set-tags <tags> [--for <framework>]
```

**Arguments:**
- `<tags>` - Comma-separated list of tags

**Example:**
```bash
ogp config set-tags work,production,client-trilogy
```

### ogp config add-tag

Add a single tag.

**Syntax:**
```bash
ogp config add-tag <tag> [--for <framework>]
```

**Example:**
```bash
ogp config add-tag testing
```

### ogp config remove-tag

Remove a single tag.

**Syntax:**
```bash
ogp config remove-tag <tag> [--for <framework>]
```

**Example:**
```bash
ogp config remove-tag testing
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

## Identity

### ogp whoami

Show current gateway identity and configuration.

**Syntax:**
```bash
ogp whoami [--json] [--for <framework>]
```

**Options:**
- `--json` — machine-readable JSON (includes `publicKey` field)
- `--for <framework>` — Framework to use

**Examples:**
```bash
ogp whoami
ogp whoami --json
ogp whoami --json | grep publicKey    # extract public key for ogp-app.json publisher field
```

---

## Federation Commands

### ogp federation list

List all peers.

**Syntax:**
```bash
ogp federation list [--status <status>] [--tag <tag>] [--json] [--for <framework>]
```

**Options:**
- `--status <status>` - Filter by status: `pending`, `approved`, `rejected`, `removed`
- `--tag <tag>` - Filter by local tag
- `--json` - Machine-readable JSON output
- `--for <framework>` - Framework to query (default: current/default)

**Examples:**
```bash
# List all peers
ogp federation list

# List pending requests
ogp federation list --status pending

# List approved peers tagged "work"
ogp federation list --status approved --tag work

# List peers across all frameworks
ogp --for all federation list
```

### ogp federation status

Show federation health and alias → public key mappings.

**Syntax:**
```bash
ogp federation status [--json] [--for <framework>]
```

**Examples:**
```bash
ogp federation status
ogp --for all federation status
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
ogp federation send <peer-id> <intent> <payload> [options] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name
- `<intent>` - Intent type: `message`, `task-request`, `status-update`, `agent-comms`, `project.*`
- `<payload>` - JSON payload

**Options:**
- `--to-agent <persona>` - Target a specific persona on the peer (requires multi-agent-personas capability)
- `--durable` - Queue for retry if delivery fails (bd-8rd.3)
- `--best-effort` - Override `config.federation.durableDelivery` to false
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

# Durable delivery: retry until the peer accepts it
ogp federation send apollo message '{"text":"Important"}' --durable

# Force best-effort for this send even if durable is configured globally
ogp federation send apollo message '{"text":"Ephemeral"}' --best-effort
```

### ogp federation reconcile

Backfill project contributions from a peer. This is the manual recovery path for
bd-8rd.3 durable delivery: when messages were queued while a peer was offline,
run reconcile after the peer comes back online to fetch any contributions you
may have missed.

**Syntax:**
```bash
ogp federation reconcile <peer-id> [--project <project-id>] [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier, alias, or display name

**Options:**
- `--project <project-id>` - Reconcile only a specific shared project
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Reconcile all shared projects with a peer
ogp federation reconcile apollo

# Reconcile a single project
ogp federation reconcile apollo --project expense-app

# From a specific framework
ogp --for hermes federation reconcile apollo
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
- `--wait` - Wait for reply (blocks until reply arrives or timeout)
- `--detach` - Send and return a nonce immediately; check for reply later with `reply-status`
- `--timeout <ms>` - Reply timeout in milliseconds (default: 30000); used with `--wait`
- `--conversation <id>` - Conversation ID for threading
- `--to-agent <persona>` - Target a specific persona on the peer (requires multi-agent-personas capability)
- `--durable` - Queue for retry if delivery fails
- `--best-effort` - Override `config.federation.durableDelivery` to false
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Simple agent-comms
ogp federation agent cosmo memory-management "How do you persist context?"

# High-priority message
ogp federation agent cosmo task-delegation "Schedule standup ASAP" --priority high

# Wait synchronously for a reply (up to 60 seconds)
ogp federation agent cosmo queries "What's the status?" --wait --timeout 60000

# Fire and check later (detach pattern)
ogp federation agent cosmo general "Run that analysis" --detach
# → Returns: nonce: abc123xyz

# Threaded conversation
ogp federation agent cosmo project-planning "Let's discuss sprint goals" --conversation sprint-42
```

**Note:** `ogp agent-comms send` is an alias for this command and accepts the same options, except `--detach`.

### ogp federation reply-status

Check the status of a detached reply by its nonce.

**Syntax:**
```bash
ogp federation reply-status <nonce> [--for <framework>]
```

**Arguments:**
- `<nonce>` - Nonce returned by `ogp federation agent --detach`

**Examples:**
```bash
ogp federation reply-status abc123xyz
```

### ogp federation pending-replies

List all outstanding nonces from detached sends that have not yet received a reply.

**Syntax:**
```bash
ogp federation pending-replies [--for <framework>]
```

**Examples:**
```bash
ogp federation pending-replies
```

### ogp federation tag

Add local tags to a peer for filtering and organization.

**Syntax:**
```bash
ogp federation tag <peer-id> <tags...> [--for <framework>]
```

**Examples:**
```bash
ogp federation tag cosmo work trusted
ogp federation list --tag work    # filter by tag
```

### ogp federation untag

Remove tags from a peer.

**Syntax:**
```bash
ogp federation untag <peer-id> <tags...> [--for <framework>]
```

**Examples:**
```bash
ogp federation untag cosmo trusted
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

### ogp federation update-identity

Send updated identity information to an approved peer.

**Syntax:**
```bash
ogp federation update-identity <peer-id> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias

**Options:**
- `--for <framework>` - Framework to use (default: current/default)

**Description:**

After updating your identity with `ogp config set-identity`, use this command to send the updated information to existing federated peers. This updates:

- Human name
- Agent name
- Organization
- Display name

The peer must be in `approved` status. New federations automatically include identity during the initial request.

**Examples:**
```bash
# Update identity for a specific peer
ogp federation update-identity apollo

# Update identity for a peer using their full ID
ogp federation update-identity 302a300506032b6570032100...
```

**Note:** Identity updates require v0.5.0 or later on both sides.

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

Generate a short-lived invite code using the optional rendezvous service (v0.2.15+).

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

Accept an invite code from the optional rendezvous service and auto-connect to a peer (v0.2.15+).

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

Connect to a peer by public key via the optional rendezvous discovery service (v0.2.14+).

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

### ogp agent-comms interview

Run the delegated-authority / human-delivery interview.

**Syntax:**
```bash
ogp agent-comms interview [--for <framework>]
```

**Examples:**
```bash
ogp agent-comms interview
ogp --for hermes agent-comms interview
```

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

### ogp agent-comms set-topic

Create or update a topic policy for a peer (upsert). Use this when you want to set a policy whether or not one already exists, rather than using `add-topic` (which errors if the topic already exists).

**Syntax:**
```bash
ogp agent-comms set-topic <peer-id> <topic> <level> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<topic>` - Topic name
- `<level>` - Response level: `full`, `summary`, `escalate`, `deny`, `off`

**Examples:**
```bash
ogp agent-comms set-topic cosmo finance off
ogp agent-comms set-topic cosmo project-updates full
```

### ogp agent-comms set-default

Set the per-peer default response level for unknown topics. This overrides the global default for this specific peer only.

**Syntax:**
```bash
ogp agent-comms set-default <peer-id> <level> [--for <framework>]
```

**Arguments:**
- `<peer-id>` - Peer identifier or alias
- `<level>` - Response level: `full`, `summary`, `escalate`, `deny`, `off`

**Examples:**
```bash
# Trust cosmo — summarize unknown topics by default
ogp agent-comms set-default cosmo summary

# Restrict unknown peer to default-deny
ogp agent-comms set-default stranger off
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
- `--last <n>` - Show last N entries (default: 50)
- `--clear` - Clear the activity log
- `--json` - Machine-readable JSON output
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
# Show recent activity (last 50)
ogp agent-comms activity

# Show last 20 entries
ogp agent-comms activity --last 20

# Filter by peer
ogp agent-comms activity cosmo

# Clear the activity log
ogp agent-comms activity --clear
```

### ogp agent-comms default

Set the **global** default response level for unknown topics (applies to all peers without a specific per-peer default). See also `set-default` for per-peer defaults.

**Syntax:**
```bash
ogp agent-comms default <level> [--for <framework>]
```

**Arguments:**
- `<level>` - Response level: `full`, `summary`, `escalate`, `deny`, `off`

**Examples:**
```bash
# Summarize all unknown topics globally
ogp agent-comms default summary

# Global default-deny (send signed rejection for all unknown topics)
ogp agent-comms default off
```

### ogp agent-comms logging

Enable, disable, or check activity logging status.

**Syntax:**
```bash
ogp agent-comms logging <on|off|status> [--for <framework>]
```

**Syntax:**
```bash
ogp agent-comms logging <on|off> [--for <framework>]
```

**Arguments:**
- `<on|off|status>` - Enable logging, disable it, or show current status

**Examples:**
```bash
ogp agent-comms logging on
ogp agent-comms logging off
ogp agent-comms logging status
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

Add a contribution to a project with identity attribution.

**Syntax:**
```bash
ogp project contribute <id> <type> <summary> [options] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier
- `<type>` - Entry type: `progress`, `decision`, `blocker`, `context`
- `<summary>` - Contribution summary

**Options:**
- `--metadata <json>` - Additional structured data as JSON
- `--local-only` - Skip auto-push to federated project members
- `--durable` - Queue failed peer pushes for retry (bd-8rd.3)
- `--best-effort` - Override `config.federation.durableDelivery` to false
- `--for <framework>` - Framework to use (default: current/default)

**Identity Snapshots (v0.6.0+):

Contributions automatically capture your identity at the time of contribution, including:
- Human name
- Agent name
- Organization
- Tags

This preserves accurate attribution even if you later change your identity settings. Configure your identity with:

```bash
ogp config set-identity --human-name "Your Name" --agent-name "Agent"
```

**Examples:**
```bash
ogp project contribute expense-app progress "Completed authentication system"
ogp project contribute expense-app decision "Using PostgreSQL for persistence"
ogp project contribute expense-app blocker "Waiting for API key approval"
ogp project contribute expense-app context "Target users: small business owners"

# With metadata
ogp project contribute expense-app progress "v1.0 shipped" \
  --metadata '{"version":"1.0.0","users":150}'

# Local only (no federation sync)
ogp project contribute expense-app progress "WIP feature" --local-only

# Durable delivery: retry if a project member is offline
ogp project contribute expense-app progress "Shipped v1.0" --durable

# Best-effort for this contribution even if durable is configured globally
ogp project contribute expense-app progress "WIP feature" --best-effort
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
- `--topic <type>` - Legacy alias for `--type`
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
ogp project delete <id> [--force] [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier

**Options:**
- `--force` - Skip confirmation prompt
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp project delete old-project --force
```

### ogp project remove

Remove a project from your local registry (does not notify peers). Use `delete` to permanently destroy the project and all contributions; use `remove` to just drop it from your local list.

**Syntax:**
```bash
ogp project remove <id> [--for <framework>]
```

**Examples:**
```bash
ogp project remove old-project
```

### ogp project owners

List the owners of a project.

**Syntax:**
```bash
ogp project owners <id> [--for <framework>]
```

**Examples:**
```bash
ogp project owners signal
```

### ogp project add-owner

Grant ownership of a project to another peer. Owners only. Ownership is established by a signed grant that any peer can independently verify.

**Syntax:**
```bash
ogp project add-owner <id> <peer-key> [--for <framework>]
```

**Arguments:**
- `<id>` - Project identifier
- `<peer-key>` - Peer's Ed25519 public key (hex) — get with `ogp federation list --json`

**Examples:**
```bash
ogp project add-owner signal 302a300506032b65...
```

### ogp project claim-ownership

Claim ownership of a pre-existing project that has no explicit ownership records (legacy projects created before v0.9.0). Requires existing membership.

**Syntax:**
```bash
ogp project claim-ownership <id> [--for <framework>]
```

**Examples:**
```bash
ogp project claim-ownership signal
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
- `--script <path>` - Path to a script to run when this intent is received
- `--description <text>` - Intent description
- `--for <framework>` - Framework to use (default: current/default)

**Examples:**
```bash
ogp intent register deployment \
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

## App Management

OGP Apps are declarative bundles (`ogp-app.json`) that describe a piece of software in terms of what OGP intents it uses, what skills it installs, and where its output lives. Apps are published via `advertise` and discovered through federation; each install triggers a consent gate before any scripts run.

### ogp app list

List installed apps on this machine.

```
ogp app list [--json] [--for <framework>]
```

**Options:**
- `--json` — machine-readable JSON output

**Example:**
```bash
ogp app list
ogp app list --json
```

---

### ogp app show

Show the full record for an installed app: manifest, installed skills, project join status, published output link.

```
ogp app show <id> [--json] [--for <framework>]
```

**Arguments:**
- `<id>` — App id (from `ogp app list`)

**Example:**
```bash
ogp app show signal
ogp app show signal --json
```

---

### ogp app install

Install an app from a ref. Validates the manifest, shows a consent gate (unless `--yes`), runs install scripts, and registers the app locally.

```
ogp app install <ref> [-y|--yes] [--for <framework>]
```

**Arguments:**
- `<ref>` — One of:
  - `file:/abs/path` — local directory containing `ogp-app.json` and install scripts
  - `peer:<peerId>/<appId>` — app advertised by an approved peer (fetched, publisher-key verified, then installed). **Note:** peer-sourced installs require peer app discovery to be active; check `ogp app browse` first to confirm availability.

**Options:**
- `-y, --yes` — skip the consent prompt (for automation)

**Examples:**
```bash
# Install from a local directory
ogp app install file:/Users/you/projects/my-app

# Install from an approved peer
ogp app install peer:apollo/signal

# Non-interactive (e.g. in CI)
ogp app install file:/projects/my-app --yes
```

The consent gate shows:
- Which install scripts will run (arbitrary shell — no sandbox)
- Which intents the app will call
- Which projects it wants to use
- Publisher key and trust status

Nothing executes until you type `y`.

---

### ogp app remove

Remove an installed app. Reverses installed skills and drops the registry entry.

```
ogp app remove <id> [--for <framework>]
```

**Arguments:**
- `<id>` — App id

**Example:**
```bash
ogp app remove signal
```

---

### ogp app usage

Show intent call attribution for installed apps. Attribution starts at install time — there is no backfill.

```
ogp app usage [id] [--json] [--for <framework>]
```

**Arguments:**
- `[id]` — Optional. App id to scope to one app; omit for all installed apps.

**How attribution works:** The daemon logs every observed intent call. `ogp app usage` maps intent names back to installed apps via `uses_intents`. If multiple apps claim the same intent, `projectId` in the activity log disambiguates; if it still can't resolve, the call is counted for all claimants and flagged as ambiguous.

**Example:**
```bash
ogp app usage
ogp app usage signal --json
```

---

### ogp app advertise

Advertise an installed app on `/.well-known/ogp` and your rendezvous card. Approved peers can then discover and install it via `ogp app browse` / `ogp app install peer:<you>/<appId>`.

```
ogp app advertise <id> [--for <framework>]
```

**Arguments:**
- `<id>` — App id (must already be installed)

**Example:**
```bash
ogp app advertise signal
```

---

### ogp app unadvertise

Stop advertising an installed app. It remains installed locally but disappears from your well-known response.

```
ogp app unadvertise <id> [--for <framework>]
```

**Example:**
```bash
ogp app unadvertise signal
```

---

### ogp app browse

Browse apps advertised by approved peers. Fetches from each peer's `/.well-known/ogp` (direct) or rendezvous card (fallback), verifies publisher key against the trusted peer record, and lists what's available.

```
ogp app browse [peerId] [--json] [--for <framework>]
```

**Arguments:**
- `[peerId]` — Optional. Browse one specific peer; omit for all approved peers.

**Options:**
- `--json` — machine-readable JSON output

**Examples:**
```bash
# Browse all approved peers
ogp app browse

# Browse a single peer
ogp app browse apollo

# Machine-readable
ogp app browse --json
```

## Tunnel Management

OGP includes built-in tunnel management for Cloudflare and ngrok tunnels. If you already have a publicly accessible URL (cloud server, VPS, named Cloudflare tunnel), set `gatewayUrl` in your config and skip this section.

### ogp tunnel list

List running tunnels and reconcile them against your configured `gatewayUrl`. Shows whether the running tunnel URL matches the configured gateway URL.

**Syntax:**
```bash
ogp tunnel list [--for <framework>]
```

**Aliases:** `ogp tunnel show`

**Examples:**
```bash
ogp tunnel list
ogp --for all tunnel list
```

### ogp tunnel start

Start a quick tunnel (ephemeral — URL changes on restart). Use a named Cloudflare tunnel for production.

**Syntax:**
```bash
ogp tunnel start <method> [--for <framework>]
```

**Arguments:**
- `<method>` — `cloudflared` or `ngrok`

**Examples:**
```bash
ogp tunnel start cloudflared
ogp tunnel start ngrok
ogp --for hermes tunnel start cloudflared
```

After starting, run `ogp tunnel list` to see the assigned URL, then update `gatewayUrl` in your config if needed.

### ogp tunnel stop

Stop the OGP-managed tunnel.

**Syntax:**
```bash
ogp tunnel stop [--for <framework>]
```

**Examples:**
```bash
ogp tunnel stop
ogp --for all tunnel stop
```

---

> **Deprecated:** `ogp expose` and `ogp expose stop` are kept for backward compatibility but map to `ogp tunnel start` and `ogp tunnel stop`. Use the `ogp tunnel` commands going forward.

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

### ogp shutdown

Stop both the OGP daemon and any managed tunnel in one command.

**Syntax:**
```bash
ogp shutdown [--for <framework>]
```

**Examples:**
```bash
ogp shutdown
ogp --for all shutdown
```

## Keychain Management

OGP stores Ed25519 private keys in the system keychain on macOS. On non-macOS, keys are encrypted at rest using `OGP_KEYPAIR_SECRET`.

### ogp keychain status

Show the current state of the keypair in the system keychain.

**Syntax:**
```bash
ogp keychain status [--for <framework>]
```

**Examples:**
```bash
ogp keychain status
```

**Output:**
```
Keychain: ✓ Unlocked
  Service: com.ogp.keypair.openclaw
  Key present: yes
  Public key: 302a300506032b65...
```

### ogp keychain init

Initialize the keychain entry for this gateway. Run if the daemon reports keychain errors on startup.

**Syntax:**
```bash
ogp keychain init [--for <framework>]
```

**Examples:**
```bash
ogp keychain init
```

### ogp keychain unlock

Unlock a locked keychain entry (macOS only). The system may lock the keychain after sleep or a password change.

**Syntax:**
```bash
ogp keychain unlock [--for <framework>]
```

**Examples:**
```bash
ogp keychain unlock
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
