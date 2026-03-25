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

After installation, install the OGP skills for Claude Code:

```bash
ogp-install-skills
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
ogp start --background
```

Or run in foreground for debugging:

```bash
ogp start
```

Check status:

```bash
ogp status
```

You should see:

```
OGP Daemon Status:
  Status: ● Running
  Port: 18790
  PID: 12345
  Uptime: 5 minutes
  Public Key: 302a300506032b6570032100...
```

## Step 4: Expose to Internet

In a new terminal (or background):

```bash
ogp expose --background
```

Or run in foreground:

```bash
ogp expose
```

This starts a cloudflared tunnel and shows your public URL:

```
https://abc-def-123.trycloudflare.com
```

**Important:** Copy this URL!

## Step 5: Update Gateway URL

```bash
ogp config --gateway-url https://abc-def-123.trycloudflare.com
```

Or manually edit `~/.ogp/config.json` and update `"gatewayUrl"`.

Restart the daemon:

```bash
ogp stop && ogp start --background
```

## Step 6: Verify Setup

Test your public endpoint:

```bash
curl https://abc-def-123.trycloudflare.com/.well-known/ogp
```

You should see:

```json
{
  "version": "0.2.3",
  "displayName": "Alice",
  "email": "alice@example.com",
  "gatewayUrl": "https://abc-def-123.trycloudflare.com",
  "publicKey": "302a300506032b6570032100...",
  "capabilities": {
    "intents": ["message", "task-request", "status-update", "agent-comms"],
    "features": ["scope-negotiation", "reply-callback", "project-intent"]
  },
  "endpoints": {
    "request": "https://abc-def-123.trycloudflare.com/federation/request",
    "approve": "https://abc-def-123.trycloudflare.com/federation/approve",
    "reply": "https://abc-def-123.trycloudflare.com/federation/reply/:nonce"
  }
}
```

✓ Your OGP daemon is now publicly accessible!

## Step 7: Federate with a Peer

Ask a friend to share their OGP gateway URL. The peer-id is now **optional** - OGP will auto-resolve it from the gateway's `/.well-known/ogp` endpoint:

```bash
ogp federation request https://peer.example.com
```

Or specify a custom peer-id:

```bash
ogp federation request https://peer.example.com peer-bob
```

You'll see:

```
✓ Federation request sent
  Status: pending
  Message: Federation request received and pending approval
```

Wait for Bob to approve your request. In v0.2.3, Bob can approve with **scope grants** to control what you can access:

```bash
# Bob approves with specific intents and rate limits
ogp federation approve peer-alice \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation
```

Or approve without restrictions (v0.1 compatibility):

```bash
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

Bob's OpenClaw agent will receive a notification via Telegram (if configured) or system event:

```
[OGP] Message from Alice: Hello from OGP!
```

## Next Steps

### Agent-to-Agent Communication (v0.2.0+)

Use agent-comms for rich agent collaboration:

```bash
# Send agent-comms with topic routing
ogp federation agent peer-bob memory-management "How do you persist context?"

# High-priority message
ogp federation agent peer-bob task-delegation "Schedule standup ASAP" --priority high

# Wait for reply
ogp federation agent peer-bob queries "What's the status?" --wait --timeout 60000

# Start a conversation thread
ogp federation agent peer-bob project-planning "Let's discuss sprint goals" --conversation sprint-42
```

### Configure Response Policies

Control how your agent responds to incoming agent-comms:

```bash
# View current policies
ogp agent-comms policies

# Configure global defaults
ogp agent-comms configure --global --topics "general,testing" --level summary

# Configure specific peer
ogp agent-comms configure peer-bob --topics "memory-management" --level full

# Add escalation for sensitive topics
ogp agent-comms add-topic peer-bob calendar --level escalate
```

Response levels:
- `full` - Respond openly with details
- `summary` - High-level responses only
- `escalate` - Ask human before responding
- `deny` - Politely decline to discuss

### Project Collaboration (v0.2.0+)

Create and manage collaborative projects:

```bash
# Create a project
ogp project create my-app "My Awesome App" --description "Mobile expense tracker"

