# Testing OGP with Hermes Locally

> Quick guide for federating OpenClaw and Hermes on the same machine

## Overview

This guide walks through setting up federation between OpenClaw and Hermes running on the same Mac. While the typical use case is remote federation, local testing proves the platform-agnostic architecture works.

## Prerequisites

- ✅ OpenClaw installed and running
- ✅ Hermes installed and running
- ✅ OGP installed (`npm install -g @dp-pcs/ogp`)
- ✅ Both have separate identities (different API tokens, configs)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Your Mac                                               │
│                                                         │
│  ┌──────────────────┐  Federation  ┌──────────────────┐│
│  │ OGP Instance 1   │◄────────────►│ OGP Instance 2   ││
│  │ (OpenClaw)       │   Signed     │ (Hermes)         ││
│  │                  │   Messages   │                  ││
│  │ :18790          │              │ :18791           ││
│  │ ~/.ogp          │              │ ~/.ogp-hermes    ││
│  └────────┬─────────┘              └────────┬─────────┘│
│           │                                 │          │
│           ▼                                 ▼          │
│  ┌──────────────────┐              ┌──────────────────┐│
│  │ OpenClaw         │              │ Hermes Gateway   ││
│  │ :18789           │              │ Webhook :8644    ││
│  └──────────────────┘              └──────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Setup Steps

### 1. Configure Hermes Webhook

First, configure Hermes to accept OGP federation messages via its webhook platform:

```bash
# Edit Hermes config
code ~/.hermes/config.yaml
```

Add this under `platforms`:

```yaml
platforms:
  # ... other platforms ...

  webhook:
    enabled: true
    port: 8644
    host: "127.0.0.1"
    routes:
      ogp_federation:
        secret: "test-secret-ogp-hermes"  # MUST match OGP config
        events: ["*"]
        prompt: |
          📡 **OGP Federation Message**

          **From:** {{peer_display_name}} ({{peer_id}})
          **Intent:** {{intent}}
          {{#if topic}}**Topic:** {{topic}}{{/if}}
          {{#if priority}}**Priority:** {{priority}}{{/if}}
          {{#if conversation_id}}**Thread:** {{conversation_id}}{{/if}}

          ---

          {{message}}

          {{#if payload}}
          **Additional Data:**
          ```json
          {{payload}}
          ```
          {{/if}}
        deliver: "telegram"  # Change to your preferred channel
        deliver_extra:
          chat_id: "YOUR_TELEGRAM_CHAT_ID"  # Or omit for default
```

**Important:** The `secret` field is critical. This will be used to verify webhook signatures from OGP.

### 2. Restart Hermes Gateway

```bash
hermes gateway restart
```

Verify the webhook is listening:

```bash
curl http://localhost:8644/health
# Should return: {"status":"ok"}
```

### 3. Verify OpenClaw OGP Instance (Existing)

Your existing OGP instance should already be configured:

```bash
# Check status
ogp status

# Should show:
# ✓ Daemon running on port 18790
# ✓ Connected to OpenClaw at http://localhost:18789
# ✓ Gateway: <your-url>
```

If not set up:

```bash
ogp setup
# Follow prompts, select OpenClaw agent
ogp start
```

### 4. Create OGP Instance for Hermes

Now create a second OGP instance dedicated to Hermes:

```bash
# Create state directory
mkdir -p ~/.ogp-hermes

# Create configuration
cat > ~/.ogp-hermes/config.json <<'EOF'
{
  "daemonPort": 18791,
  "platform": "hermes",
  "gatewayUrl": "http://localhost:18791",
  "displayName": "David (Hermes)",
  "email": "your-email@example.com",
  "stateDir": "~/.ogp-hermes",

  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "test-secret-ogp-hermes",

  "rendezvous": {
    "enabled": false
  }
}
EOF
```

**Note:** We're using `http://localhost:18791` as the gateway URL since both are on the same machine. For remote federation, you'd use your public tunnel URL.

### 5. Modify OGP to Support Hermes Backend

**TEMPORARY:** Until the notification backend refactor is merged, manually patch `src/daemon/notify.ts`:

