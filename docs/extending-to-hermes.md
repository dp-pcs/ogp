# Extending OGP to Hermes

> Guide for integrating the Open Gateway Protocol (OGP) with the Hermes AI agent runtime.

## Overview

This document describes how OGP — originally designed as a companion daemon for OpenClaw — can be extended to work with **Hermes**, a different AI agent runtime architecture. It covers the architectural differences between OpenClaw and Hermes, and provides three implementation paths for OGP federation support in Hermes-based deployments.

**📚 Quick Links:**
- **[Platform-Agnostic Architecture](./platform-agnostic-architecture.md)** - Design principles and long-term vision
- **[Local Testing Guide](./hermes-local-testing.md)** - Step-by-step setup for testing with both platforms on the same machine

**✨ Key Insight:** OGP is platform-agnostic by design. The core protocol (Ed25519, Doorman, scopes) never changes. Only the notification mechanism (how OGP talks to the local agent) adapts per platform. This means OpenClaw and Hermes can federate seamlessly, even when running on the same machine for testing.

---

## Current OGP Architecture (OpenClaw Model)

In the original OpenClaw deployment, OGP operates as a **sidecar daemon**:

```
┌─────────────────────────────────────────────┐
│  Host Machine (Mac, server, cloud VM)      │
│                                             │
│  ┌──────────────┐    ┌─────────────────┐   │
│  │ OGP Daemon   │◄──►│  OpenClaw Agent │   │
│  │  (port 18790)│    │  (port 18789)   │   │
│  │              │    │                 │   │
│  │ • Ed25519    │    │ • AI runtime    │   │
│  │ • Doorman    │    │ • Receives OGP  │   │
│  │ • Peer mgmt  │    │   messages via  │   │
│  │ • Web server │    │   webhook POST  │   │
│  └──────┬───────┘    └─────────────────┘   │
│         │                                   │
│         ▼ (HTTPS/Tunnel)                    │
│    [Internet] ◄──► Other OGP Peers          │
└─────────────────────────────────────────────┘
```

**Key components:**
- **OGP Daemon** (`@dp-pcs/ogp`): Node.js HTTP server handling federation
- **OpenClaw Agent**: Separate AI runtime listening on port 18789
- **Integration method**: HTTP POST to `/hooks/agent` or CLI `openclaw system event`
- **Separation of concerns**: OGP handles cryptography, signatures, and peer management; OpenClaw handles AI processing

---

## How Hermes Differs from OpenClaw

Hermes is an integrated AI assistant runtime with a fundamentally different architecture:

| Aspect | OpenClaw | Hermes |
|--------|----------|--------|
| **Structure** | Separate OGP daemon + OpenClaw agent | Single integrated runtime |
| **OGP Integration** | Daemon calls OpenClaw via HTTP/CLI | Would need OGP built-in or sidecar |
| **Communication** | Webhook to `/hooks/agent` | Direct function call or sidecar |
| **"Gateway" concept** | OGP daemon *is* the gateway | Hermes would *be* the gateway |
| **Agent API** | HTTP listener on port 18789 | Conversational/runtime-native |
| **Deployment** | Two processes (daemon + agent) | One process (agent runtime) |

**Critical difference**: Hermes doesn't expose an HTTP API for external systems to push messages to the agent. It's a conversational runtime that responds to user input — not a daemon listening for webhooks.

---

## Integration Options

Three approaches are available for adding OGP federation to Hermes:

### Option 1: Sidecar Daemon (Closest to OpenClaw Model)

Run the existing OGP daemon alongside Hermes, with IPC or local HTTP communication:

```
┌─────────────────────────────────────────────┐
│  Hermes Host Runtime                       │
│                                             │
│  ┌──────────────┐    ┌─────────────────┐    │
│  │ OGP Daemon   │◄──►│  Hermes Core    │    │
│  │  (port 18790)│    │  (the agent)    │   │
│  │              │    │                 │    │
│  │ Same Node.js │    │ • Local HTTP    │    │
│  │ codebase...  │    │   endpoint or   │    │
│  │              │    │   IPC channel   │    │
│  └──────┬───────┘    └─────────────────┘    │
│         │                                   │
│         ▼                                   │
│    Federation with other OGP Peers          │
└─────────────────────────────────────────────┘
```

