# @dp-pcs/ogp

> Open Gateway Protocol (OGP) - Federation for OpenClaw AI Gateways

[![npm version](https://img.shields.io/npm/v/@dp-pcs/ogp)](https://www.npmjs.com/package/@dp-pcs/ogp)
[![npm downloads](https://img.shields.io/npm/dt/@dp-pcs/ogp)](https://www.npmjs.com/package/@dp-pcs/ogp)
[![license](https://img.shields.io/npm/l/@dp-pcs/ogp)](./LICENSE)

> 🚧 **Active build — releasing daily.** This is moving fast. Check the [changelog](https://github.com/dp-pcs/ogp/releases) or `npm show @dp-pcs/ogp version` for the latest. If something in the docs doesn't match behavior, the code won the argument — file an issue or ping [@lat3ntg3nius](https://x.com/lat3ntg3nius) on X. 📝 Read the articles behind this build at [Trilogy AI Center of Excellence](https://trilogyai.substack.com).

OGP enables peer-to-peer federation between OpenClaw instances, allowing AI agents to communicate and collaborate across different deployments. Think of it as email for AI agents - each OpenClaw instance can securely send and receive messages from other instances without any central authority.

## What This Package Does

This is a companion daemon that adds federation capabilities to any standard OpenClaw installation. It runs alongside your OpenClaw instance on a separate port and handles:

- Cryptographically signed peer-to-peer messaging using Ed25519
- Peer relationship management (request, approve, reject)
- Message verification and relay to your OpenClaw agent
- Public tunnel support (cloudflared/ngrok) for internet accessibility
- Optional macOS LaunchAgent for automatic startup

## Prerequisites

- **Node.js 18 or higher**
- **OpenClaw installed and running** - Get it at [https://openclaw.ai](https://openclaw.ai)
- **OpenClaw API token** - Generated during OpenClaw setup

## Installation

```bash
npm install -g @dp-pcs/ogp
```

Or from GitHub:

```bash
npm install -g github:dp-pcs/ogp
```

After installation, install the OGP skills for Claude Code:

```bash
ogp-install-skills
```

This auto-discovers and installs all OGP skills from the `skills/` directory. The installer now replaces each installed skill directory wholesale on upgrade so stale files from older package versions do not survive.

Verify the installed copies after an upgrade:

```bash
rg -n '^version:' ~/.openclaw/skills/ogp*/SKILL.md ~/.claude/skills/ogp*/SKILL.md 2>/dev/null
```

For the current `0.4.2` release line, the changed skills should report:
- `ogp` `2.6.0`
- `ogp-agent-comms` `0.6.0`
- `ogp-project` `2.2.0`

### Shell Completion and Help

OGP includes intelligent tab completion and context-sensitive help (inspired by Cisco IOS).

**Install tab completion:**

```bash
ogp completion install
```

This installs completion for your shell (bash or zsh). After installation, **open a new terminal window** for the changes to take effect.

**Context-sensitive help:**

Use `help` at any command level to see available options:

```bash
ogp help                         # Top-level commands
ogp config help                  # Config subcommands
ogp config health-check help     # Health-check options
ogp federation help              # Federation commands
```

You can also use `?` (requires quoting in the shell):

```bash
ogp config '?'
ogp federation '?'
```

Both `help` and `?` work identically - use whichever you prefer.

### Multi-Framework Support

OGP supports running alongside multiple AI frameworks (OpenClaw, Hermes, etc.) with isolated configurations. During setup, OGP automatically detects installed frameworks and creates framework-specific configurations:

- **OpenClaw**: `~/.ogp-openclaw/`
- **Hermes**: `~/.ogp-hermes/`
- **Standalone**: `~/.ogp/`

All framework configurations are managed from a central meta-config at `~/.ogp-meta/config.json`.

## Quick Start

### 1. Setup

Run the interactive setup wizard:

```bash
ogp setup
```

The wizard automatically detects installed frameworks and guides you through configuration. You'll be prompted for:
- **Framework Selection** - Which AI frameworks to enable (OpenClaw, Hermes, or standalone)
- **Agent ID** - Which agent owns each gateway (auto-discovers from framework config)
- Daemon port (default: 18790 for OpenClaw, 18793 for Hermes)
- Framework URL and API credentials
- Your public gateway URL (can update later; rendezvous is optional discovery/invite sugar, not a replacement for reachability)
- Rendezvous configuration (optional, v0.2.14+)
- Display name and email

**Working with Multiple Frameworks:**

When multiple frameworks are configured, use the `--for` flag to specify which framework:

```bash
# Use specific framework
ogp --for openclaw federation list
ogp --for hermes federation list

# Run on all frameworks
ogp --for all status

# Set a default framework (no --for needed)
ogp config set-default openclaw
```

If only one framework is configured, it's automatically selected (no `--for` flag needed).

### 2. Start the Daemon

```bash
ogp start
```

Or run in the background:

```bash
ogp start --background
```

**Multi-framework usage:**

```bash
# Start daemon for specific framework
ogp --for openclaw start --background
ogp --for hermes start --background

# Start all framework daemons
ogp --for all start --background
```

### 3. Making Your Gateway Reachable

For OGP federation to work, peers need to be able to reach your gateway over the internet. If you already have a publicly accessible URL (cloud server, VPS, Clawporate gateway), just set it as your `gatewayUrl` in `~/.ogp/config.json` and you're done. Skip to step 4.

If you're a home user behind a router/NAT, you need one of the options below to expose your gateway to the internet.

#### Option 1: Cloudflare Named Tunnel (Recommended — Free)

This is the gold standard for home users. It gives you a permanent, stable URL that never changes and starts automatically on boot once installed as a service.

**Requirements:**
- Free Cloudflare account
- A domain on Cloudflare (can be registered or transferred for free on Cloudflare)

**Setup:**
```bash
# 1. Login to Cloudflare
cloudflared tunnel login

# 2. Create a tunnel named "ogp"
cloudflared tunnel create ogp

# 3. Route your domain to the tunnel (replace yourdomain.com)
cloudflared tunnel route dns ogp ogp.yourdomain.com

# 4. Create config file at ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID_FROM_STEP_2>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ogp.yourdomain.com
    service: http://localhost:18790
  - service: http_status:404
EOF

# 5. Install as a system service
cloudflared service install

# 6. Update your OGP config
ogp stop
# Edit ~/.ogp/config.json and set "gatewayUrl": "https://ogp.yourdomain.com"
ogp start --background
```

Your URL is now `https://ogp.yourdomain.com` and will persist across restarts.

#### Option 2: ngrok (Good — Free tier available)

Good fallback if you don't have a domain on Cloudflare. The free tier gives you a stable subdomain that persists across restarts IF you're logged in with an ngrok account.

**Setup:**
```bash
# 1. Sign up for free at https://ngrok.com and get your auth token

# 2. Authenticate ngrok
ngrok config add-authtoken YOUR_AUTH_TOKEN

# 3. Start the tunnel
ngrok http 18790

# 4. Copy the HTTPS URL (e.g., https://abc123.ngrok-free.app)

# 5. Update your OGP config
ogp stop
# Edit ~/.ogp/config.json and set "gatewayUrl": "https://abc123.ngrok-free.app"
ogp start --background
```

Your ngrok URL will be stable as long as you're authenticated. You can also run `ngrok http 18790 --log stdout > ngrok.log 2>&1 &` to keep it running in the background.

#### Option 3: Cloudflare Anonymous Tunnel (Quick but Ephemeral)

Good for testing only. No account needed, but your URL changes every time you restart the tunnel, so peers need a new URL each time.

```bash
cloudflared tunnel --url http://localhost:18790
```

Copy the displayed URL and update your `gatewayUrl`. **Not recommended for ongoing federation** — use this only for quick tests.

#### Option 4: Port Forwarding

Forward port 18790 on your router to your machine running OGP. Set `gatewayUrl` to `http://YOUR_PUBLIC_IP:18790`.

This works but exposes your home IP address. Most users should prefer the tunnel options above.

### 4. Share Your URL

Share your gateway URL with peers who want to federate with you. They can discover your public key at:

```
https://your-gateway-url.com/.well-known/ogp
```

## All Commands

All commands support the `--for <framework>` flag to specify which framework configuration to use. Use `--for all` to run commands across all configured frameworks.

**Quick Help:** Add `?` to any command for context-sensitive help:

```bash
ogp ?                      # Show all commands
ogp federation ?           # Show federation commands
ogp federation send ?      # Show send usage with examples
```

### Tab Completion

Install shell completion for faster command entry:

```bash
# Bash
ogp completion install bash

# Zsh
ogp completion install zsh
```

After installation, restart your shell or run `source ~/.bashrc` (bash) or `source ~/.zshrc` (zsh).

### Daemon Management

| Command | Description |
|---------|-------------|
| `ogp setup` | Interactive setup wizard (auto-detects frameworks) |
| `ogp start [--for <framework>]` | Start daemon in foreground |
| `ogp start --background [--for <framework>]` | Start daemon as background process |
| `ogp stop [--for <framework>]` | Stop the daemon |
| `ogp status [--for <framework>]` | Show daemon status and configuration |

### Tunnel Management

| Command | Description |
|---------|-------------|
| `ogp expose` | Start a Cloudflare quick tunnel in the foreground; use the `ogp-expose` skill/doc flow for guided setup |
| `ogp expose --background` | Run tunnel as background process |
| `ogp expose --method ngrok` | Use ngrok instead of cloudflared |
| `ogp expose stop` | Stop the tunnel |

### System Integration (macOS)

| Command | Description |
|---------|-------------|
| `ogp install` | Install LaunchAgent for auto-start on login |
| `ogp uninstall` | Remove LaunchAgent |

### Configuration Management

| Command | Description |
|---------|-------------|
| `ogp config list` | List all configured frameworks |
| `ogp config set-default <framework>` | Set default framework (no --for needed) |
| `ogp config enable <framework>` | Enable a framework |
| `ogp config disable <framework>` | Disable a framework |
| `ogp config show [--for <framework>]` | Show current configuration |

### Identity Management

OGP separates human operators from agents for clarity in federated networks. This helps multi-agent scenarios, organizational contexts, and agent-to-agent communication.

| Command | Description |
|---------|-------------|
| `ogp config show-identity` | Show current identity configuration |
| `ogp config set-identity --human-name "Name"` | Set human operator name |
| `ogp config set-identity --agent-name "Name"` | Set agent name |
| `ogp config set-identity --organization "Org"` | Set organization |
| `ogp config set-tags work production` | Set tags (replaces existing) |
| `ogp config add-tag <tag>` | Add a single tag |
| `ogp config remove-tag <tag>` | Remove a single tag |

**Identity fields:**
- **humanName**: Human operator (e.g., "David Proctor", "Stephen")
- **agentName**: Agent name (e.g., "Junior", "Apollo", "TrogdorClaw")
- **organization**: Organization name (optional, e.g., "Trilogy", "AICOE")
- **tags**: Flexible categorization (e.g., "work", "production", "personal", "research")

Tags are used for local categorization and filtering. They help organize peers in multi-context scenarios (work/personal, different clients, etc.).

**Examples:**

```bash
# View current identity
ogp config show-identity

# Set identity during setup (auto-prompted)
ogp setup

# Update identity later
ogp config set-identity --human-name "David Proctor" --agent-name "Junior"
ogp config set-identity --organization "Trilogy"

# Manage tags
ogp config set-tags work production client-trilogy
ogp config add-tag research
ogp config remove-tag personal
```

### Federation Management

| Command | Description |
|---------|-------------|
| `ogp federation list [--for <framework>]` | List all peers |
| `ogp federation list --status pending` | List pending federation requests |
| `ogp federation list --status approved` | List approved peers |
| `ogp federation list --tag <tag>` | Filter peers by tag |
| `ogp federation request <url> [alias]` | Request federation (alias auto-resolves if omitted) |
| `ogp federation approve <peer-id> [options]` | Approve with optional scope grants |
| `ogp federation reject <peer-id>` | Reject a federation request |
| `ogp federation remove <peer-id>` | Remove a peer from federation (asymmetric tear-down) |
| `ogp federation alias <peer-id> <alias>` | Set friendly alias for a peer |
| `ogp federation tag <peer-id> <tags...>` | Add tags to a peer (local categorization) |
| `ogp federation untag <peer-id> <tags...>` | Remove tags from a peer |
| `ogp federation send <peer-id> <intent> <json>` | Send a message to an approved peer |
| `ogp federation scopes <peer-id>` | Show scope grants for a peer |
| `ogp federation grant <peer-id> [options]` | Update scope grants for a peer |
| `ogp federation agent <peer-id> <topic> <message>` | Send agent-comms message |
| `ogp federation ping <peer-url>` | Test connectivity to a peer gateway |
| `ogp federation invite` | Generate a short-lived invite code (v0.2.15+) |
| `ogp federation accept <token>` | Accept an invite and auto-connect (v0.2.15+) |
| `ogp federation connect <pubkey>` | Connect to a peer by public key via rendezvous (v0.2.14+) |

### Scope Options (v0.2.0)

When approving or granting scopes:
- `--intents <list>` - Comma-separated intents (e.g., `message,agent-comms`)
- `--rate <limit>` - Rate limit as requests/seconds (e.g., `100/3600`)
- `--topics <list>` - Topics for agent-comms (e.g., `memory-management,task-delegation`)

### Intent Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp intent register <name> [options]` | Register a custom intent handler |
| `ogp intent list` | List all registered intents |
| `ogp intent remove <name>` | Remove a registered intent |

### Project Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp project create <id> <name> [options]` | Create a new project |
| `ogp project join <id> [name] [options]` | Join an existing project |
| `ogp project list` | List all projects |
| `ogp project contribute <id> <type> <summary>` | Add a contribution by entry type |
| `ogp project query <id> [options]` | Query project contributions |
| `ogp project status <id>` | Show project status |
| `ogp project request-join <peer> <id> <name>` | Request to join peer's project |
| `ogp project send-contribution <peer> <id> <type> <summary>` | Send contribution to peer |
| `ogp project query-peer <peer> <id> [options]` | Query peer's project |
| `ogp project status-peer <peer> <id>` | Get peer's project status |
| `ogp project delete <id> [options]` | Delete a project |

### Agent-Comms Policy Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp agent-comms interview` | Re-run the delegated-authority / human-delivery interview |
| `ogp agent-comms policies [peer-id]` | Show response policies |
| `ogp agent-comms configure [peer-ids] [options]` | Configure response policies |
| `ogp agent-comms add-topic <peer> <topic> [options]` | Add topic policy |
| `ogp agent-comms remove-topic <peer> <topic>` | Remove topic policy |
| `ogp agent-comms reset <peer>` | Reset peer to defaults |
| `ogp agent-comms activity [peer] [options]` | Show activity log |
| `ogp agent-comms default <level>` | Set default response level |
| `ogp agent-comms logging <on\|off>` | Enable/disable logging |

### Federation Examples

```bash
# Request federation (alias auto-resolves from /.well-known/ogp)
ogp federation request https://peer.example.com

# Or specify a custom alias for easier reference
ogp federation request https://peer.example.com --alias apollo

# Multi-framework: Request from specific framework
ogp --for openclaw federation request https://hermes.example.com --alias hermes-gateway

# Check pending requests
ogp federation list --status pending

# Approve a peer (v0.1 mode - no scope restrictions)
ogp federation approve apollo

# Approve with scope grants (v0.2.0+)
ogp federation approve apollo \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation

# View peer scopes
ogp federation scopes apollo

# Update grants for an existing peer
ogp federation grant apollo \
  --intents agent-comms \
  --topics project-planning

# Remove a peer from federation (asymmetric tear-down)
ogp federation remove apollo

# Test connectivity
ogp federation ping https://peer.example.com

# Send a simple message
ogp federation send apollo message '{"text":"Hello!"}'

# Send agent-comms (v0.2.0+)
ogp federation agent apollo memory-management "How do you persist context?"

# Send agent-comms with priority
ogp federation agent apollo task-delegation "Schedule standup" --priority high

# Send agent-comms and wait for reply
ogp federation agent apollo queries "What's the status?" --wait --timeout 60000

# Send a task request
ogp federation send apollo task-request '{
  "taskType": "analysis",
  "description": "Analyze recent logs"
}'

# Send a status update
ogp federation send apollo status-update '{
  "status": "completed",
  "message": "Task finished"
}'
```

### Project Examples (v0.2.0+)

```bash
# Create a project
ogp project create my-app "My Awesome App" \
  --description "Mobile expense tracking application"

# Add contributions by entry type
ogp project contribute my-app progress "Completed authentication system"
ogp project contribute my-app decision "Using PostgreSQL for persistence"
ogp project contribute my-app blocker "Waiting for API key approval"

# Query project
ogp project status my-app
ogp project query my-app --limit 10
ogp project query my-app --type progress

# Collaborate with peers
ogp project send-contribution alice shared-app progress "Deployed staging"
ogp project query-peer alice shared-app --limit 10
ogp project status-peer alice shared-app

# Join peer's project
ogp project request-join alice mobile-app "Mobile App Project"
```

### Custom Intent Examples (v0.2.0+)

```bash
# Register a deployment intent
ogp intent register deployment \
  --description "Deployment notifications"

# List all intents
ogp intent list

# Remove intent
ogp intent remove deployment

# Grant peer access to custom intent
ogp federation approve alice --intents deployment --rate 50/3600
```

### Agent-Comms Policy Examples (v0.2.0+)

```bash
# View current policies
ogp agent-comms policies

# Configure global defaults
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level summary

# Configure specific peer
ogp agent-comms configure stan \
  --topics "memory-management" \
  --level full \
  --notes "Trusted collaborator"

# Add sensitive topic
ogp agent-comms add-topic stan calendar --level escalate

# Multi-peer configuration
ogp agent-comms configure stan,leo,alice \
  --topics "testing,debugging" \
  --level full

# View activity
ogp agent-comms activity
ogp agent-comms activity stan --last 20
```

## How Federation Works

### Single Framework Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon  │◄────────│   Remote    │
│  :18789     │  webhook│  :18790      │  signed │   Peer      │
│             │         │              │  message│  (OGP)      │
└─────────────┘         └──────────────┘         └─────────────┘
```

### Multi-Framework Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon      │◄────────│   Remote    │
│  :18789     │  webhook│  :18790          │  signed │   Peer      │
└─────────────┘         │ (~/.ogp-openclaw)│  message│  (OGP)      │
                        └──────────────────┘         └─────────────┘
                               ▲
┌─────────────┐                │
│   Hermes    │◄────────┌──────────────────┐         ┌─────────────┐
│  :18792     │  webhook│  OGP Daemon      │◄────────│   Remote    │
└─────────────┘         │  :18793          │  signed │   Peer      │
                        │ (~/.ogp-hermes)  │  message│  (OGP)      │
                        └──────────────────┘         └─────────────┘
                               ▲
                               │
                        ┌──────────────────┐
                        │   Meta Config    │
                        │ (~/.ogp-meta/)   │
                        │ - Framework list │
                        │ - Default        │
                        │ - Aliases        │
                        └──────────────────┘
```

### Federation Flow

1. **Discovery**: Peers discover each other via `/.well-known/ogp` endpoint or rendezvous server
2. **Request**: Alice requests federation with Bob's OGP instance
3. **Approval**: Bob approves (or rejects) the federation request
4. **Messaging**: Approved peers can send cryptographically signed messages
5. **Verification**: Recipient OGP daemon verifies signatures using sender's public key
6. **Relay**: Valid messages are forwarded to the local AI agent via webhook

All messages are signed with Ed25519 cryptographic signatures to prevent tampering and impersonation.

## Rendezvous — Optional Discovery And Invite Layer (v0.2.14+)

Rendezvous is an optional convenience layer for pubkey lookup and short invite codes. It is useful when you want easier onboarding for gateways that are already publicly reachable.

### What It Actually Solves

Traditional federation still requires the peer you are trying to reach to be publicly reachable. Rendezvous helps with:
- pubkey discovery
- short invite codes instead of sharing long URLs or raw pubkeys
- reducing manual coordination once each gateway already has a stable public endpoint

Rendezvous does **not** provide NAT traversal, hole punching, or message relay.

### How It Works

1. Your OGP daemon auto-registers with the rendezvous server on startup (`POST /register`) using your public key and connection details
2. A 30-second heartbeat keeps your registration alive (90-second TTL)
3. Peers can look you up by public key (`GET /peer/:pubkey`) and connect directly
4. On shutdown, your daemon auto-deregisters (`DELETE /peer/:pubkey`)

The rendezvous server **never touches message content** — it only stores connection hints. All OGP messages remain end-to-end signed between peers.

### Configuration

Add the `rendezvous` block to `~/.ogp/config.json`:

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

Rendezvous is optional. OGP works without it if peers can share public URLs directly.

**For cloud/ECS gateways behind load balancers**, set the `OGP_PUBLIC_URL` environment variable to override automatic IP detection:

```bash
export OGP_PUBLIC_URL=https://your-gateway.example.com
ogp start
```

Or add `publicUrl` to the rendezvous config:

```json
{
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert",
    "publicUrl": "https://your-gateway.example.com"
  }
}
```

### Federation Invite Flow (v0.2.15+)

The invite flow removes the need to exchange public keys manually. One command generates a short-lived token; your peer uses it to connect instantly.

**Generate an invite:**
```bash
ogp federation invite
```

Output:
```
Your invite code: a3f7k2  (expires in 10 minutes)
Share this with your peer — they run: ogp federation accept a3f7k2
```

**Accept an invite:**
```bash
ogp federation accept a3f7k2
```

Output:
```
Connected to a3f7k2... via rendezvous ✅
```

**How invite codes work:**
- `ogp federation invite` generates a 6-character alphanumeric token stored on the rendezvous server with a 10-minute TTL
- `ogp federation accept <token>` resolves the token to a pubkey + address and auto-connects
- Tokens are non-consuming (multiple peers can accept the same invite within the TTL window)

### Direct Connection by Public Key (v0.2.14+)

Connect to any peer registered on rendezvous by their public key:

```bash
ogp federation connect <pubkey>
```

This looks up the peer on the rendezvous server and establishes federation directly. The peer still needs a reachable gateway endpoint behind that lookup.

### Privacy & Self-Hosting

**Privacy:**
- Rendezvous stores only: public key, IP address, port, and last-seen timestamp
- No message content passes through rendezvous
- Registrations expire after 90 seconds without heartbeat
- Open source and self-hostable

**Public instance:** `https://rendezvous.elelem.expert`

**Self-host:**
```bash
cd packages/rendezvous
npm install
npm run build
PORT=3000 node dist/index.js
```

Update your `rendezvous.url` config to point to your instance.

### Message Format

```json
{
  "message": {
    "intent": "message",
    "from": "peer-alice",
    "to": "peer-bob",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-19T10:30:00Z",
    "payload": {
      "text": "Hello, Bob!"
    }
  },
  "signature": "a1b2c3d4..."
}
```

### Default Intents

- **message**: Simple text message
- **task-request**: Request peer to perform a task
- **status-update**: Status update from a peer
- **agent-comms**: Agent-to-agent communication with topic routing (v0.2.0+)
- **project**: Collaborative project management with contributions (v0.2.0+)

Custom intents can be registered with `ogp intent register` (v0.2.0+).

## Key Features (v0.2.17)

### 1. Scope Negotiation (v0.2.0+)

Three-layer scope model based on BGP-style per-peer policies:

```
Layer 1: Gateway Capabilities  → What I CAN support (advertised globally)
Layer 2: Peer Negotiation      → What I WILL grant YOU (per-peer, during approval)
Layer 3: Runtime Enforcement   → Is THIS request within YOUR granted scope (doorman)
```

**How It Works:**
1. **Discovery**: Peers discover capabilities via `/.well-known/ogp`
2. **Request**: Peer A requests federation (peer-id auto-resolves)
3. **Grant**: Peer B approves with specific scope grants (intents, rate limits, topics)
4. **Enforcement**: Doorman validates every incoming message against granted scopes

**Example:**
```bash
# Approve with granular access control
ogp federation approve stan \
  --intents agent-comms \
  --topics memory-management \
  --rate 10/60

# Stan can send: ✓
ogp federation agent david memory-management "How do you persist context?"

# Stan cannot send: ✗ 403 Topic not allowed
ogp federation agent david personal-finances "What's your budget?"
```

### 2. Agent-to-Agent Communication (v0.2.0+)

Rich agent collaboration with topic routing, priority levels, and response policies.

**Topics**: Categorize messages (e.g., `memory-management`, `task-delegation`, `planning`)
**Priority**: Low, normal, high
**Policies**: Control responses (full, summary, escalate, deny)
**Threading**: Multi-turn conversations with `conversationId`
**Replies**: Async callbacks or polling

**Example:**
```bash
# Send with priority and wait for reply
ogp federation agent stan memory-management \
  "How do you persist context?" \
  --priority high \
  --wait \
  --timeout 60000
```

### 3. Project Intent System (v0.2.0+)

Projects are optional collaboration boundaries layered on top of federation. They let each person keep their own tools while their agents log high-level project context and query collaborators through OGP when needed.

**Features:**
- Create projects with contextual setup (repo, workspace, notes, collaborators)
- Log high-level contributions by entry type (progress, decision, blocker, context)
- Query local and peer contributions for project-aware coordination
- Use project IDs as agent-comms topics for collaborator questions and summaries
- **Auto-registration (v0.2.9+)**: Project IDs auto-register as agent-comms topics for approved peers who are explicit project members

**Example:**
```bash
# Create project (auto-registers as agent-comms topic for approved project members)
ogp project create my-app "My App" --description "Expense tracker"

# Log work by entry type
ogp project contribute my-app progress "Completed authentication"
ogp project contribute my-app decision "Using PostgreSQL"

# Ask a collaborator or query peer project state
ogp federation agent alice my-app "My user is about to work on auth. Anything already decided?"
ogp project query-peer alice shared-app --limit 10
```

### 4. Custom Intent Registry (v0.2.0+)

Register custom intent handlers for specialized workflows.

**Example:**
```bash
# Register deployment intent
ogp intent register deployment \
  --session-key "agent:main:main" \
  --description "Deployment notifications"

# Grant to peer
ogp federation approve alice --intents deployment --rate 50/3600
```

### 5. Auto Peer-Alias Resolution (v0.2.3+)

Peer aliases automatically resolve from `/.well-known/ogp` - no need to specify manually.

**Example:**
```bash
# Specify a friendly alias when connecting (recommended)
ogp federation request https://peer.example.com --alias alice

# New way (auto-resolves from gateway display name)
ogp federation request https://peer.example.com
```

### 6. OpenClaw Human Delivery (v0.2.3+, refined in v0.4.2+)

For OpenClaw-backed agents, OGP now prefers `POST /hooks/agent` for inbound federated work that should be interpreted and surfaced by the local agent. This lets OpenClaw run a real agent turn, apply the configured human-delivery policy, and deliver through the correct channel surface (Telegram, iMessage, etc.).

When OGP needs direct session injection, it uses Gateway RPC with the correct secure WebSocket transport (`wss://`) when the OpenClaw gateway is TLS-enabled.

### 6.1 Delegated-Authority Precedence (v0.4.2)

Policy evaluation now follows a fixed order so more specific rules cannot be silently overwritten. The runtime in `src/daemon/notify.ts` applies:
1. Legacy `inboundFederationPolicy` mode as a safety fallback
2. Global default rule from the delegated-authority config
3. Peer-specific default rule (per-peer overrides)
4. Global message-class rule (e.g., `agent-work`, `human-relay`, `approval-request`, `status-update`)
5. Peer message-class override for that same class
6. Global topic-level rule
7. Peer topic-level override

Approval requests receive immediate `approval-required` handling and `human-relay` obligations are treated according to their relay mode (deliver, summarize, or approval) before human delivery is asserted. This ordering guarantees peer defaults cannot erase more specific class/topic safeguards, so `human-relay` stays strict even when a trusted peer asks for more autonomy and topic overrides continue to behave predictably.

OGP now tries to pin `/hooks/agent` to the actual human session key when the local OpenClaw `hooks.allowRequestSessionKey` setting allows it (see `~/.openclaw/openclaw.json`). If the value is `false` or the requested key does not match the allowed prefixes, the hook still runs but falls back to the default hook session, so downstream heuristics must still parse peer identity from the injected payload. Native sender identity parity in Telegram therefore remains a known limitation for `v0.4.2`; the runtime will log a warning whenever it cannot request a session override so that the human knows the limitation is intentional.

### 7. Enhanced Daemon Status (v0.2.3+)

`ogp status` detects externally-started daemons via port probe fallback.

### 8. Default-Deny Agent-Comms (v0.2.9+)

Set `off` as the default response level to implement a default-deny security posture. When topics hit `off`, the daemon sends a cryptographically signed rejection response instead of silently dropping:

```bash
# Enable default-deny
ogp agent-comms default off

# Explicitly allow specific topics
ogp agent-comms configure --global --topics "general,project-updates" --level summary
```

### 9. Project Topic Auto-Registration (v0.2.9+)

When you create a project, its ID is automatically registered as an agent-comms topic at `summary` level for approved peers who are explicit project members. When you approve a new peer, existing local projects are auto-registered only if that peer is already in the project's member list.

```bash
# Creates project AND registers as topic for approved project members
ogp project create my-app "My Application"

# Approving a peer also registers existing projects as topics
ogp federation approve alice --intents agent-comms
```

### Backward Compatibility

- v0.1 peers work without scope negotiation (default rate limits apply)
- v0.2+ gateways automatically detect protocol version
- **petname → alias migration**: The deprecated `--petname` flag automatically maps to `--alias` with a deprecation warning. Existing peer data with `petname` fields is auto-migrated to `alias` on load.
- No breaking changes - existing federations continue working

## Peer Aliases vs Public Key IDs

OGP uses two different identifiers for peers:

| Identifier | Purpose | Example |
|------------|---------|---------|
| **Public Key ID** | Cryptographic identity used in messages | `abc123...def456` (Ed25519 public key) |
| **Alias** | User-friendly name for CLI convenience | `alice`, `big-papa`, `staging-server` |

### How Aliases Work

- When you request federation, you can optionally specify an alias: `ogp federation request <url> --alias alice`
- If omitted, OGP auto-resolves an alias from the peer's `displayName` in `/.well-known/ogp`
- The alias is stored locally in `~/.ogp/peers.json` alongside the peer's public key
- You reference peers by alias in all CLI commands (`ogp federation send alice message ...`)

### Setting or Changing an Alias

```bash
# Set alias when requesting federation
ogp federation request https://peer.example.com --alias big-papa

# Set alias when connecting by public key (rendezvous)
ogp federation connect <pubkey> --alias big-papa

# Set alias when accepting an invite
ogp federation accept <token> --alias big-papa

# Change alias for existing peer
ogp federation alias <peer-id> <new-alias>
```

### Legacy petname Support

The `--petname` flag is deprecated but still works for backward compatibility:

```bash
# This will work but show a deprecation warning
ogp federation request https://peer.example.com --petname big-papa
# ⚠️  --petname is deprecated. Use --alias instead.
```

Data migration happens automatically:
- On daemon startup, any peer with a `petname` field gets migrated to `alias`
- The deprecated `petname` field is removed from storage after migration

## Agent-Comms Response Policies

Control how your agent responds to incoming agent-comms messages with per-peer policies.

### Response Levels

| Level | Behavior |
|-------|----------|
| `full` | Respond openly, share details |
| `summary` | High-level responses only |
| `escalate` | Ask human before responding |
| `deny` | Politely decline to discuss |
| `off` | Default-deny: send signed rejection, do not process |

The `off` level enables a default-deny security posture. When a topic hits `off` (explicitly or via default), the daemon sends a signed rejection response with `{ status: "rejected", reason: "topic-not-permitted", topic: "<topic>" }` rather than silently dropping the message.

### Policy Commands

```bash
# View all policies
ogp agent-comms policies

# Re-run the delegated-authority / human-delivery interview
ogp agent-comms interview

# View policies for a specific peer
ogp agent-comms policies stan

# Configure global defaults
ogp agent-comms configure --global --topics "general,testing" --level summary

# Configure specific peer(s)
ogp agent-comms configure stan --topics "memory-management" --level full --notes "Trusted"
ogp agent-comms configure stan,leo,alice --topics "testing" --level full  # Multi-select

# Add/remove topics
ogp agent-comms add-topic stan calendar --level escalate
ogp agent-comms remove-topic stan personal

# Reset peer to global defaults
ogp agent-comms reset stan

# View activity log
ogp agent-comms activity
ogp agent-comms activity --last 20
ogp agent-comms activity stan  # Filter by peer

# Settings
ogp agent-comms default summary    # Set default level
ogp agent-comms logging on         # Enable/disable logging
```

### Policy Inheritance

1. **Peer-specific** policies override global policies
2. **Global** policies apply to all peers without specific config
3. **Default level** applies to unknown topics

When an agent-comms message arrives, your agent receives the policy level in metadata:
```
[OGP Agent-Comms] Stanislav → memory-management [FULL]: How do you persist context?
```

Your agent can then respond according to the policy level.

## Configuration

Configuration is stored in `~/.ogp/config.json`:

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-openclaw-api-token",
  "gatewayUrl": "https://your-public-url.com",
  "displayName": "Your Name",
  "email": "you@example.com",
  "stateDir": "~/.ogp",
  "agentId": "main",
  "humanDeliveryTarget": "telegram:123456789",
  "inboundFederationPolicy": {
    "mode": "summarize"
  },
  "notifyTarget": "telegram:123456789",
  "notifyTargets": {
    "main": "telegram:123456789",
    "scribe": "telegram:987654321"
  },
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert",
    "publicUrl": "https://your-gateway.example.com"
  }
}
```

### Agent ID (v0.2.28+)

The `agentId` field identifies which OpenClaw agent owns this OGP gateway. This is important for:

- **Federation ownership**: Messages sent from this gateway are attributed to the specified agent
- **Routing context**: Incoming federation requests include the agent ID for proper routing
- **Multi-agent setups**: When running multiple agents (main, scribe, optimus, etc.), each can have its own OGP configuration

When you run `ogp setup`, the wizard auto-discovers agents from your OpenClaw configuration and presents a list to choose from:

```
Available agents:
  1. 🦝 Junior (main)
  2. ✍️ Scribe (scribe)
  3. ⚡ Optimus (optimus)

Which agent owns this gateway? (number or ID) [1]:
```

You can also specify a custom agent ID if needed.
```

### Human Delivery Preferences (v0.4.2+)

OGP has two separate questions to answer for inbound federation traffic:

1. **Where should human-facing followups go?**
2. **How should the agent behave when a peer asks it to do something?**

Those should not be inferred from the currently active conversation.

**Configuration fields:**
- **`humanDeliveryTarget`**: Explicit human-facing destination for OGP-triggered followups. Examples: `telegram:123456789` or a raw session key like `agent:main:telegram:direct:123456789`.
- **`inboundFederationPolicy.mode`**: Default behavior for how the local agent should handle inbound federated requests.

For OpenClaw specifically, this configuration feeds the `/hooks/agent` delivery path. In other words:
- `humanDeliveryTarget` tells OGP where human-facing followups should go
- `inboundFederationPolicy.mode` tells the local agent how to treat federated requests once they arrive
- OGP should not infer either of those from "whatever session is active right now"

**Supported behavior modes:**
- **`forward`**: Tell me everything. Forward inbound federated items to my configured channel.
- **`summarize`**: Summarize and surface only important, actionable, or uncertain items.
- **`autonomous`**: Act autonomously when possible, but surface blockers, approvals, or explicit relay requests.
- **`approval-required`**: Do not act on or reply to federated requests until I explicitly approve.

**Example configuration:**

```json
{
  "agentId": "main",
  "humanDeliveryTarget": "telegram:123456789",
  "inboundFederationPolicy": {
    "mode": "autonomous"
  }
}
```

When you run `ogp setup`, the wizard asks for both:
- the primary human delivery target for OGP followups
- the default inbound federation handling mode

If the user wants to revisit just this part later, use:

```bash
ogp --for openclaw agent-comms interview
ogp --for hermes agent-comms interview
```

That command re-runs the delegated-authority / human-delivery interview for the active framework without repeating the rest of first-time setup.

### Notification Routing (v0.2.28+)

The `notifyTargets` field enables per-agent notification routing. When OGP sends notifications to your OpenClaw instance, it routes to specific agents based on the message context.

**Configuration fields:**
- **`notifyTarget`** (legacy, string): Single notification target for all messages. Maintained for backward compatibility.
- **`notifyTargets`** (object): Map of agent names to notification targets. Example: `{"main": "telegram:...", "scribe": "telegram:..."}`
- **`humanDeliveryTarget`** (preferred for human-facing followups): Explicit destination for OGP-triggered notifications and relay obligations.

**Example configuration with multiple agents:**

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "gatewayUrl": "https://your-gateway.example.com",
  "displayName": "Alice",
  "email": "alice@example.com",
  "stateDir": "~/.ogp",
  "notifyTarget": "telegram:123456789",
  "humanDeliveryTarget": "telegram:123456789",
  "inboundFederationPolicy": {
    "mode": "summarize"
  },
  "notifyTargets": {
    "main": "telegram:123456789",
    "scribe": "telegram:987654321",
    "optimus": "telegram:555666777"
  },
  "agentId": "main"
}
```

**Resolution priority:**

When routing notifications, OGP resolves the target in this order:

1. **`humanDeliveryTarget`** — If set, use it as the explicit human-facing OGP destination
2. **`notifyTargets[agent]`** — If the agent is specified and exists in `notifyTargets`, use that target
3. **`notifyTarget`** — Fall back to the legacy single target for backward compatibility
4. **Default** — If none are set, OGP falls back to the agent's default session

This allows you to:
- Route federation messages to different agents based on context
- Explicitly separate "the agent that owns this gateway" from "the human-facing channel for OGP followups"
- Maintain backward compatibility with existing single-agent setups
- Gradually migrate to multi-agent routing without breaking existing configurations

### OpenClaw Transport Notes

If you are debugging OpenClaw integration directly:

- **Hooks path**: `https://localhost:18789/hooks/agent` is the preferred local delivery path for human-facing federated work.
- **Gateway RPC path**: when using `openclaw gateway call` against a TLS-enabled local gateway, use `wss://localhost:18789`, not `ws://localhost:18789`.
- A plain session injection succeeding does not necessarily mean the agent has interpreted the task the way you want; `/hooks/agent` is the path designed for that agentic behavior.

### Environment Variables

- `OGP_PUBLIC_URL` (v0.2.17+): Override automatic IP detection for rendezvous registration. Use this for cloud/ECS gateways behind load balancers where the detected IP differs from the public endpoint.

  ```bash
  export OGP_PUBLIC_URL=https://your-gateway.example.com
  ogp start
  ```

  Takes precedence over `rendezvous.publicUrl` in config.json.

### State Files

- `~/.ogp/keypair.json` - Public key cache plus key material metadata. On macOS the private key lives in an instance-specific Keychain entry; on non-macOS OGP encrypts the private key at rest when `OGP_KEYPAIR_SECRET`, `openclawToken`, or `hermesWebhookSecret` is available.
- `~/.ogp/peers.json` - Federated peer list with scope grants
- `~/.ogp/intents.json` - Intent registry (built-in + custom)
- `~/.ogp/projects.json` - Project contexts and contributions
- `~/.ogp/agent-comms-config.json` - Response policies and activity log

On macOS, deleting `keypair.json` by itself does **not** rotate the gateway identity if the matching private key is still present in Keychain. Use `ogp setup --reset-keypair` when you intentionally want a new identity.

On non-macOS, OGP prefers this secret source order for encrypting the private key at rest:
- `OGP_KEYPAIR_SECRET`
- `hermesWebhookSecret`
- `openclawToken`

If no encryption secret is available, OGP falls back to legacy plaintext key storage and logs a warning. Set one of the secrets above, then run `ogp setup --reset-keypair` to harden the instance.

## Skills (Claude Code)

OGP includes skills for Claude Code agents. Install them with:

```bash
ogp-install-skills
```

After upgrading, verify the installed skill headers:

```bash
rg -n '^version:' ~/.openclaw/skills/ogp*/SKILL.md ~/.claude/skills/ogp*/SKILL.md 2>/dev/null
```

Expected changed skill versions for the `0.4.2` release line:
- `ogp` `2.6.0`
- `ogp-agent-comms` `0.6.0`
- `ogp-project` `2.2.0`

### Available Skills

| Skill | Purpose |
|-------|---------|
| **ogp** | Core protocol: federation setup, peer management, sending messages |
| **ogp-expose** | Tunnel setup: cloudflared/ngrok configuration |
| **ogp-agent-comms** | Interactive wizard: configure response policies plus delegated-authority / human-delivery interview |
| **ogp-project** | Agent-aware project context: interviews, logging, and project-aware peer coordination |

Skills auto-install from the `skills/` directory. The `ogp-agent-comms` skill now uses `ogp agent-comms interview` as the canonical conversational path for delegated-authority / human-delivery configuration, plus the existing per-peer policy commands. The `ogp-project` skill enables conversational project management with context interviews, high-level project logging, and project-aware peer coordination.

## Documentation

### Getting Started
- [Getting Started Guide](./docs/GETTING-STARTED.md) - Comprehensive setup guide for single and multi-framework setups
- [Quick Start Guide](./docs/quickstart.md) - Fast-track setup for single framework
- [CLI Reference](./docs/CLI-REFERENCE.md) - Complete command reference with examples
- [Migration Guide](./docs/MIGRATION.md) - Upgrading from single to multi-framework setup

### Core Features
- [Federation Flow](./docs/federation-flow.md) - How federation works internally
- [Scope Negotiation](./docs/scopes.md) - Per-peer scope configuration (v0.2.0)
- [Agent Communications](./docs/agent-comms.md) - Agent-to-agent messaging (v0.2.0)
- [Rendezvous & Invite Flow](./docs/rendezvous.md) - Optional discovery and invite service (v0.2.14+)

### Advanced
- [Multi-Framework Design](./docs/MULTI-FRAMEWORK-DESIGN.md) - Design principles for multi-framework support
- [Multi-Framework Implementation](./docs/MULTI-FRAMEWORK-IMPL.md) - Implementation details
- [Protocol Specification](https://github.com/dp-pcs/openclaw-federation) - Full OGP protocol spec

## Security

- **Ed25519 signatures**: All messages are cryptographically signed
- **Peer approval required**: Only approved peers can send messages
- **Signature verification**: Invalid signatures are rejected
- **HTTPS tunnels**: Encrypted transport via cloudflared/ngrok
- **Nonce tracking**: Prevents replay attacks

**Best practices:**
- Treat `~/.ogp/keypair.json` as identity material even when it contains only the public key cache on macOS.
- On macOS, remember the private key source of truth is the instance-specific Keychain entry, not `keypair.json`; use `ogp setup --reset-keypair` for intentional rotation.
- On non-macOS, provide `OGP_KEYPAIR_SECRET` or a platform secret so OGP can encrypt the private key at rest; `chmod 600` remains enforced but is not sufficient by itself.
- Verify peer identity out-of-band before approving federation requests
- Always use HTTPS tunnels (never expose raw HTTP)
- Monitor OpenClaw logs for suspicious peer activity

## Development

### Build from Source

```bash
git clone https://github.com/dp-pcs/ogp.git
cd ogp
npm install
npm run build
npm link
```

### Project Structure

```
src/
  cli.ts              # Main CLI entrypoint
  daemon/
    server.ts         # HTTP server and endpoints
    keypair.ts        # Ed25519 keypair management
    peers.ts          # Peer storage and management
    scopes.ts         # Scope types and utilities (v0.2.0+)
    doorman.ts        # Scope enforcement + rate limiting (v0.2.0+)
    reply-handler.ts  # Async reply mechanism (v0.2.0+)
    agent-comms.ts    # Agent-comms policy resolution (v0.2.0+)
    projects.ts       # Project storage and management (v0.2.0+)
    intent-registry.ts # Intent definitions and custom registry
    message-handler.ts # Message verification and routing
    notify.ts         # OpenClaw/Hermes delivery backends
  cli/
    setup.ts          # Setup wizard
    federation.ts     # Federation commands (scopes, agent-comms)
    project.ts        # Project management commands (v0.2.0+)
    expose.ts         # Tunnel management
    install.ts        # LaunchAgent installation
  shared/
    signing.ts        # Ed25519 sign/verify utilities
    config.ts         # Configuration management
skills/
  ogp/              # Core OGP skill
  ogp-expose/       # Tunnel configuration skill
  ogp-agent-comms/  # Response policy wizard
  ogp-project/      # Project context management skill
```

## Known Issues

### OpenClaw Delivery Model

**Current implementation:**
- **Primary:** `POST /hooks/agent` for inbound federated requests that should be processed by the local OpenClaw agent
- **Fallback / sync:** `openclaw gateway call ... sessions.send` over `wss://` when direct session injection is needed

Why this split exists:
- `/hooks/agent` is the right primitive for "an external federated task arrived; let the agent interpret it, act on it, and deliver the result through the configured human channel."
- `sessions.send` is still useful for direct session injection and compact synchronization notes, but it is not the primary delivery mechanism for human-facing federated work.

Important nuance:
- OpenClaw may still render direct session injections with sender metadata like `cli`, so OGP continues to include peer identity in message content where needed.
- Hook-run awareness and human-DM continuity are related but not identical. OGP can mirror a compact sync note into the DM session, but the important success criterion is correct delivery and behavior, not whether raw internal transport artifacts are visible in the user-facing transcript.

## License

MIT

## macOS Menu Bar App

A lightweight native macOS app for monitoring OGP status at a glance:

- **Status Indicator**: Color-coded dot in menu bar (🟢/🟡/🔴)
- **Quick View**: Daemon, tunnel, and peer status
- **Quick Actions**: Start/stop services with one click
- **Peer List**: See federated peers, intents, and last activity

See [macos-menubar-app/QUICKSTART.md](./macos-menubar-app/QUICKSTART.md) for setup instructions.

## Links

- **GitHub Repository**: https://github.com/dp-pcs/ogp
- **Issues**: https://github.com/dp-pcs/ogp/issues
- **OGP Protocol Spec**: https://github.com/dp-pcs/openclaw-federation
- **OpenClaw**: https://openclaw.ai