```typescript
// Add near the top of the file
async function notifyHermes(
  peerId: string,
  peerDisplayName: string,
  intent: string,
  payload: any
): Promise<void> {
  const config = loadConfig();
  const webhookUrl = config.hermesWebhookUrl || 'http://localhost:8644/webhooks/ogp_federation';
  const secret = config.hermesWebhookSecret;

  if (!secret) {
    throw new Error('Hermes webhook secret not configured');
  }

  const body = {
    peer_id: peerId,
    peer_display_name: peerDisplayName,
    intent: intent,
    topic: payload.topic || "",
    message: payload.message || JSON.stringify(payload),
    priority: payload.priority || "normal",
    conversation_id: payload.conversationId,
    timestamp: new Date().toISOString(),
    payload: payload
  };

  const bodyStr = JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(bodyStr)
    .digest('hex');

  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${signature}`
    },
    body: bodyStr
  });
}

// Modify the main notification function
export async function notifyLocalAgent(...) {
  const config = loadConfig();
  const platform = config.platform || 'openclaw';

  if (platform === 'hermes') {
    await notifyHermes(peerId, peerDisplayName, intent, payload);
  } else {
    await notifyOpenClaw(peerId, intent, payload);  // existing code
  }
}
```

Then rebuild:

```bash
cd ~/Documents/GitHub/ogp
npm run build
```

### 6. Start Hermes OGP Instance

```bash
# Set state directory via env var
export OGP_STATE_DIR=~/.ogp-hermes

# Start the daemon (will use config from ~/.ogp-hermes/config.json)
node ~/Documents/GitHub/ogp/dist/daemon/server.js &

# Or if using the CLI wrapper:
# ogp start --config ~/.ogp-hermes/config.json --port 18791
```

Verify it's running:

```bash
curl http://localhost:18791/.well-known/ogp
# Should return OGP metadata with public key
```

### 7. Establish Federation

Now federate the two local instances:

**From OpenClaw OGP → Hermes OGP:**

```bash
# Request federation from OpenClaw's OGP to Hermes's OGP
ogp federation request http://localhost:18791 --alias hermes-local
```

You should see:
```
✓ Federation request sent to http://localhost:18791
✓ Peer alias: hermes-local (auto-resolved from display name)
```

**From Hermes OGP → Approve:**

```bash
# List pending requests
OGP_STATE_DIR=~/.ogp-hermes ogp federation list --status pending

# Should show the request from OpenClaw's OGP
# Note the peer ID (first 16 chars of public key)

# Approve it
OGP_STATE_DIR=~/.ogp-hermes ogp federation approve <peer-id> \
  --intents message,agent-comms \
  --topics general,testing
```

**Reverse Direction (Optional):**

If you want bidirectional federation:

```bash
# From Hermes OGP, request to OpenClaw OGP
OGP_STATE_DIR=~/.ogp-hermes ogp federation request http://localhost:18790 --alias openclaw-local

# From OpenClaw OGP, approve
ogp federation approve <hermes-peer-id>
```

### 8. Test Message Flow

**Send from OpenClaw to Hermes:**

```bash
# Simple message
ogp federation send hermes-local message '{"text":"Hello from OpenClaw!"}'

# Agent-comms with topic
ogp federation agent hermes-local testing "This is a test message from OpenClaw" --priority high
```

**What should happen:**
1. Message leaves OpenClaw's OGP (port 18790)
2. Travels to Hermes's OGP (port 18791)
3. Doorman validates signature and scope
4. OGP posts to Hermes webhook (port 8644)
5. Hermes webhook adapter formats the message
6. Hermes processes and sends to your configured delivery (Telegram, etc.)

**Check Hermes logs:**

```bash
tail -f ~/.hermes/logs/gateway.log
```

You should see:
```
[webhook] Received POST on route ogp_federation
[webhook] Signature verified
[webhook] Triggering agent run for session webhook:ogp_federation:...
```

### 9. Test Reverse Direction (Optional)

If you set up bidirectional federation:

```bash
OGP_STATE_DIR=~/.ogp-hermes ogp federation send openclaw-local message '{"text":"Hello from Hermes!"}'
```

The message should appear in OpenClaw.

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 18791
lsof -i :18791

# Kill if needed
kill <PID>
```

