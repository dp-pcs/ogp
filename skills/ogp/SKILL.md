---
skill_name: ogp
version: 2.2.1
description: >
  OGP (Open Gateway Protocol) — federated agent communication, peer management,
  and project collaboration across OpenClaw gateways. Use when the user asks to
  establish federation with a peer, send agent-to-agent messages, check peer status,
  manage federation scopes, set up cross-gateway project collaboration, or use the
  rendezvous/invite flow for zero-config peer discovery.
trigger: Use when the user asks to federate with a peer, connect to another gateway,
  send an OGP message, check peer status, grant scopes, manage OGP federation relationships,
  generate an invite code, or accept a federation invite.
requires:
  bins:
    - ogp
  state_paths:
    - ~/.ogp/config.json
    - ~/.ogp/peers.json
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---

## Prerequisites

OGP must be installed and running:

```bash
npm install -g @dp-pcs/ogp
ogp setup          # interactive first-time setup
ogp start          # starts the OGP daemon
ogp status         # verify daemon is running
```

If `ogp: command not found`, install it first.

---

## Known Peers (OGP 0.2.24+)

| Peer ID | Name | Gateway URL |
|---------|------|-------------|
| `302a300506032b65` | Stanislav | Dynamic — use invite flow |
| `738064beab1ef8eb` | Clawporate (David) | https://david-proctor.gw.clawporate.elelem.expert |

> **Peer IDs are public key prefixes (first 16 chars).** They never change, even when tunnel URLs rotate. Gateway URL is just the address — the public key is the identity.

---

## Zero-Config Federation (v0.2.14+) ⭐ PREFERRED

The rendezvous server (`rendezvous.elelem.expert`) enables peer discovery by public key.
No port forwarding, no tunnel accounts, no manual URL sharing.

### Invite flow (easiest — v0.2.15+)

**To invite a peer (you generate the code):**
```bash
ogp federation invite
# Output: Your invite code: a3f7k2  (expires in 10 minutes)
# Share this with your peer — they run: ogp federation accept a3f7k2
```

**To accept a peer's invite:**
```bash
ogp federation accept <token>
# Output: Connected to a3f7k2... via rendezvous ✅
```

### Connect by public key (v0.2.14+)
```bash
ogp federation connect <pubkey>
# Looks up peer's current IP:port from rendezvous, connects directly
```

### Enable rendezvous in config
Add to `~/.ogp/config.json`:
```json
{
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```
When enabled, your daemon auto-registers on startup and heartbeats every 30 seconds.

---

## Configuration

### Agent ID (v0.2.28+)

The `agentId` field identifies which OpenClaw agent owns this OGP gateway. During `ogp setup`, the wizard auto-discovers available agents from your OpenClaw configuration:

```
Available agents:
  1. 🦝 Junior (main)
  2. ✍️ Scribe (scribe)
  3. ⚡ Optimus (optimus)

Which agent owns this gateway? (number or ID) [1]:
```

**Example config with agentId:**
```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "gatewayUrl": "https://your-gateway.example.com",
  "displayName": "Alice",
  "email": "alice@example.com",
  "stateDir": "~/.ogp",
  "agentId": "main"
}
```

### Notification Routing — notifyTargets (v0.2.28+)

The `notifyTargets` field enables per-agent notification routing. When OGP sends notifications to your OpenClaw instance, it routes to specific agents based on the message context.

**Configuration fields:**
- **`notifyTarget`** (legacy, string): Single notification target for all messages. Maintained for backward compatibility.
- **`notifyTargets`** (object): Map of agent names to notification targets. Example: `{"main": "telegram:...", "scribe": "telegram:..."}`

