# Hermes Integration Status

## ✅ What's Working

### 1. Hermes Webhook Platform
- **Status**: Running on port 8644
- **Route**: `/webhooks/ogp_federation`
- **Authentication**: HMAC-SHA256 signature verification
- **Configuration**: Dynamic subscription via `hermes webhook subscribe`

### 2. Hermes OGP Daemon
- **Status**: Running on port 18793
- **Discovery endpoint**: `http://localhost:18793/.well-known/ogp`
- **Platform**: `hermes`
- **Config directory**: `~/.ogp-hermes/`

### 3. Notification Backend
- **Implementation**: Platform-agnostic backend system
- **Hermes backend**: Sends HMAC-signed webhooks to Hermes gateway
- **OpenClaw backend**: Uses existing webhook + CLI integration
- **Backend selection**: Automatic based on `platform` config field

### 4. Test Results
```bash
# Test notification delivery
$ OGP_HOME=~/.ogp-hermes node test-hermes-notify.mjs
✓ Loaded config
  Config path: /Users/davidproctor/.ogp-hermes
  Platform: hermes
  Hermes webhook: http://localhost:8644/webhooks/ogp_federation

Sending notification via platform backend...
[OGP] Notified Hermes via webhook: Hello! This is an end-to-end test of the Hermes notification backend from the OGP daemon.
✅ SUCCESS: Notification delivered!
```

## Port Allocation Strategy

### Current Setup
- **OpenClaw Gateway**: Port 18789
- **OpenClaw OGP Daemon**: Port 18790
- **Hermes Gateway**: Dynamic (managed by Hermes)
- **Hermes OGP Daemon**: Port 18793
- **Hermes Webhook Platform**: Port 8644

### Recommended Approach: Sequential Port Block (18790-18799)

Each AI assistant instance gets its own OGP daemon on a sequential port:
- **Port 18790**: First instance (OpenClaw)
- **Port 18791**: Second instance (reserved/unused)
- **Port 18792**: Third instance (was attempted for Hermes, but port conflict)
- **Port 18793**: Fourth instance (Hermes - current)
- **Ports 18794-18799**: Future instances

### Why Sequential Ports?
1. **Easy to remember**: Just increment from 18790
2. **No conflicts**: Each instance gets its own dedicated port
3. **Keeps OGP together**: All OGP daemons in one port range
4. **Scalable**: Supports up to 10 instances (18790-18799)

### Alternative Considered: Gateway Port + 100
User suggested: "If gateway is on port X, use X+100 for OGP daemon"
- **Pros**: Links daemon port to gateway port
- **Cons**: Requires math, spreads ports across wide range, conflicts possible

## Multi-Instance Architecture

### One OGP Daemon Per AI Agent
Each AI assistant (OpenClaw, Hermes, future platforms) runs its own OGP daemon:

```
┌─────────────────┐         ┌─────────────────┐
│  OpenClaw       │         │  Hermes         │
│  (Port 18789)   │         │  (Port 8644)    │
└────────┬────────┘         └────────┬────────┘
         │                           │
    ┌────▼─────┐              ┌─────▼────┐
    │ OGP      │◄────────────►│ OGP      │
    │ Daemon   │  Federation  │ Daemon   │
    │ (18790)  │              │ (18793)  │
    └──────────┘              └──────────┘
         │                           │
    Notify via                  Notify via
    webhook/CLI                 webhook
```

### Benefits
- **Platform independence**: Each platform manages its own federation
- **Config isolation**: Separate `~/.ogp-<platform>/` directories
- **No shared state**: Peers, projects, and config are per-instance
- **Local federation**: Two instances on same machine can federate

### Config Directory Structure
```
~/.ogp/                      # OpenClaw instance
  ├── config.json
  ├── keypair.json
  ├── peers.json
  └── daemon.pid

~/.ogp-hermes/              # Hermes instance
  ├── config.json
  ├── keypair.json
  ├── peers.json
  └── daemon.pid
```

## Running Multiple Instances

### Start OpenClaw OGP Daemon
```bash
# Uses default config from ~/.ogp/
ogp daemon start
```

### Start Hermes OGP Daemon
```bash
# Uses config from ~/.ogp-hermes/
OGP_HOME=~/.ogp-hermes node dist/cli/federation.js daemon start
```