### Webhook Not Receiving Messages

1. **Check Hermes webhook is running:**
   ```bash
   curl http://localhost:8644/health
   ```

2. **Verify webhook secret matches:**
   ```bash
   # In ~/.ogp-hermes/config.json
   cat ~/.ogp-hermes/config.json | grep hermesWebhookSecret

   # In ~/.hermes/config.yaml
   grep -A5 ogp_federation ~/.hermes/config.yaml | grep secret
   ```

3. **Check Hermes gateway logs:**
   ```bash
   tail -f ~/.hermes/logs/gateway.log
   ```

### Signature Verification Failed

This means the webhook secret doesn't match. Double-check:
- `hermesWebhookSecret` in `~/.ogp-hermes/config.json`
- `secret` under `routes.ogp_federation` in `~/.hermes/config.yaml`

They must be identical.

### OGP Daemon Won't Start

```bash
# Check if port 18791 is already in use
lsof -i :18791

# Check logs
tail -f ~/.ogp-hermes/daemon.log

# Verify config is valid JSON
jq . ~/.ogp-hermes/config.json
```

### Federation Request Fails

```bash
# Verify Hermes OGP is reachable
curl http://localhost:18791/.well-known/ogp

# Check OpenClaw OGP peers list
ogp federation list

# Check Hermes OGP peers list
OGP_STATE_DIR=~/.ogp-hermes ogp federation list
```

## Verification Checklist

- [ ] Hermes gateway running with webhook enabled (port 8644)
- [ ] OpenClaw OGP running (port 18790)
- [ ] Hermes OGP running (port 18791)
- [ ] Both OGP instances have unique keypairs
- [ ] Federation established (peer approved on both sides)
- [ ] Test message sent successfully
- [ ] Message appears in Hermes delivery channel
- [ ] Webhook signature verified (check logs)

## Next Steps

Once local federation works:

1. **Test Remote Federation:**
   - Deploy Hermes to a VPS or cloud instance
   - Set up HTTPS tunnel for Hermes OGP
   - Federate with a truly remote OpenClaw instance

2. **Test Scope Policies:**
   ```bash
   # Restrict Hermes peer to specific topics
   ogp federation grant hermes-local \
     --topics project-alpha,memory-sync \
     --rate 50/3600
   ```

3. **Test Agent-Comms Response Policies:**
   ```bash
   # Configure how OpenClaw responds to Hermes
   ogp agent-comms configure hermes-local \
     --topics testing \
     --level full \
     --notes "Local Hermes instance"
   ```

4. **Test Project Collaboration:**
   ```bash
   # Create a project on OpenClaw
   ogp project create test-project "Test Federation"

   # Send contribution to Hermes
   ogp project send-contribution hermes-local test-project progress \
     "Testing cross-platform federation"
   ```

## Cleanup

To stop the test setup:

```bash
# Stop Hermes OGP
kill $(cat ~/.ogp-hermes/daemon.pid)

# Or if using CLI wrapper:
# OGP_STATE_DIR=~/.ogp-hermes ogp stop

# Stop OpenClaw OGP
ogp stop

# Stop Hermes gateway
hermes gateway stop

# Remove test state (optional)
# rm -rf ~/.ogp-hermes
```

## Summary

This setup proves that:
- ✅ OGP works with multiple platforms (OpenClaw + Hermes)
- ✅ Multiple OGP instances can run on the same machine
- ✅ Federation is platform-agnostic (only notification backend differs)
- ✅ Cryptographic verification works identically for local and remote peers
- ✅ The "router" analogy holds: protocol is the same, backend adapts

**The key insight:** Each AI assistant gets its own OGP gateway instance. The core protocol never changes; only the notification mechanism adapts to the local platform.

---

**Last Updated:** 2026-04-04
**Tested With:** OGP v0.2.31, Hermes v0.7.0, OpenClaw v1.x