**What needs building:**
1. **Hermes local HTTP endpoint** (or IPC handler): A lightweight endpoint in Hermes that receives OGP messages from the daemon
2. **Modified `notifyHermes()`**: Replace `notifyOpenClaw()` in OGP's `src/daemon/notify.ts` to POST to Hermes's local endpoint
3. **Message unpacking**: Hermes receives OGP-wrapped messages and presents them to the user/conversation
4. **State storage**: Hermes needs to store `peers.json`, `config.json`, `keypair.json` (or delegate to OGP daemon)

**Pros:**
- Reuse existing OGP codebase unchanged
- Clear separation of concerns
- Can upgrade OGP independently

**Cons:**
- Two processes to manage
- IPC complexity
- Hermes needs an HTTP listener (may conflict with its architecture)

---

### Option 2: Built-in OGP Module

Port OGP functionality directly into Hermes as a native module:

```
┌─────────────────────────────────────────────┐
│  Hermes Runtime                             │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  Built-in OGP Module                    ││
│  │  • Ed25519 signing/verification         ││
│  │  • Doorman scope enforcement            ││
│  │  • Peer management (JSON storage)       ││
│  │  • HTTP server (port 18790)             ││
│  └────────────┬────────────────────────────││
│               │                             │
│  ┌────────────▼────────────────────────────┐│
│  │  Hermes Agent Core                      ││
│  │  • Direct function call on OGP messages ││
│  │  • No HTTP/webhook layer               ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**What needs building:**
1. **Port OGP daemon code**: Convert Node.js/TypeScript OGP implementation to Hermes's native language (likely Python)
2. **HTTP server**: Add a listener (if Hermes doesn't already have one) for federation messages
3. **Replace `notifyOpenClaw()`**: Direct function call or internal event bus instead of HTTP POST
4. **Storage layer**: Implement `peers.json`, `config.json`, `projects.json` in Hermes's storage system
5. **CLI equivalents**: Map `ogp federation *` commands to Hermes-native commands or config

**Pros:**
- Single process
- Direct function calls (no HTTP overhead)
- Simpler deployment
- Native feel for Hermes users

**Cons:**
- Significant porting effort (Node.js → Python/Go/Rust)
- Maintenance burden (keeping ported code in sync with upstream OGP)
- May duplicate work if Hermes already has some components

---

### Option 3: OGP-Compatible Gateway Interface

Hermes implements the OGP *protocol* but with a native implementation:

**What this means:**
- Hermes speaks OGP wire format (Ed25519 signatures, JSON message schema, `/.well-known/ogp` endpoint)
- Hermes implements the Doorman scope checks
- Hermes manages peer relationships
- But: implementation is native to Hermes's architecture and language

**What needs building:**
1. **Ed25519 signing/verification**: Implement in Hermes's native language (libraries available in Python, Go, Rust, etc.)
2. **Doorman logic**: Port the 6-step access check algorithm
3. **Peer storage**: JSON file or database storage for peers
4. **HTTP endpoints**: `/.well-known/ogp`, `/federation/request`, `/federation/approve`, `/federation/message`
5. **Scope management**: Grant, check, and enforce scope bundles
6. **Rendezvous support**: Optional integration with `rendezvous.elelem.expert`

**Pros:**
- Native to Hermes architecture
- Optimized for Hermes's language and patterns
- No dependency on Node.js/TypeScript

**Cons:**
- Most work — essentially reimplementing OGP
- Risk of protocol drift if not kept in sync
- Testing burden (ensuring compatibility with existing OGP peers)

---

## Key Components Required

Regardless of which option is chosen, Hermes needs these capabilities:

### 1. Ed25519 Keypair Management

**Storage**: `~/.ogp/keypair.json` (or Hermes-native location)

```json
{
  "publicKey": "a1b2c3d4e5f6...",
  "privateKey": "e5f6a1b2c3d4..."
}
```

**Requirements:**
- Generate Ed25519 keypair on first setup
- 32-byte public key, 64-byte private key
- DER format, hex-encoded
- Used for signing all outgoing messages, verifying incoming

### 2. Peer Storage

**Storage**: `~/.ogp/peers.json`

```json
{
  "peers": [
    {
      "id": "a1b2c3d4e5f6g7h8",
      "displayName": "Alice (Colorado)",
      "gatewayUrl": "https://abc123.ngrok.io",
      "publicKey": "a1b2c3d4...",
      "email": "alice@example.com",
      "status": "approved",
      "grantedScopes": {
        "version": "0.2.0",
        "intents": [...]
      }
    }
  ]
}
```

**Requirements:**
- Atomic writes (write to temp file, rename)
- O(1) lookup by peer ID (hash map)
- Store scope grants per peer

### 3. Doorman Access Check

The 6-step validation that runs on every incoming message:

1. **Peer lookup**: Find peer by ID or public key
2. **Approval check**: Verify status === 'approved'
3. **Scope bundle**: Retrieve granted scopes
4. **Intent grant**: Check intent is in granted scopes
5. **Topic coverage**: Verify topic matches allowed topics (for agent-comms)
6. **Rate limit**: Check sliding window rate limit

**Reference**: See `src/daemon/doorman.ts` in OGP codebase.

### 4. Message Handler

Routes validated messages to the agent:

| Intent | Action |
|--------|--------|
| `message` | Simple notification |
| `agent-comms` | Route to agent with topic + priority |
| `project.join` | Add peer to project |
| `project.contribute` | Log contribution |
| `project.query` | Return project data |
| `project.status` | Return project status |

**Reference**: See `src/daemon/message-handler.ts`.

### 5. Rendezvous Integration (Optional)

For zero-config peer discovery:

```json
{
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

**Behavior:**
- Auto-register on startup (POST `/register`)
- 30-second heartbeat (keeps registration alive)
- Auto-deregister on shutdown
- Peers can connect by public key alone

---

## Recommended Approach

**For fastest integration**: Use **Option 1 (Sidecar Daemon)**

1. Run the existing `@dp-pcs/ogp` npm package unchanged
2. Add a lightweight HTTP endpoint to Hermes (or use stdin/stdout IPC)
3. Modify OGP's `notify.ts` to POST to Hermes instead of OpenClaw
4. Hermes unpacks OGP messages and presents them to the user

**For cleanest long-term architecture**: Use **Option 3 (Native Implementation)**

1. Implement Ed25519, Doorman, and message handling natively in Hermes
2. Expose OGP-compatible HTTP endpoints
3. Use Hermes's native storage for peers/config
4. Compatible with all existing OPG peers

---

## Message Flow: Hermes Receiving an OGP Message

```
1. Remote peer sends signed message to Hermes's gateway URL
   POST /federation/message
   Body: { message: {...}, signature: "..." }

2. Hermes's OGP layer (sidecar or built-in) receives request
   
3. Doorman validates:
   - Signature verification (Ed25519)
   - Peer lookup (must be approved)
   - Scope check (intent + topic)
   - Rate limit

4. If valid, route to Hermes agent:
   - Sidecar: HTTP POST to Hermes local endpoint
   - Built-in: Direct function call

5. Hermes agent processes:
   - Unpack OGP metadata
   - Present to user: "[OGP Agent-Comms] Alice → project-planning: ..."
   - Handle reply if interactive policy

6. Optional: Send reply back via replyTo callback
```

---

## Configuration for Hermes

Hermes would need an OGP configuration section:

```json
{
  "ogp": {
    "enabled": true,
    "daemonPort": 18790,
    "gatewayUrl": "https://your-tunnel.example.com",
    "displayName": "David (Hermes)",
    "email": "david@example.com",
    "rendezvous": {
      "enabled": true,
      "url": "https://rendezvous.elelem.expert"
    },
    "responsePolicies": [
      {"topic": "project-planning", "level": "interactive"},
      {"topic": "*", "level": "notifications-only"}
    ]
  }
}
```

---

## Compatibility Checklist

For Hermes to federate with existing OGP peers:

- [ ] Ed25519 signatures verify correctly
- [ ] `/.well-known/ogp` endpoint returns correct JSON
- [ ] Peer ID derived from first 16 chars of public key
- [ ] Accepts `federation/request` and `federation/approve` endpoints
- [ ] Validates `timestamp` within ±5 minutes (replay protection)
- [ ] Supports `agent-comms` intent with topic routing
- [ ] Supports `project.*` intents for collaboration
- [ ] Implements sliding window rate limiting
- [ ] Sends and receives signed `replyTo` callbacks
- [ ] Compatible with rendezvous server (optional)

---

## References

- OGP Repository: `https://github.com/dp-pcs/ogp`
- OGP NPM Package: `@dp-pcs/ogp`
- Key files in OGP:
  - `src/daemon/server.ts` — HTTP server and federation endpoints
  - `src/daemon/doorman.ts` — Access control and scope validation
  - `src/daemon/message-handler.ts` — Intent routing
  - `src/daemon/notify.ts` — Integration with OpenClaw (reference for Hermes)
  - `src/shared/signing.ts` — Ed25519 implementation
  - `src/daemon/peers.ts` — Peer storage

---

## Multi-Instance Architecture (Testing & Production)

### Can OpenClaw and Hermes Coexist?

**Yes, absolutely.** You can run both on the same machine without conflicts:

**Instance 1: OGP for OpenClaw**
- Port: 18790
- State: `~/.ogp`
- Notifies: OpenClaw via HTTP webhook
- Public URL: Via tunnel or rendezvous

**Instance 2: OGP for Hermes**
- Port: 18791 (different!)
- State: `~/.ogp-hermes` (separate keypair, peers, config)
- Notifies: Hermes via webhook adapter
- Public URL: Via tunnel or rendezvous

Each instance is completely independent with its own Ed25519 keypair, peer list, and configuration.

### Can They Federate Locally?

**Yes!** For testing, you can federate the two local instances:

```bash
# From OpenClaw's OGP
ogp federation request http://localhost:18791 --alias hermes-local

# From Hermes's OGP
OGP_STATE_DIR=~/.ogp-hermes ogp federation approve <openclaw-peer-id>

# Send a message from OpenClaw to Hermes
ogp federation send hermes-local message '{"text":"Hello from OpenClaw!"}'
```

The message will:
1. Leave OpenClaw's OGP (port 18790)
2. Arrive at Hermes's OGP (port 18791)
3. Be verified cryptographically (as if remote)
4. POST to Hermes webhook (port 8644)
5. Hermes processes and responds

**This proves the architecture is truly platform-agnostic.** The protocol doesn't care if peers are local or remote, OpenClaw or Hermes.

### Will This Break OpenClaw?

**No.** The changes are purely additive:
- Add `platform` field to config (defaults to "openclaw")
- Add Hermes notification backend alongside OpenClaw backend
- OpenClaw instances continue using the existing notification path
- No breaking changes to core protocol

See [Platform-Agnostic Architecture](./platform-agnostic-architecture.md) for implementation details.

## Typical Use Case (Remote Federation)

While local testing is useful, the normal scenario is:

```
Alice (Remote) ─────── Internet ─────── Bob (Remote)
   OpenClaw                                Hermes
   OGP :18790                             OGP :18790
```

**Key point:** Alice doesn't need to know Bob uses Hermes. Bob doesn't need to know Alice uses OpenClaw. The OGP protocol is the same; only the local notification mechanism differs.

This is exactly like BGP routers - Cisco and Juniper routers speak the same protocol, even though their internal implementations differ.

## Questions?

This is a living document. As Hermes integration progresses, update with:
- Specific Hermes API endpoints for message intake
- Storage conventions for Hermes-native deployments
- Any protocol extensions or adaptations needed

**For immediate next steps, see:**
- [Local Testing Guide](./hermes-local-testing.md) - Set up both platforms on your Mac
- [Platform-Agnostic Architecture](./platform-agnostic-architecture.md) - Long-term design vision