**Example configuration with multiple agents:**

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "gatewayUrl": "https://your-gateway.example.com",
  "displayName": "Alice",
  "email": "alice@example.com",
  "stateDir": "~/.ogp",
  "agentId": "main",
  "notifyTarget": "telegram:123456789",
  "notifyTargets": {
    "main": "telegram:123456789",
    "scribe": "telegram:987654321",
    "optimus": "telegram:555666777"
  }
}
```

**Resolution priority:**

When routing notifications, OGP resolves the target in this order:

1. **`notifyTargets[agent]`** — If the agent is specified and exists in `notifyTargets`, use that target
2. **`notifyTarget`** — Fall back to the legacy single target for backward compatibility
3. **Default** — If neither is set, the notification is sent without a specific target (OpenClaw routes to the default channel)

This allows you to:
- Route federation messages to different agents based on context
- Maintain backward compatibility with existing single-agent setups
- Gradually migrate to multi-agent routing without breaking existing configurations

---

## Federation Management

### List all peers
```bash
ogp federation list
ogp federation list --status pending
ogp federation list --status approved
```

### Request federation with a new peer
```bash
ogp federation request <peer-gateway-url> [--alias <name>]
# Example with alias:
ogp federation request https://giving-produces-microphone-mild.trycloudflare.com --alias stanislav

# Alias auto-resolves from gateway's display name if omitted:
ogp federation request https://giving-produces-microphone-mild.trycloudflare.com
```

### Approve an inbound federation request
```bash
# Auto-grants scopes that mirror peer's offered intents (symmetric federation)
ogp federation approve <peer-id>

# Or approve with specific custom scopes (asymmetric):
ogp federation approve <peer-id> --intents "message,agent-comms,project.join,project.contribute,project.query,project.status"
```

> **Note (OGP 0.2.24+):** Peer IDs are now public key prefixes (e.g., `302a300506032b65`). 
> **Intent Negotiation:** Approval automatically mirrors the intents the peer offered, creating symmetric capabilities by default. Both sides can call the same intents on each other.

### Grant or update scopes for an existing peer
```bash
ogp federation grant <peer-id> --intents "message,agent-comms,project.join,project.contribute,project.query,project.status"
```

### Check what scopes are granted to/from a peer
```bash
ogp federation scopes <peer-id>
# Shows:
# - GRANTED TO PEER (what they can call on your gateway)
# - RECEIVED FROM PEER (what you can call on theirs)
```

### Ping a peer
```bash
ogp federation ping <peer-gateway-url>
```

### Send a raw federation message
```bash
ogp federation send <peer-id> <intent> '<json-payload>'
```

### Send an agent-to-agent message (agent-comms)
```bash
ogp federation agent <peer-id> <topic> "<message>"
# Example:
ogp federation agent stanislav general "Hey, can you check on project synapse?"
```

### Manage agent-comms policies (what topics you'll respond to)

Federation scopes and agent-comms policies are **two separate layers**. Approval handles scopes automatically. Agent-comms policies control what your agent actually responds to — `general` is auto-enabled at approval, everything else is `off` by default.

```bash
# Status page — shows what's allowed, blocked, and what to do about it
ogp agent-comms policies <peer-id>

# Global view of all peers
ogp agent-comms policies

# Allow a topic
ogp agent-comms add-topic <peer-id> <topic> --level summary

# Block a topic
ogp agent-comms set-topic <peer-id> <topic> off

# Open all topics by default for a peer
ogp agent-comms set-default <peer-id> summary

# View activity log
ogp agent-comms activity [peer-id]
```

Response levels: `full` (full content passed to agent), `summary` (condensed), `escalate` (route to user), `off` (blocked — sender gets a witty non-answer)

---

## Scope Reference

| Scope | What it allows |
|-------|---------------|
| `message` | Basic gateway-to-gateway messages |
| `agent-comms` | Agent-to-agent messages (natural language) |
| `project.join` | Peer can join your projects |
| `project.contribute` | Peer can push contributions to your projects |
| `project.query` | Peer can query your project data |
| `project.status` | Peer can check your project status |

Default grant includes all of the above. Customize with `--intents` if needed.

---

## Federation Workflow

### New way — invite flow (v0.2.15+, recommended)
```
1. Run: ogp federation invite → get a 6-char code
2. Share the code with your peer (Telegram, Slack, etc.)
3. They run: ogp federation accept <code>
4. Scopes auto-granted + "general" topic auto-enabled ✓
5. Test: ogp federation agent <peer-id> general "hello"
```

### Old way — manual URL exchange (still works)
```
1. Get peer's gateway URL (they share it with you)
2. Check their card: curl -s <url>/.well-known/ogp | python3 -m json.tool
3. Request federation: ogp federation request <url>
4. They approve on their side (or you approve if they requested)
   → Scopes auto-granted + "general" topic auto-enabled ✓
