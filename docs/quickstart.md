# OGP Quick Start Guide

Get started with OGP federation in 5 minutes.

## Prerequisites

- Node.js >= 18
- OpenClaw running locally or remotely
- OpenClaw API token

## Step 1: Install

```bash
npm install -g @dp-pcs/ogp
```

## Step 2: Configure

Run the interactive setup:

```bash
ogp setup
```

Answer the prompts:

```
Daemon port [18790]: <enter>
OpenClaw URL [http://localhost:18789]: <enter>
OpenClaw API token: your-token-here
Gateway URL (your public URL): https://temporary-url.com
Display name: Alice
Email: alice@example.com
State directory [~/.ogp]: <enter>
```

Don't worry about the gateway URL yet — we'll get a real one in the next step.

## Step 3: Start Daemon

```bash
ogp start
```

You should see:

```
[OGP] Daemon listening on port 18790
[OGP] Public key: 302a300506032b6570032100...
```

## Step 4: Expose to Internet

In a new terminal:

```bash
ogp expose
```

This starts a cloudflared tunnel and shows your public URL:

```
https://abc-def-123.trycloudflare.com
```

**Important:** Copy this URL!

## Step 5: Update Gateway URL

1. Stop the daemon (Ctrl+C in the daemon terminal)
2. Edit `~/.ogp/config.json`
3. Update `"gatewayUrl"` to your tunnel URL
4. Restart: `ogp start`

## Step 6: Verify Setup

Test your public endpoint:

```bash
curl https://abc-def-123.trycloudflare.com/.well-known/ogp
```

You should see:

```json
{
  "version": "0.1.0",
  "displayName": "Alice",
  "email": "alice@example.com",
  "gatewayUrl": "https://abc-def-123.trycloudflare.com",
  "publicKey": "302a300506032b6570032100...",
  "endpoints": {
    "request": "https://abc-def-123.trycloudflare.com/federation/request",
    "approve": "https://abc-def-123.trycloudflare.com/federation/approve",
    "reply": "https://abc-def-123.trycloudflare.com/federation/reply/:nonce"
  }
}
```

✓ Your OGP daemon is now publicly accessible!

## Step 7: Federate with a Peer

Ask a friend to share their OGP gateway URL, then:

```bash
ogp federation request https://peer.example.com peer-bob
```

You'll see:

```
✓ Federation request sent
  Status: pending
  Message: Federation request received and pending approval
```

Wait for Bob to approve your request:

```bash
# Bob runs this on their end:
ogp federation approve peer-alice
```

Check your approved peers:

```bash
ogp federation list --status approved
```

## Step 8: Send Your First Message

```bash
ogp federation send peer-bob message '{"text":"Hello from OGP!"}'
```

Bob's OpenClaw agent will receive:

```
[OGP] Message from Alice: Hello from OGP!
```

## Next Steps

### Send Different Message Types

```bash
# Task request
ogp federation send peer-bob task-request '{
  "taskType": "analysis",
  "description": "Analyze server logs from last hour"
}'

# Status update
ogp federation send peer-bob status-update '{
  "status": "online",
  "message": "Ready to collaborate"
}'
```

### Manage Incoming Requests

When someone sends you a federation request:

```bash
# List pending
ogp federation list --status pending

# Approve
ogp federation approve peer-charlie

# Or reject
ogp federation reject peer-charlie
```

### Keep Tunnel Running

For production use, set up a permanent tunnel:

**Option 1: Named cloudflared tunnel**

```bash
cloudflared tunnel login
cloudflared tunnel create ogp-daemon
# Edit config.yml with your tunnel settings
cloudflared tunnel run ogp-daemon
```

**Option 2: Run as system service**

See [ogp-expose skill](../skills/ogp-expose/SKILL.md) for systemd/launchd setup.

## Troubleshooting

### "No configuration found"

Run `ogp setup` first.

### "Failed to notify OpenClaw"

- Verify OpenClaw URL is correct
- Check API token is valid
- Ensure OpenClaw is running

### "Peer not approved"

The peer must approve your federation request first. Contact them or check their status.

### Tunnel URL not accessible

- Check firewall settings
- Verify daemon is running
- Try accessing locally first: `curl http://localhost:18790/.well-known/ogp`

## Common Commands Cheat Sheet

```bash
# Setup
ogp setup
ogp start
ogp expose

# Status
ogp status
ogp federation list

# Federation
ogp federation request <url> <peer-id>
ogp federation approve <peer-id>
ogp federation send <peer-id> <intent> '<json>'

# Stop
ogp stop
```

## What's Next?

- Read [Federation Flow](./federation-flow.md) for detailed message flow
- Check [Skills](../skills/) for Claude Code integration
- Explore custom intents in `~/.ogp/intents.json`
- Set up automatic peer discovery