### Test Notification Backends
```bash
# Test OpenClaw backend
node test-hermes-backend.js

# Test Hermes backend
OGP_HOME=~/.ogp-hermes node test-hermes-notify.mjs
```

## Configuration Files

### OpenClaw OGP (`~/.ogp/config.json`)
```json
{
  "daemonPort": 18790,
  "platform": "openclaw",
  "gatewayUrl": "https://ogp.sarcastek.com",
  "displayName": "David Proctor",
  "openclawUrl": "https://openclaw.sarcastek.com",
  "openclawToken": "...",
  "rendezvous": { "enabled": false }
}
```

### Hermes OGP (`~/.ogp-hermes/config.json`)
```json
{
  "daemonPort": 18793,
  "platform": "hermes",
  "gatewayUrl": "http://localhost:18793",
  "displayName": "David (Hermes Local)",
  "email": "david@example.com",
  "stateDir": "/Users/davidproctor/.ogp-hermes",
  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "ogp-test-secret-hermes-2026",
  "rendezvous": { "enabled": false }
}
```

### Hermes Gateway (`~/.hermes/config.yaml`)
```yaml
platforms:
  webhook:
    enabled: true
    port: 8644
    host: "127.0.0.1"
    routes:
      ogp_federation:
        secret: "ogp-test-secret-hermes-2026"
        events: ["*"]
        prompt: |
          📡 **OGP Federation Message**
          **From:** {{peer_display_name}} ({{peer_id}})
          **Intent:** {{intent}}
          {{#if topic}}**Topic:** {{topic}}{{/if}}
          ---
          {{message}}
        deliver: "telegram"
```

## Known Issues & Workarounds

### 1. Static Webhook Routes Not Loading
**Issue**: Routes defined in `~/.hermes/config.yaml` under `platforms.webhook.routes` don't load automatically.

**Workaround**: Use dynamic webhook subscription:
```bash
hermes webhook subscribe ogp_federation \
  --secret "ogp-test-secret-hermes-2026" \
  --events "*" \
  --deliver "telegram" \
  --prompt '📡 **OGP Federation Message**...'
```

### 2. Daemon Startup via CLI
**Issue**: The standard `ogp daemon start` command doesn't preserve `OGP_HOME` environment variable when spawning background process.

**Workaround**: Use the test script or direct invocation:
```bash
# Option 1: Use test script
OGP_HOME=~/.ogp-hermes node test-daemon-start.mjs &

# Option 2: Run in foreground during testing
OGP_HOME=~/.ogp-hermes node dist/cli/federation.js daemon start --foreground
```

### 3. Hermes Gateway Restart Required
**Issue**: Webhook platform doesn't start automatically on first config addition.

**Workaround**: Restart Hermes gateway after adding webhook configuration:
```bash
hermes gateway restart
```

## Next Steps

### For Testing
1. Set up federation between OpenClaw and Hermes instances
2. Send test messages both directions
3. Verify notification delivery to Telegram/configured channels
4. Test different intent types (message, agent-comms, project.*)

### For Production
1. Fix CLI daemon spawning to preserve OGP_HOME
2. Investigate why static webhook routes don't load in Hermes
3. Add proper LaunchAgent support for multi-instance setup
4. Document tunnel setup for each instance (cloudflared/ngrok)

### For Documentation
1. Add troubleshooting guide for multi-instance scenarios
2. Document federation setup between different platforms
3. Create example configs for common multi-platform setups
4. Add architecture diagrams showing message flow

## Backward Compatibility

### ✅ Verified
- Existing OpenClaw federation still works
- Default behavior unchanged (platform defaults to 'openclaw')
- Legacy config files work without modification
- No breaking changes to API or message format

### Migration Path
Existing OpenClaw users can continue without changes. To add Hermes:
1. Install Hermes
2. Create `~/.ogp-hermes/` directory
3. Copy config template and customize
4. Start Hermes OGP daemon with `OGP_HOME` set
5. Configure Hermes webhook platform
6. Test notification delivery

## Summary

The Hermes integration is **functionally complete** and **backward compatible**. The architecture supports running multiple OGP instances on the same machine, each with its own platform-specific notification backend. The main outstanding items are polish issues (CLI daemon spawning, static webhook routes) rather than core functionality.

**Status**: Ready for local testing and federation between OpenClaw and Hermes instances. ✅