5. Check agent-comms status: ogp agent-comms policies <peer-id>
6. Add more topics if needed: ogp agent-comms add-topic <peer-id> <topic>
7. Test: ogp federation ping <url>
8. Test agent-comms: ogp federation agent <peer-id> general "hello"
9. (Optional) Create or join a shared project
```

---

## Project Collaboration (via OGP)

For full project management, use the `ogp-project` skill. Quick reference:

```bash
# Create a project
ogp project create <id> "<name>" --description "<description>"

# Invite a peer to join
ogp project request-join <peer-id> <project-id> "<project-name>"

# Log a contribution
ogp project contribute <project-id> <topic> "<summary>"
# Topics: progress, decision, blocker, context, idea, context.description, context.repository

# Query project activity
ogp project query <project-id> [--topic <topic>] [--limit 10]
ogp project status <project-id>

# Query a peer's project data
ogp project query-peer <peer-id> <project-id>
```

---

## Troubleshooting

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Peer not found` | Not yet federated | Run `ogp federation request <url>` |
| `Peer not approved` | Request pending | Check `ogp federation list --status pending` |
| `400 Bad Request` on push | Peer hasn't granted you scopes | Ask peer to run `ogp federation grant <your-peer-id>` or update to OGP 0.2.7 |
| `Invalid signature` | Version mismatch on `messageStr` field | Peer needs OGP 0.2.7+ (`npm install -g @dp-pcs/ogp@latest`) |
| `Send failed` on agent-comms | Topic blocked on receiver's side | Receiver runs `ogp agent-comms policies <peer-id>` — look for blocked/missing topics |
| Agent-comms silently ignored | Receiver's default is `off`, topic not allowed | Receiver runs `ogp agent-comms add-topic <your-peer-id> <topic> --level summary` |
| `ogp: command not found` | Not installed | `npm install -g @dp-pcs/ogp` |
| Daemon not running | Process died | `ogp start --background` |

### Check OGP daemon status
```bash
ogp status
# Or check the log:
tail -f ~/.ogp/daemon.log
```

### Restart the daemon
```bash
pkill -f "node.*ogp"
ogp start --background
```

---

## State Files

| File | Purpose |
|------|---------|
| `~/.ogp/config.json` | Gateway config (URL, email, port, notifyTargets, agentId) |
| `~/.ogp/keypair.json` | Ed25519 signing keypair |
| `~/.ogp/peers.json` | All federation peers + scopes |
| `~/.ogp/projects.json` | Local project data + contributions |
| `~/.ogp/daemon.log` | Daemon logs |
| `~/.ogp/activity.log` | Intent activity log |

---

## Design Notes

- **Peer Identity (OGP 0.2.24+):** Peers are identified by the first 16 characters of their Ed25519 public key (e.g., `302a300506032b65`). This is stable even when tunnel URLs rotate — the public key is the identity, the URL is just the address.
- **Intent Negotiation (OGP 0.2.24+):** Federation requests include `offeredIntents`. Approval automatically mirrors those intents back to the requester, creating symmetric capabilities by default.
- **Scopes are bilateral:** Each side independently grants what the other can call. OGP 0.2.24+ auto-mirrors offered intents on approval.
- **Project isolation:** Projects are scoped to their member list. Full mesh federation does NOT give all peers access to all projects. A peer only sees projects they are a member of.
- **Signatures:** All federation messages are signed with Ed25519. Peer's public key is stored in `peers.json` at federation time.
- **Rendezvous is optional:** Peers with a static IP or existing tunnel continue working unchanged. Rendezvous is an additional discovery path, not a requirement.
- **Notification Routing:** The `notifyTargets` config enables multi-agent setups where different agents handle different types of federation messages.
