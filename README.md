# @dp-pcs/ogp

> Open Gateway Protocol (OGP) - Federation for OpenClaw AI Gateways

> 🚧 **Active build — releasing daily.** This is moving fast. Check the [changelog](https://github.com/dp-pcs/ogp/releases) or `npm show @dp-pcs/ogp version` for the latest. If something in the docs doesn't match behavior, the code won the argument — file an issue or ping [@lat3ntg3nius](https://x.com/lat3ntg3nius).

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
- Daemon port (default: 18790)
- OpenClaw URL (default: http://localhost:18789)
- OpenClaw API token
- Your public gateway URL (can update later)
- Display name and email

### 2. Start the Daemon

```bash
ogp start
```

Or run in the background:

```bash
ogp start --background
```

### 3. Expose to the Internet

```bash
ogp expose
```

This starts a cloudflared tunnel and displays your public URL. Copy this URL and update your configuration:

1. Stop the daemon: `ogp stop`
2. Edit `~/.ogp/config.json` and update `"gatewayUrl"` with your tunnel URL
3. Restart: `ogp start --background`
4. Optionally run tunnel in background: `ogp expose --background`

### 4. Share Your URL

Share your gateway URL with peers who want to federate with you. They can discover your public key at:

```
https://your-tunnel-url.com/.well-known/ogp
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
| `ogp expose` | Start cloudflared tunnel in foreground |
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
| `ogp federation request <url> [peer-id]` | Request federation (peer-id auto-resolves if omitted) |
| `ogp federation approve <peer-id> [options]` | Approve with optional scope grants |
| `ogp federation reject <peer-id>` | Reject a federation request |
| `ogp federation send <peer-id> <intent> <json>` | Send a message to an approved peer |
| `ogp federation scopes <peer-id>` | Show scope grants for a peer |
| `ogp federation grant <peer-id> [options]` | Update scope grants for a peer |
| `ogp federation agent <peer-id> <topic> <message>` | Send agent-comms message |
| `ogp federation ping <peer-url>` | Test connectivity to a peer gateway |

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
# Request federation (peer-id auto-resolves from /.well-known/ogp)
ogp federation request https://peer.example.com

# Or specify custom peer-id
ogp federation request https://peer.example.com peer-alice

# Check pending requests
ogp federation list --status pending

# Approve a peer (v0.1 mode - no scope restrictions)
ogp federation approve peer-alice

# Approve with scope grants (v0.2.0+)
ogp federation approve peer-alice \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation

# View peer scopes
ogp federation scopes peer-alice

# Update grants for an existing peer
ogp federation grant peer-alice \
  --intents agent-comms \
  --topics project-planning

# Test connectivity
ogp federation ping https://peer.example.com

# Send a simple message
ogp federation send peer-alice message '{"text":"Hello!"}'

# Send agent-comms (v0.2.0+)
ogp federation agent peer-alice memory-management "How do you persist context?"

# Send agent-comms with priority
ogp federation agent peer-alice task-delegation "Schedule standup" --priority high

# Send agent-comms and wait for reply
ogp federation agent peer-alice queries "What's the status?" --wait --timeout 60000

# Send a task request
ogp federation send peer-alice task-request '{
  "taskType": "analysis",
  "description": "Analyze recent logs"
}'

# Send a status update
ogp federation send peer-alice status-update '{
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

1. **Discovery**: Peers discover each other via `/.well-known/ogp` endpoint
2. **Request**: Alice requests federation with Bob's OGP instance
3. **Approval**: Bob approves (or rejects) the federation request
4. **Messaging**: Approved peers can send cryptographically signed messages
5. **Verification**: Recipient OGP daemon verifies signatures using sender's public key
6. **Relay**: Valid messages are forwarded to the local OpenClaw agent via webhook

All messages are signed with Ed25519 cryptographic signatures to prevent tampering and impersonation.

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

## Key Features (v0.2.11)

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
  "stateDir": "~/.ogp"
}
```

Additional state files:
- `~/.ogp/keypair.json` - Ed25519 keypair (keep secure!)
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
