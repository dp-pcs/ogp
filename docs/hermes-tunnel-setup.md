# Hermes OGP Remote Federation Setup

## Goal
Enable remote OpenClaw instance (clawporate) to federate with local Hermes instance.

## Prerequisites
- Hermes OGP daemon running on port 18793
- Existing Cloudflare tunnel (currently routing to OpenClaw OGP on 18790)
- Domain name (e.g., sarcastek.com)

## Step 1: Add Tunnel Route for Hermes OGP

### Find Your Tunnel Config
```bash
ls ~/.cloudflared/*.yml
cat ~/.cloudflared/config.yml  # or your tunnel config file
```

### Add Hermes Route
Edit your tunnel config to add a new hostname for Hermes:

```yaml
tunnel: <your-tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  # Existing OpenClaw OGP route
  - hostname: ogp.sarcastek.com
    service: http://localhost:18790

  # NEW: Hermes OGP route
  - hostname: hermes-ogp.sarcastek.com
    service: http://localhost:18793

  # Existing routes...
  - hostname: openclaw.sarcastek.com
    service: http://localhost:18789

  # Catch-all (must be last)
  - service: http_status:404
```

### Add DNS Record
In Cloudflare dashboard:
1. Go to DNS settings
2. Add CNAME record:
   - Name: `hermes-ogp`
   - Target: `<your-tunnel-id>.cfargotunnel.com`
   - Proxy: Yes (orange cloud)

### Restart Tunnel
```bash
# If using service
sudo systemctl restart cloudflared

# Or if running manually
cloudflared tunnel run <tunnel-name>
```

### Verify
```bash
curl https://hermes-ogp.sarcastek.com/.well-known/ogp | jq .
```

Should return Hermes OGP discovery card.

## Step 2: Update Hermes Config

Update `~/.ogp-hermes/config.json` to use the public URL:

```json
{
  "daemonPort": 18793,
  "platform": "hermes",
  "gatewayUrl": "https://hermes-ogp.sarcastek.com",  // Changed from localhost
  "displayName": "David (Hermes)",
  "email": "david@example.com",
  "stateDir": "/Users/davidproctor/.ogp-hermes",
  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "ogp-test-secret-hermes-2026",
  "rendezvous": {
    "enabled": false
  }
}
```

### Restart Hermes Daemon
```bash
# Kill existing daemon
pkill -f "test-daemon-start"

# Start with new config
OGP_HOME=~/.ogp-hermes node dist/cli/federation.js daemon start
```

## Step 3: Federation Request from Clawporate

On the **remote clawporate** machine:

```bash
# Request federation with local Hermes
ogp federation request https://hermes-ogp.sarcastek.com clawporate-hermes --alias hermes-local
```

## Step 4: Approve on Local Hermes

On your **local machine**:

```bash
# List pending requests
OGP_HOME=~/.ogp-hermes ogp federation list --status pending

# Approve clawporate
OGP_HOME=~/.ogp-hermes ogp federation approve <peer-id-or-alias>
```

## Step 5: Send Test Message

From **clawporate**:

```bash
ogp federation send hermes-local "Hello Hermes from clawporate! Testing OGP cross-platform federation."
```

Should appear in Hermes (via webhook → Telegram/logs).

## Architecture Diagram

```
┌─────────────────────────┐
│  Clawporate (Remote)    │
│  OpenClaw Gateway       │
└───────────┬─────────────┘
            │
            │ OGP Federation
            │ (HTTPS + Ed25519 signatures)
            │
            ▼
┌─────────────────────────┐
│  Cloudflare Tunnel      │
│  hermes-ogp.sarcastek.com│
└───────────┬─────────────┘
            │
            │ Reverse Proxy
            │
            ▼
┌─────────────────────────┐
│  Local Machine          │
│                         │
│  ┌──────────────────┐   │
│  │ Hermes OGP       │   │
│  │ Port 18793       │   │
│  └────────┬─────────┘   │
│           │              │
│           │ Webhook POST │
│           ▼              │
│  ┌──────────────────┐   │
│  │ Hermes Webhook   │   │
│  │ Port 8644        │   │
│  └────────┬─────────┘   │
│           │              │
│           │ Deliver      │
│           ▼              │
│      Telegram / Logs    │
└─────────────────────────┘
```

## Port Summary

| Service | Port | Access |
|---------|------|--------|
| OpenClaw Gateway | 18789 | openclaw.sarcastek.com |
| OpenClaw OGP | 18790 | ogp.sarcastek.com |
| Hermes OGP | 18793 | hermes-ogp.sarcastek.com |
| Hermes Webhook | 8644 | localhost only |
| Hermes Gateway | varies | localhost only |

## Troubleshooting

### Test Discovery Endpoint
```bash
curl https://hermes-ogp.sarcastek.com/.well-known/ogp
```

### Check Federation Status
```bash
OGP_HOME=~/.ogp-hermes ogp federation list
```

### Test Notification Delivery
```bash
OGP_HOME=~/.ogp-hermes node test-hermes-notify.mjs
```

### Check Webhook Delivery
```bash
hermes webhook list
hermes status | grep Telegram
```

## Security Notes

- OGP messages are cryptographically signed (Ed25519)
- Webhook uses HMAC-SHA256 signature verification
- Tunnel provides HTTPS termination
- Private keys stored in macOS Keychain (Hermes) or filesystem with restricted permissions (OpenClaw)

## Next Steps

After successful federation:
1. Test bidirectional messaging
2. Test different intents (agent-comms, project.*, etc.)
3. Set up monitoring/logging
4. Document federation workflow for team
