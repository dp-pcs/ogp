# Platform-Agnostic OGP Architecture

> Design principles and implementation plan for making OGP work with any AI assistant platform

## Executive Summary

OGP is designed to enable federation between AI assistants regardless of their underlying platform. The core protocol (Ed25519 signatures, peer management, scope enforcement) is platform-agnostic. Only the **notification mechanism** (how OGP communicates with the local agent) needs to be adapted per platform.

## Core Design Principle

**One OGP daemon instance per AI assistant instance.**

Each OGP daemon is:
- **Independent**: Own port, state directory, keypair, configuration
- **Platform-agnostic**: Core protocol implementation never changes
- **Notification-pluggable**: Backend adapter for communicating with local agent

This design allows:
- Multiple AI platforms to federate seamlessly
- Multiple OGP instances on the same machine (for testing or multi-agent setups)
- Easy addition of new platforms without modifying core protocol

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Core OGP Protocol (Platform-Agnostic)              │
│ - Ed25519 signing/verification                              │
│ - Peer management (peers.json)                              │
│ - Scope enforcement (Doorman)                               │
│ - Message routing (intent handlers)                         │
│ - HTTP endpoints (/federation/*, /.well-known/ogp)          │
│ - Rendezvous integration                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Notification Backend (Platform-Specific)           │
│                                                              │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│ │  OpenClaw    │  │   Hermes     │  │   Future     │       │
│ │  Backend     │  │   Backend    │  │   Platform   │       │
│ │              │  │              │  │   Backend    │       │
│ │ POST /hooks/ │  │ POST webhook │  │ POST /api/v1/│       │
│ │ agent        │  │ /ogp_fed     │  │ messages     │       │
│ └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Notification Backend System

### Current Implementation (OpenClaw-Only)

```typescript
// src/daemon/notify.ts
async function notifyOpenClaw(
  peerId: string,
  intent: string,
  payload: any
): Promise<void> {
  const openclawUrl = config.openclawUrl || "http://localhost:18789";
  const token = config.openclawToken;

  if (config.hooks?.enabled && config.openclawHooksToken) {
    // Method 1: Webhook (preferred)
    await fetch(`${openclawUrl}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openclawHooksToken}`
      },
      body: JSON.stringify({
        agentId: config.agentId,
        peerId,
        intent,
        topic: payload.topic,
        message: payload.message,
        notifyTarget: resolveNotifyTarget(config.agentId),
        timestamp: new Date().toISOString()
      })
    });
  } else {
    // Method 2: CLI fallback
    await execAsync(`openclaw system event --mode now`);
  }
}
```

### Proposed Refactor (Platform-Agnostic)

```typescript
// src/daemon/notify.ts

interface NotificationBackend {
  name: string;
  notify(context: NotificationContext): Promise<void>;
}

interface NotificationContext {
  peerId: string;
  peerDisplayName: string;
  intent: string;
  payload: any;
  timestamp: string;
}

class OpenClawBackend implements NotificationBackend {
  name = "openclaw";

  async notify(ctx: NotificationContext): Promise<void> {
    const url = config.openclawUrl || "http://localhost:18789";

    if (config.hooks?.enabled && config.openclawHooksToken) {
      await fetch(`${url}/hooks/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.openclawHooksToken}`
        },
        body: JSON.stringify({
          agentId: config.agentId,
          peerId: ctx.peerId,
          intent: ctx.intent,
          topic: ctx.payload.topic,
          message: ctx.payload.message,
          notifyTarget: resolveNotifyTarget(config.agentId),
          timestamp: ctx.timestamp
        })
      });
    } else {
      await execAsync(`openclaw system event --mode now`);
    }
  }
}

class HermesBackend implements NotificationBackend {
  name = "hermes";

  async notify(ctx: NotificationContext): Promise<void> {
    const webhookUrl = config.hermesWebhookUrl || "http://localhost:8644/webhooks/ogp_federation";
    const secret = config.hermesWebhookSecret;

    const body = {
      peer_id: ctx.peerId,
      peer_display_name: ctx.peerDisplayName,
      intent: ctx.intent,
      topic: ctx.payload.topic || "",
      message: ctx.payload.message || "",
      priority: ctx.payload.priority || "normal",
      conversation_id: ctx.payload.conversationId,
      timestamp: ctx.timestamp,
      ...ctx.payload
    };

    const signature = computeHMAC(JSON.stringify(body), secret);

    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${signature}`
      },
      body: JSON.stringify(body)
    });
  }
}

// Factory for backend selection
function getNotificationBackend(): NotificationBackend {
  const platform = config.platform || "openclaw";

  switch (platform) {
    case "openclaw":
      return new OpenClawBackend();
    case "hermes":
      return new HermesBackend();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

// Main notification entry point
export async function notifyLocalAgent(
  peerId: string,
  peerDisplayName: string,
  intent: string,
  payload: any
): Promise<void> {
  const backend = getNotificationBackend();

  await backend.notify({
    peerId,
    peerDisplayName,
    intent,
    payload,
    timestamp: new Date().toISOString()
  });
}
```

### Configuration Schema

```json
// ~/.ogp/config.json (OpenClaw instance)
{
  "daemonPort": 18790,
  "platform": "openclaw",
  "gatewayUrl": "https://alice-openclaw.example.com",
  "displayName": "Alice (OpenClaw)",
  "email": "alice@example.com",
  "stateDir": "~/.ogp",

  "openclawUrl": "http://localhost:18789",
  "openclawToken": "...",
  "openclawHooksToken": "...",
  "agentId": "main",
  "notifyTarget": "telegram:123456789",

  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

```json
// ~/.ogp-hermes/config.json (Hermes instance)
{
  "daemonPort": 18791,
  "platform": "hermes",
  "gatewayUrl": "https://alice-hermes.example.com",
  "displayName": "Alice (Hermes)",
  "email": "alice@example.com",
  "stateDir": "~/.ogp-hermes",

  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "shared-secret-here",

  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

## Multi-Instance Setup (Local Testing)

### Running Both OpenClaw and Hermes Locally

**Step 1: Configure Hermes Webhook**

```yaml
# ~/.hermes/config.yaml
platforms:
  webhook:
    enabled: true
    port: 8644
    host: "127.0.0.1"
    routes:
      ogp_federation:
        secret: "shared-secret-here"
        events: ["*"]  # Accept all OGP intents
        prompt: |
          📡 **OGP Federation Message**

          **From:** {{peer_display_name}} ({{peer_id}})
          **Intent:** {{intent}}
          {{#if topic}}**Topic:** {{topic}}{{/if}}
          {{#if priority}}**Priority:** {{priority}}{{/if}}

          {{message}}
        deliver: "telegram"  # Or wherever you want responses
        deliver_extra:
          chat_id: "your-telegram-chat-id"
```

**Step 2: Start OGP for OpenClaw (existing)**

```bash
# Uses ~/.ogp and port 18790
ogp start
```

**Step 3: Start OGP for Hermes (new instance)**

```bash
# Create separate state directory
mkdir -p ~/.ogp-hermes

# Create config (see above)
cat > ~/.ogp-hermes/config.json <<EOF
{
  "daemonPort": 18791,
  "platform": "hermes",
  "gatewayUrl": "http://localhost:18791",
  "displayName": "Alice (Hermes)",
  "email": "alice@example.com",
  "stateDir": "~/.ogp-hermes",
  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "shared-secret-here"
}
EOF

# Start second OGP daemon
OGP_STATE_DIR=~/.ogp-hermes ogp start --port 18791
```

**Step 4: Federate the Two Local Instances**

```bash
# From OpenClaw's OGP, request federation with Hermes's OGP
ogp federation request http://localhost:18791 --alias hermes-local

# From Hermes's OGP, approve the request
OGP_STATE_DIR=~/.ogp-hermes ogp federation approve <openclaw-peer-id>

# Now send a message from OpenClaw to Hermes
ogp federation send hermes-local message '{"text":"Hello from OpenClaw!"}'
```

The message will:
1. Leave OpenClaw's OGP (port 18790)
2. Arrive at Hermes's OGP (port 18791)
3. Be verified by Doorman
4. POST to Hermes webhook (port 8644)
5. Hermes processes and responds

### Why This Works

1. **Independent Keypairs**: Each OGP instance generates its own Ed25519 keypair
2. **Independent Peer Lists**: `~/.ogp/peers.json` vs `~/.ogp-hermes/peers.json`
3. **No Port Conflicts**: 18790 vs 18791
4. **Standard P2P Flow**: Same cryptographic verification as if they were remote

## Implementation Phases

### Phase 1: Sidecar Integration (Week 1)

**Goal:** Get Hermes working with OGP via webhook without modifying core protocol

**Tasks:**
1. ✅ Document architecture (this file)
2. Add Hermes notification backend to `src/daemon/notify.ts`
3. Add `platform` config field to config schema
4. Test with local multi-instance setup
5. Update CLI to support `OGP_STATE_DIR` environment variable

**Deliverables:**
- OGP works with both OpenClaw and Hermes
- Can run multiple instances simultaneously
- Documentation for setup

### Phase 2: Native Hermes Platform (Month 1-2)

**Goal:** Create Hermes platform adapter that speaks OGP natively

**Tasks:**
1. Create `~/.hermes/hermes-agent/gateway/platforms/ogp.py`
2. Implement Ed25519 crypto using Python `cryptography` library
3. Implement Doorman access control
4. Implement peer management (JSON storage)
5. Implement HTTP endpoints (`/.well-known/ogp`, `/federation/*`)
6. Test interoperability with Node.js OGP instances

**Deliverables:**
- Hermes can speak OGP without separate daemon
- Full protocol compatibility
- Performance benchmarks

### Phase 3: Protocol Standardization (Month 3+)

**Goal:** Formalize OGP as a true multi-platform standard

**Tasks:**
1. Extract protocol specification into standalone repo
2. Create reference test suite
3. Add protocol versioning and negotiation
4. Support for other platforms (claude-code, OpenHands, etc.)
5. Performance optimizations
6. Security audit

**Deliverables:**
- OGP protocol specification v1.0
- Reference implementations: Node.js, Python
- Compliance test suite

## Remote Federation (Typical Use Case)

When users are on different machines (the normal scenario):

```
┌─────────────────────────┐           ┌─────────────────────────┐
│ Alice's Machine         │           │ Bob's Machine           │
│                         │           │                         │
│ ┌─────────────────────┐ │           │ ┌─────────────────────┐ │
│ │ OGP Daemon          │◄├───────────┤►│ OGP Daemon          │ │
│ │ :18790              │ │  Internet │ │ :18790              │ │
│ │                     │ │  (HTTPS)  │ │                     │ │
│ │ Platform: OpenClaw  │ │           │ │ Platform: Hermes    │ │
│ └──────────┬──────────┘ │           │ └──────────┬──────────┘ │
│            │            │           │            │            │
│            ▼            │           │            ▼            │
│ ┌─────────────────────┐ │           │ ┌─────────────────────┐ │
│ │ OpenClaw Instance   │ │           │ │ Hermes Instance     │ │
│ │ :18789              │ │           │ │ Webhook :8644       │ │
│ └─────────────────────┘ │           │ └─────────────────────┘ │
└─────────────────────────┘           └─────────────────────────┘
```

**Key Point:** Alice doesn't need to know Bob uses Hermes. Bob doesn't need to know Alice uses OpenClaw. The OGP protocol is the same; only the local notification mechanism differs.

## Benefits of This Architecture

1. **True Platform Independence**: Core protocol never changes
2. **Easy Testing**: Can run multiple instances locally
3. **No Breaking Changes**: OpenClaw integration continues working unchanged
4. **Extensible**: Add new platforms by implementing notification backend
5. **Federation is P2P**: Each instance is independent, regardless of platform
6. **Router Analogy Holds**: Like routers running BGP regardless of vendor

## Security Considerations

### Running Multiple Local Instances

When running multiple OGP instances on the same machine:
- Each instance has its own keypair (different identities)
- Localhost federation is cryptographically identical to remote federation
- Useful for testing but not a security boundary
- Each instance can have different scope policies

### Production Deployment

For remote federation:
- Always use HTTPS tunnels (cloudflared, ngrok)
- Verify peer identity out-of-band before approval
- Use scope negotiation to limit what peers can access
- Monitor peer activity via agent-comms logs

## Next Steps

1. **Immediate:** Implement Hermes notification backend in `notify.ts`
2. **Week 1:** Test local multi-instance federation
3. **Week 2:** Document Hermes setup for OGP users
4. **Month 1:** Begin native Hermes platform adapter
5. **Month 2:** Interoperability testing
6. **Month 3:** Protocol specification v1.0

## Questions & Answers

**Q: Will adding Hermes support break OpenClaw integration?**
A: No. The changes are additive (new notification backend). OpenClaw continues using the existing backend.

**Q: Can I federate OpenClaw and Hermes on the same machine?**
A: Yes! Run two OGP instances with different ports and state directories.

**Q: Do I need to run separate OGP daemons for different platforms?**
A: Yes, in the multi-instance model. Each agent instance gets its own OGP daemon. This keeps federation truly P2P.

**Q: What if I want one OGP daemon to notify multiple platforms?**
A: Not recommended. The clean architecture is one daemon per agent. Multi-platform notification adds complexity and breaks the P2P model.

**Q: How does this scale to future platforms (Anthropic Claude, OpenHands, etc.)?**
A: Add a new notification backend class. The core protocol stays unchanged.

**Q: Can the native Hermes adapter replace the sidecar?**
A: Eventually, yes. The native adapter implements the full OGP protocol in Python, eliminating the need for the Node.js daemon.

---

**Last Updated:** 2026-04-04
**OGP Version:** 0.2.31
**Status:** Design Document
