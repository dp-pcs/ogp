# @dp-pcs/ogp

> Open Gateway Protocol (OGP) - Federation for OpenClaw AI Gateways

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
npm install -g github:dp-pcs/ogp
```

After installation, install the OGP skills for Claude Code:

```bash
ogp-install-skills
```

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
| `ogp expose --provider ngrok` | Use ngrok instead of cloudflared |
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
| `ogp federation request <url> <peer-id>` | Request federation with a peer |
| `ogp federation approve <peer-id>` | Approve a federation request |
| `ogp federation reject <peer-id>` | Reject a federation request |
| `ogp federation send <peer-id> <intent> <json>` | Send a message to an approved peer |
| `ogp federation scopes <peer-id>` | Show scope grants for a peer |
| `ogp federation grant <peer-id> [options]` | Update scope grants for a peer |
| `ogp federation agent <peer-id> <topic> <message>` | Send agent-comms message |

### Scope Options (v0.2.0)

When approving or granting scopes:
- `--intents <list>` - Comma-separated intents (e.g., `message,agent-comms`)
- `--rate <limit>` - Rate limit as requests/seconds (e.g., `100/3600`)
- `--topics <list>` - Topics for agent-comms (e.g., `memory-management,task-delegation`)

### Federation Examples

```bash
# Request federation with another OGP instance
ogp federation request https://peer.example.com peer-alice

# Check pending requests
ogp federation list --status pending

# Approve a peer (v0.1 mode - no scope restrictions)
ogp federation approve peer-alice

# Approve with scope grants (v0.2.0)
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

# Send a simple message
ogp federation send peer-alice message '{"text":"Hello!"}'

# Send agent-comms (v0.2.0)
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
- **agent-comms**: Agent-to-agent communication with topic routing (v0.2.0)

Custom intents can be added by editing `~/.ogp/intents.json`.

## Scope Negotiation (v0.2.0)

OGP v0.2.0 introduces a three-layer scope model based on BGP-style per-peer policies:

```
Layer 1: Gateway Capabilities  → What I CAN support (advertised globally)
Layer 2: Peer Negotiation      → What I WILL grant YOU (per-peer, during approval)
Layer 3: Runtime Enforcement   → Is THIS request within YOUR granted scope (doorman)
```

### How It Works

1. **Discovery**: Peers discover each other's capabilities via `/.well-known/ogp`
2. **Request**: Peer A requests federation with Peer B
3. **Grant**: Peer B approves with specific scope grants (intents, rate limits, topics)
4. **Enforcement**: The doorman validates every incoming message against granted scopes

### Example: David ↔ Stan Federation

```bash
# David approves Stan with agent-comms for memory-management topics only
ogp federation approve stan \
  --intents agent-comms \
  --topics memory-management \
  --rate 10/60

# Stan can now send:
ogp federation agent david memory-management "How do you persist context?"  # ✓

# But NOT:
ogp federation agent david personal-finances "What's your budget?"  # ✗ Topic not allowed
```

### Backward Compatibility

- v0.1 peers work without scope negotiation (default rate limits apply)
- v0.2 gateways automatically detect protocol version
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
- `~/.ogp/peers.json` - Federated peer list
- `~/.ogp/intents.json` - Intent registry

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

The `ogp-agent-comms` skill guides you through setting up response policies interactively, including multi-select for batch peer configuration.

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
    scopes.ts         # Scope types and utilities (v0.2.0)
    doorman.ts        # Scope enforcement + rate limiting (v0.2.0)
    reply-handler.ts  # Async reply mechanism (v0.2.0)
    intent-registry.ts # Intent definitions
    message-handler.ts # Message verification and routing
    notify.ts         # OpenClaw webhook integration
  cli/
    setup.ts          # Setup wizard
    federation.ts     # Federation commands (scopes, agent-comms)
    expose.ts         # Tunnel management
    install.ts        # LaunchAgent installation
  shared/
    signing.ts        # Ed25519 sign/verify utilities
    config.ts         # Configuration management
```

## License

MIT

## Links

- **GitHub Repository**: https://github.com/dp-pcs/ogp
- **Issues**: https://github.com/dp-pcs/ogp/issues
- **OGP Protocol Spec**: https://github.com/dp-pcs/openclaw-federation
- **OpenClaw**: https://openclaw.ai
