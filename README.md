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

This auto-discovers and installs all OGP skills from the `skills/` directory.

## Quick Start

### 1. Setup

Run the interactive setup wizard:

```bash
ogp setup
```

You'll be prompted for:
- **Agent ID** - Which OpenClaw agent owns this gateway (auto-discovers available agents from your OpenClaw config)
- Daemon port (default: 18790)
- OpenClaw URL (default: http://localhost:18789)
- OpenClaw API token
- Your public gateway URL (can update later, or use rendezvous)
- Rendezvous configuration (optional, v0.2.14+)
- Display name and email

### 2. Start the Daemon

```bash
ogp start
```

Or run in the background:

```bash
ogp start --background
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

### Daemon Management

| Command | Description |
|---------|-------------|
| `ogp setup` | Interactive setup wizard |
| `ogp start` | Start daemon in foreground |
| `ogp start --background` | Start daemon as background process |
| `ogp stop` | Stop the daemon |
| `ogp status` | Show daemon status and configuration |

### Tunnel Management

| Command | Description |
|---------|-------------|
| `ogp expose` | Launch guided tunnel setup wizard (coming soon) or start cloudflared tunnel in foreground |
| `ogp expose --background` | Run tunnel as background process |
| `ogp expose --method ngrok` | Use ngrok instead of cloudflared |
| `ogp expose stop` | Stop the tunnel |

### System Integration (macOS)

| Command | Description |
|---------|-------------|
| `ogp install` | Install LaunchAgent for auto-start on login |
| `ogp uninstall` | Remove LaunchAgent |

### Federation Management

| Command | Description |
|---------|-------------|
| `ogp federation list` | List all peers |
| `ogp federation list --status pending` | List pending federation requests |
| `ogp federation list --status approved` | List approved peers |
| `ogp federation request <url> [alias]` | Request federation (alias auto-resolves if omitted) |
| `ogp federation approve <peer-id> [options]` | Approve with optional scope grants |
| `ogp federation reject <peer-id>` | Reject a federation request |
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
ogp federation request https://peer.example.com --alias big-papa

# Check pending requests
ogp federation list --status pending

# Approve a peer (v0.1 mode - no scope restrictions)
ogp federation approve alice

# Approve with scope grants (v0.2.0+)
ogp federation approve alice \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation

# View peer scopes
ogp federation scopes alice

# Update grants for an existing peer
ogp federation grant alice \
  --intents agent-comms \
  --topics project-planning

# Test connectivity
ogp federation ping https://peer.example.com

# Send a simple message
ogp federation send alice message '{"text":"Hello!"}'

# Send agent-comms (v0.2.0+)
ogp federation agent alice memory-management "How do you persist context?"

# Send agent-comms with priority
ogp federation agent alice task-delegation "Schedule standup" --priority high

# Send agent-comms and wait for reply
ogp federation agent alice queries "What's the status?" --wait --timeout 60000

# Send a task request
ogp federation send alice task-request '{
  "taskType": "analysis",
  "description": "Analyze recent logs"
}'

# Send a status update
ogp federation send alice status-update '{
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
ogp project send-contribution peer-alice shared-app progress "Deployed staging"
ogp project query-peer peer-alice shared-app --limit 10
ogp project status-peer peer-alice shared-app

# Join peer's project
ogp project request-join peer-alice mobile-app "Mobile App Project"
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

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon  │◄────────│   Remote    │
│  :18789     │  webhook│  :18790      │  signed │   Peer      │
│             │         │              │  message│  (OGP)      │
└─────────────┘         └──────────────┘         └─────────────┘
```

1. **Discovery**: Peers discover each other via `/.well-known/ogp` endpoint or rendezvous server
2. **Request**: Alice requests federation with Bob's OGP instance
3. **Approval**: Bob approves (or rejects) the federation request
4. **Messaging**: Approved peers can send cryptographically signed messages
5. **Verification**: Recipient OGP daemon verifies signatures using sender's public key
6. **Relay**: Valid messages are forwarded to the local OpenClaw agent via webhook

All messages are signed with Ed25519 cryptographic signatures to prevent tampering and impersonation.

## Rendezvous — Zero-Config Peer Discovery (v0.2.14+)

OGP's rendezvous service eliminates the need for manual URL exchange and tunnel configuration. Gateways auto-register by public key, enabling peers to discover and connect to each other with a single command.

### The Problem It Solves

Traditional federation requires both peers to be publicly reachable and manually exchange gateway URLs. With rendezvous:
- No tunnel setup required (ngrok, Cloudflare Tunnel, port forwarding)
- No manual URL sharing
- No URL rotation issues (free ngrok tiers)
- Automatic peer discovery by public key

### How It Works

1. Your OGP daemon auto-registers with the rendezvous server on startup (`POST /register`) using your public key and connection details
2. A 30-second heartbeat keeps your registration alive (90-second TTL)
3. Peers can look you up by public key (`GET /peer/:pubkey`) and connect directly
4. On shutdown, your daemon auto-deregisters (`DELETE /peer/:pubkey`)

The rendezvous server **never touches message content** — it only stores connection hints (IP + port). All OGP messages remain end-to-end signed between peers.

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

The setup wizard (`ogp setup`) prompts for rendezvous configuration.

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

The invite flow removes the need to exchange public keys. One command generates a short-lived token; your peer uses it to connect instantly.

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

This looks up the peer on the rendezvous server and establishes federation directly.

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

Collaborative project management across federated peers with activity logging and cross-peer queries.

**Features:**
- Create projects with contextual setup (repo, workspace, notes, collaborators)
- Log contributions by entry type (progress, decision, blocker, context)
- Query local and peer contributions for unified team view
- Agent-aware: proactive logging and context loading
- **Auto-registration (v0.2.9+)**: Project IDs auto-register as agent-comms topics for all approved peers

**Example:**
```bash
# Create project (auto-registers as agent-comms topic for all peers)
ogp project create my-app "My App" --description "Expense tracker"

# Log work by entry type
ogp project contribute my-app progress "Completed authentication"
ogp project contribute my-app decision "Using PostgreSQL"

# Query peer's project
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

### 5. Auto Peer-ID Resolution (v0.2.3+)

Peer IDs automatically resolve from `/.well-known/ogp` - no need to specify manually.

**Example:**
```bash
# Old way (still works)
ogp federation request https://peer.example.com peer-alice

# New way (auto-resolves)
ogp federation request https://peer.example.com
```

### 6. Telegram Integration (v0.2.3+)

Federation requests fire OpenClaw notifications via sessions_send, delivering directly to Telegram.

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

When you create a project, its ID is automatically registered as an agent-comms topic for all approved peers at `summary` level. When you approve a new peer, all existing local projects are auto-registered as topics for that peer.

```bash
# Creates project AND registers as topic for all peers
ogp project create my-app "My Application"

# Approving a peer also registers existing projects as topics
ogp federation approve peer-alice --intents agent-comms
```

### Backward Compatibility

- v0.1 peers work without scope negotiation (default rate limits apply)
- v0.2+ gateways automatically detect protocol version
- No breaking changes - existing federations continue working

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

### Notification Routing (v0.2.28+)

The `notifyTargets` field enables per-agent notification routing. When OGP sends notifications to your OpenClaw instance, it routes to specific agents based on the message context.

**Configuration fields:**
- **`notifyTarget`** (legacy, string): Single notification target for all messages. Maintained for backward compatibility.
- **`notifyTargets`** (object): Map of agent names to notification targets. Example: `{"main": "telegram:...", "scribe": "telegram:..."}`

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

1. **`notifyTargets[agent]`** — If the agent is specified and exists in `notifyTargets`, use that target
2. **`notifyTarget`** — Fall back to the legacy single target for backward compatibility
3. **Default** — If neither is set, the notification is sent without a specific target (OpenClaw routes to the default channel)

This allows you to:
- Route federation messages to different agents based on context
- Maintain backward compatibility with existing single-agent setups
- Gradually migrate to multi-agent routing without breaking existing configurations

### Environment Variables

- `OGP_PUBLIC_URL` (v0.2.17+): Override automatic IP detection for rendezvous registration. Use this for cloud/ECS gateways behind load balancers where the detected IP differs from the public endpoint.

  ```bash
  export OGP_PUBLIC_URL=https://your-gateway.example.com
  ogp start
  ```

  Takes precedence over `rendezvous.publicUrl` in config.json.

### State Files

- `~/.ogp/keypair.json` - Ed25519 keypair (keep secure! migrated to macOS Keychain on v0.2.13+)
- `~/.ogp/peers.json` - Federated peer list with scope grants
- `~/.ogp/intents.json` - Intent registry (built-in + custom)
- `~/.ogp/projects.json` - Project contexts and contributions
- `~/.ogp/agent-comms-config.json` - Response policies and activity log

## Skills (Claude Code)

OGP includes skills for Claude Code agents. Install them with:

```bash
ogp-install-skills
```

### Available Skills

| Skill | Purpose |
|-------|---------|
| **ogp** | Core protocol: federation setup, peer management, sending messages |
| **ogp-expose** | Tunnel setup: cloudflared/ngrok configuration |
| **ogp-agent-comms** | Interactive wizard: configure response policies per-peer |
| **ogp-project** | Agent-aware project context: interviews, logging, cross-peer summarization |

Skills auto-install from the `skills/` directory. The `ogp-agent-comms` skill provides an interactive wizard for multi-peer policy configuration. The `ogp-project` skill enables conversational project management with context interviews and proactive logging.

## Documentation

- [Quick Start Guide](./docs/quickstart.md) - Detailed step-by-step setup
- [Federation Flow](./docs/federation-flow.md) - How federation works internally
- [Scope Negotiation](./docs/scopes.md) - Per-peer scope configuration (v0.2.0)
- [Agent Communications](./docs/agent-comms.md) - Agent-to-agent messaging (v0.2.0)
- [Rendezvous & Invite Flow](./docs/rendezvous.md) - Zero-config peer discovery (v0.2.14+)
- [Protocol Specification](https://github.com/dp-pcs/openclaw-federation) - Full OGP protocol spec

## Security

- **Ed25519 signatures**: All messages are cryptographically signed
- **Peer approval required**: Only approved peers can send messages
- **Signature verification**: Invalid signatures are rejected
- **HTTPS tunnels**: Encrypted transport via cloudflared/ngrok
- **Nonce tracking**: Prevents replay attacks

**Best practices:**
- Keep `~/.ogp/keypair.json` secure with proper file permissions (`chmod 600`)
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
    notify.ts         # OpenClaw integration (sessions_send + webhooks)
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

## License

MIT

## Links

- **GitHub Repository**: https://github.com/dp-pcs/ogp
- **Issues**: https://github.com/dp-pcs/ogp/issues
- **OGP Protocol Spec**: https://github.com/dp-pcs/openclaw-federation
- **OpenClaw**: https://openclaw.ai
