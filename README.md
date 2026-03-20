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

### Federation Examples

```bash
# Request federation with another OGP instance
ogp federation request https://peer.example.com peer-alice

# Check pending requests
ogp federation list --status pending

# Approve a peer
ogp federation approve peer-alice

# Send a simple message
ogp federation send peer-alice message '{"text":"Hello!"}'

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

Custom intents can be added by editing `~/.ogp/intents.json`.

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

## Documentation

- [Quick Start Guide](./docs/quickstart.md) - Detailed step-by-step setup
- [Federation Flow](./docs/federation-flow.md) - How federation works internally
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
    intent-registry.ts # Intent definitions
    message-handler.ts # Message verification and routing
    notify.ts         # OpenClaw webhook integration
  cli/
    setup.ts          # Setup wizard
    federation.ts     # Federation commands
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
