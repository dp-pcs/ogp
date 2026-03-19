# @dp-pcs/ogp

> OGP (Open Gateway Protocol) federation daemon for OpenClaw

A companion daemon that adds peer-to-peer federation capability to any stock OpenClaw installation — no fork required.

## Features

- **Zero-fork federation**: Runs alongside OpenClaw on a separate port
- **Cryptographically signed**: Ed25519 signatures on all messages
- **Intent-based messaging**: Extensible intent registry for different message types
- **Peer management**: Approve/reject federation requests
- **OpenClaw integration**: Automatic webhook notifications to your agent
- **Public tunnel support**: Built-in cloudflared/ngrok integration

## Quick Start

### Installation

```bash
npm install -g @dp-pcs/ogp
```

### Setup

```bash
# Interactive setup
ogp setup

# Start daemon
ogp start

# Expose via tunnel (get public URL)
ogp expose
```

### Federation

```bash
# Request federation with another OGP instance
ogp federation request https://peer.example.com peer-alice

# List pending requests
ogp federation list --status pending

# Approve a peer
ogp federation approve peer-alice

# Send a message
ogp federation send peer-alice message '{"text":"Hello!"}'
```

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon  │◄────────│   Remote    │
│  :18789     │  webhook│  :18790      │  signed │   Peer      │
│             │         │              │  message│  (OGP)      │
└─────────────┘         └──────────────┘         └─────────────┘
```

1. OGP daemon runs on port 18790 (configurable)
2. Exposes federation endpoints and `/.well-known/ogp` for discovery
3. Manages Ed25519 keypairs and peer relationships
4. Verifies signatures on incoming messages
5. Forwards events to OpenClaw via webhook

## Architecture

### Directory Structure

```
~/.ogp/
  config.json       # Daemon configuration
  keypair.json      # Ed25519 keypair
  peers.json        # Federated peers
  intents.json      # Intent registry
```

### Endpoints

- `GET /.well-known/ogp` - Discovery endpoint
- `POST /federation/request` - Receive federation request
- `POST /federation/approve` - Peer approves your request
- `POST /federation/message` - Receive federated message
- `GET /federation/reply/:nonce` - Retrieve message reply

### Message Format

All messages are signed with Ed25519:

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

## Default Intents

- **message**: Simple text message
- **task-request**: Request a peer to perform a task
- **status-update**: Status update from a peer

Add custom intents by editing `~/.ogp/intents.json`.

## Configuration

`~/.ogp/config.json`:

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

## CLI Reference

### Setup & Control

```bash
ogp setup           # Interactive setup wizard
ogp start           # Start daemon
ogp stop            # Stop daemon
ogp status          # Show status
ogp expose          # Expose via tunnel
```

### Federation Management

```bash
ogp federation list [--status pending|approved|rejected]
ogp federation request <peer-url> <peer-id>
ogp federation approve <peer-id>
ogp federation reject <peer-id>
ogp federation send <peer-id> <intent> <json-payload>
```

### Examples

```bash
# Simple message
ogp federation send alice message '{"text":"Hi!"}'

# Task request
ogp federation send bob task-request '{
  "taskType": "analysis",
  "description": "Analyze recent logs",
  "parameters": {"since": "2026-03-18"}
}'

# Status update
ogp federation send charlie status-update '{
  "status": "completed",
  "message": "Task finished successfully"
}'
```

## Integration with OpenClaw

When a federated message arrives, OGP sends a webhook to OpenClaw:

```bash
POST http://localhost:18789/api/system-event
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "[OGP] Message from Alice: Hello!",
  "sessionKey": "agent:main:main",
  "ogp": {
    "from": "peer-alice",
    "intent": "message",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "payload": { "text": "Hello!" }
  }
}
```

Your OpenClaw agent receives this as a system event and can respond accordingly.

## Security

- **Ed25519 signatures**: All messages cryptographically signed
- **Peer approval**: Only approved peers can send messages
- **Signature verification**: Invalid signatures are rejected
- **Nonce tracking**: Prevents replay attacks
- **HTTPS tunnels**: Encrypted transport (via cloudflared/ngrok)

## Development

### Build from source

```bash
git clone https://github.com/dp-pcs/ogp.git
cd ogp
npm install
npm run build
npm link
```

### Project structure

```
src/
  cli.ts              # Main CLI entrypoint
  daemon/
    server.ts         # HTTP server
    keypair.ts        # Ed25519 keypair management
    peers.ts          # Peer storage
    intent-registry.ts
    message-handler.ts
    notify.ts         # OpenClaw webhook
  cli/
    setup.ts          # Setup wizard
    federation.ts     # Federation commands
    expose.ts         # Tunnel management
  shared/
    signing.ts        # Ed25519 sign/verify
    config.ts         # Config management
```

## Roadmap

- [ ] Reply message storage
- [ ] Message queue for offline peers
- [ ] Multi-intent subscription filters
- [ ] Peer discovery via DNS
- [ ] Federation mesh topology
- [ ] E2E encryption option
- [ ] Rate limiting
- [ ] WebSocket support for real-time events

## License

MIT

## Author

David Proctor
