---
skill_name: ogp
version: 0.1.0
description: Manage OGP (Open Gateway Protocol) daemon and federation
trigger: Use when the user wants to configure, start, or manage the OGP federation daemon
---

# OGP Federation Management

This skill helps manage the OGP (Open Gateway Protocol) daemon, which adds federation capability to OpenClaw.

## When to Use

Use this skill when:
- User wants to set up OGP federation
- User wants to start/stop the OGP daemon
- User wants to manage federated peers (list, approve, reject)
- User wants to send messages to federated peers
- User asks about OGP status or configuration

## Commands

### Setup

```bash
ogp setup
```

Interactive setup wizard. Prompts for:
- Daemon port (default: 18790)
- OpenClaw URL (default: http://localhost:18789)
- OpenClaw API token
- Gateway URL (your public URL)
- Display name
- Email

### Start/Stop Daemon

```bash
# Start daemon
ogp start

# Stop daemon
ogp stop

# Check status
ogp status
```

### Federation Management

```bash
# List all peers
ogp federation list

# List only pending requests
ogp federation list --status pending

# List approved peers
ogp federation list --status approved

# Request federation with another OGP instance
ogp federation request <peer-gateway-url> <peer-id>

# Approve a pending request
ogp federation approve <peer-id>

# Reject a pending request
ogp federation reject <peer-id>

# Send message to a peer
ogp federation send <peer-id> message '{"text":"Hello from OGP!"}'

# Send task request
ogp federation send <peer-id> task-request '{"taskType":"analysis","description":"Analyze logs"}'
```

### Expose Daemon

```bash
# Expose via cloudflared (default)
ogp expose

# Expose via ngrok
ogp expose --method ngrok
```

## Common Workflows

### Initial Setup

1. Run `ogp setup` to configure
2. Run `ogp expose` to get a public URL
3. Update gateway URL in config if needed
4. Run `ogp start` to start daemon

### Adding a Peer

1. Get peer's gateway URL
2. Run `ogp federation request <peer-url> <peer-id>`
3. Wait for peer to approve
4. Verify with `ogp federation list --status approved`

### Receiving Federation Requests

When another OGP instance sends a federation request:
1. You'll see it in `ogp federation list --status pending`
2. Approve with `ogp federation approve <peer-id>`
3. Or reject with `ogp federation reject <peer-id>`

### Sending Messages

Once peers are approved:

```bash
# Simple message
ogp federation send alice message '{"text":"Hi Alice!"}'

# Task request
ogp federation send bob task-request '{
  "taskType": "code-review",
  "description": "Review PR #123",
  "parameters": {"repo": "openclaw", "pr": 123}
}'

# Status update
ogp federation send charlie status-update '{
  "status": "completed",
  "message": "Task finished"
}'
```

## Configuration

Config file: `~/.ogp/config.json`

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "gatewayUrl": "https://your-public-url.com",
  "displayName": "Your Name",
  "email": "you@example.com",
  "stateDir": "~/.ogp"
}
```

## Troubleshooting

### Daemon won't start
- Check if port 18790 is already in use
- Verify OpenClaw is running and accessible
- Check `~/.ogp/config.json` exists and is valid

### Federation request fails
- Verify peer's gateway URL is accessible
- Check peer's OGP daemon is running
- Ensure network connectivity

### Messages not reaching OpenClaw
- Verify OpenClaw token is correct
- Check OpenClaw URL is accessible
- Look for errors in daemon logs

## Architecture

The OGP daemon:
- Runs on port 18790 (configurable)
- Uses Ed25519 for signing messages
- Exposes `/.well-known/ogp` for discovery
- Stores peers in `~/.ogp/peers.json`
- Notifies OpenClaw via POST to `/api/system-event`

## Security

- All messages are signed with Ed25519
- Peer public keys are verified on every message
- Only approved peers can send messages
- Signatures prevent tampering and impersonation