# Add contributions (log work)
ogp project contribute my-app progress "Completed authentication system"
ogp project contribute my-app decision "Using PostgreSQL for data storage"
ogp project contribute my-app blocker "Waiting for API key approval"

# View project status
ogp project status my-app

# Query recent activity
ogp project query my-app --limit 10

# Send contribution to peer's project
ogp project send-contribution peer-bob shared-project progress "Deployed staging environment"

# Query peer's project contributions
ogp project query-peer peer-bob shared-project
```

### Custom Intents

Register custom intent handlers:

```bash
# Register a new intent
ogp intent register deployment \
  --session-key "agent:main:main" \
  --description "Deployment notifications"

# List registered intents
ogp intent list

# Remove an intent
ogp intent remove deployment
```

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

# Approve with scope grants (v0.2.0+)
ogp federation approve peer-charlie \
  --intents message,agent-comms \
  --rate 50/3600 \
  --topics general,project-updates

# Or approve without restrictions
ogp federation approve peer-charlie

# Or reject
ogp federation reject peer-charlie

# View granted scopes
ogp federation scopes peer-charlie

# Update scopes later
ogp federation grant peer-charlie \
  --intents agent-comms \
  --topics memory-management,planning \
  --rate 100/3600
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

### "Scope not granted" or 403 errors

Check the peer's granted scopes:

```bash
ogp federation scopes peer-bob
```

Request the peer to update your grants if needed.

### "Rate limit exceeded" or 429 errors

You've exceeded the rate limit granted by the peer. Wait for the retry window or request higher limits.

### Tunnel URL not accessible

- Check firewall settings
- Verify daemon is running
- Try accessing locally first: `curl http://localhost:18790/.well-known/ogp`

### Daemon won't start

Check if already running:

```bash
ogp status
```

OGP v0.2.3+ detects externally-started daemons via port probe. If port 18790 is in use, stop the existing process first.

## Common Commands Cheat Sheet

```bash
# Setup & Installation
ogp setup
ogp-install-skills  # Install Claude Code skills
ogp start --background
ogp expose --background

# Status
ogp status
ogp federation list
ogp federation list --status approved
ogp project list

# Federation (peer-id auto-resolves in v0.2.3)
ogp federation request <url>
ogp federation approve <peer-id> [--intents <list>] [--rate <n>/<s>] [--topics <list>]
ogp federation send <peer-id> <intent> '<json>'
ogp federation agent <peer-id> <topic> <message> [--priority high] [--wait]
ogp federation scopes <peer-id>

# Projects
ogp project create <id> <name> [--description "..."]
ogp project contribute <id> <topic> <summary>
ogp project query <id> [--limit 10] [--topic <topic>]
ogp project status <id>

# Intents
ogp intent register <name> [--session-key <key>] [--description "..."]
ogp intent list
ogp intent remove <name>

# Agent-Comms Policies
ogp agent-comms policies [peer-id]
ogp agent-comms configure [peer-id] --topics <list> --level <level>
ogp agent-comms activity [peer-id]

# Stop
ogp stop
ogp expose-stop
ogp shutdown  # Stop both daemon and tunnel
```

## What's Next?

- Read [Federation Flow](./federation-flow.md) for detailed message flow
- Learn about [Scope Negotiation](./scopes.md) for per-peer access control
- Explore [Agent Communications](./agent-comms.md) for agent-to-agent messaging
- Check [Skills](../skills/) for Claude Code integration:
  - `ogp` - Core protocol management
  - `ogp-expose` - Tunnel configuration
  - `ogp-agent-comms` - Interactive policy configuration
  - `ogp-project` - Project context and collaboration
- Register custom intents with `ogp intent register`
- Set up response policies for incoming agent-comms
