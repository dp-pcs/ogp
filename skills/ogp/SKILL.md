---
skill_name: ogp
version: 2.3.0
description: >
  OGP (Open Gateway Protocol) — federated agent communication, peer management,
  and project collaboration across OpenClaw and Hermes gateways. Use when the user
  asks to establish federation with a peer, send agent-to-agent messages, check peer
  status, manage federation scopes, clean stale federation state, set up cross-gateway
  project collaboration, or use the rendezvous/invite flow for zero-config peer discovery.
trigger: Use when the user asks to federate with a peer, connect to another gateway,
  send an OGP message, check peer status, grant scopes, manage OGP federation relationships,
  generate an invite code, or accept a federation invite.
requires:
  bins:
    - ogp
  state_paths:
    - ~/.ogp-meta/config.json
    - ~/.ogp/config.json
    - ~/.ogp/peers.json
    - ~/.ogp-hermes/config.json
    - ~/.ogp-hermes/peers.json
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---

## Prerequisites

OGP must be installed and running:

```bash
npm install -g @dp-pcs/ogp
ogp setup          # interactive first-time setup
ogp config show    # verify enabled frameworks + default
ogp start          # starts the default framework
ogp status         # verify daemon is running
```

If `ogp: command not found`, install it first.

---

## Framework Selection (Mandatory in Multi-Framework Setups)

When more than one framework is enabled, always choose the correct one explicitly:

```bash
ogp --for openclaw status
ogp --for hermes status
ogp --for openclaw federation list
ogp --for hermes federation list
```

- `openclaw` usually uses `~/.ogp`
- `hermes` usually uses `~/.ogp-hermes`
- `ogp config show` is the first command to run if the active framework is unclear

If you are testing unreleased changes from a local repo checkout, prefer the local CLI:

```bash
node dist/cli.js --for openclaw status
node dist/cli.js --for hermes federation list
```

---

## Canonical Public Endpoint Rule

Use one canonical public gateway URL per framework. The recommended production setup is a stable HTTPS hostname, typically behind a named Cloudflare tunnel or other reverse proxy.

- Keep `gatewayUrl` pointed at the stable public hostname
- Do not leave stale temporary tunnel residue in config
- Verify the public discovery card matches the local framework you intend to use

```bash
curl -s https://ogp.example.com/.well-known/ogp
curl -s https://hermes.example.com/.well-known/ogp
```

The public key on each discovery card must match the intended framework identity. If two frameworks advertise the same key unexpectedly, stop and fix framework selection/state isolation before federating.

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
ogp --for openclaw federation list
ogp --for openclaw federation list --status pending
ogp --for hermes federation list --status approved
```

### Request federation with a new peer
```bash
ogp --for <framework> federation request <peer-gateway-url> [--alias <name>]
# Example:
ogp --for openclaw federation request https://hermes.example.com --alias apollo

# Alias auto-resolves from gateway's display name if omitted:
ogp --for openclaw federation request https://hermes.example.com
```

### Approve an inbound federation request
```bash
# Auto-grants scopes that mirror peer's offered intents (symmetric federation)
ogp --for hermes federation approve <peer-id>

# Or approve with specific custom scopes (asymmetric):
ogp --for hermes federation approve <peer-id> --intents "message,agent-comms,project.join,project.contribute,project.query,project.status"
```

> **Note (OGP 0.2.24+):** Peer IDs are now public key prefixes (e.g., `302a300506032b65`). 
> **Intent Negotiation:** Approval automatically mirrors the intents the peer offered, creating symmetric capabilities by default. Both sides can call the same intents on each other.

### Grant or update scopes for an existing peer
```bash
ogp --for openclaw federation grant <peer-id> --intents "message,agent-comms,project.join,project.contribute,project.query,project.status"
```

### Check what scopes are granted to/from a peer
```bash
ogp --for openclaw federation scopes <peer-id>
# Shows:
# - GRANTED TO PEER (what they can call on your gateway)
# - RECEIVED FROM PEER (what you can call on theirs)
```

### Ping a peer
```bash
ogp --for openclaw federation ping <peer-gateway-url>
```

### Send a raw federation message
```bash
ogp --for openclaw federation send <peer-id> <intent> '<json-payload>'
```

### Send an agent-to-agent message (agent-comms)
```bash
ogp --for openclaw federation agent <peer-id> <topic> "<message>"
# Example:
ogp --for openclaw federation agent apollo general "Hey, can you check on project synapse?"
```

### Manage agent-comms policies (what topics you'll respond to)

Federation scopes and agent-comms policies are **two separate layers**. Approval handles scopes automatically. Agent-comms policies control what your agent actually responds to — `general` is auto-enabled at approval, everything else is `off` by default.

```bash
# Status page — shows what's allowed, blocked, and what to do about it
ogp --for openclaw agent-comms policies <peer-id>

# Global view of all peers
ogp --for openclaw agent-comms policies

# Allow a topic
ogp --for openclaw agent-comms add-topic <peer-id> <topic> --level summary

# Block a topic
ogp --for openclaw agent-comms set-topic <peer-id> <topic> off

# Open all topics by default for a peer
ogp --for openclaw agent-comms set-default <peer-id> summary

# View activity log
ogp --for openclaw agent-comms activity [peer-id]
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
5. Test: ogp --for <framework> federation agent <peer-id> general "hello"
```

### Old way — manual URL exchange (still works)
```
1. Get peer's gateway URL (they share it with you)
2. Check their card: curl -s <url>/.well-known/ogp | python3 -m json.tool
3. Request federation: ogp --for <framework> federation request <url>
4. They approve on their side (or you approve if they requested)
   → Scopes auto-granted + "general" topic auto-enabled ✓
5. Check agent-comms status: ogp --for <framework> agent-comms policies <peer-id>
6. Add more topics if needed: ogp --for <framework> agent-comms add-topic <peer-id> <topic>
7. Test: ogp --for <framework> federation ping <url>
8. Test agent-comms: ogp --for <framework> federation agent <peer-id> general "hello"
9. (Optional) Create or join a shared project
```

---

## Project Collaboration (via OGP)

For full project management, use the `ogp-project` skill. Quick reference:

```bash
# Create a project
ogp --for openclaw project create <id> "<name>" --description "<description>"

# Invite a peer to join
ogp --for openclaw project request-join <peer-id> <project-id> "<project-name>"

# Log a contribution
ogp --for openclaw project contribute <project-id> <type> "<summary>"
# Types: progress, decision, blocker, context, idea, context.description, context.repository

# Query project activity
ogp --for openclaw project query <project-id> [--type <type>] [--limit 10]
ogp --for openclaw project status <project-id>

# Query a peer's project data
ogp --for openclaw project query-peer <peer-id> <project-id>
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
| Daemon not running | Process died or wrong framework selected | `ogp config show`, then `ogp --for <framework> start --background` |
| Public discovery card shows the wrong identity | Wrong framework home or stale daemon | Stop daemons, verify `ogp config show`, restart each framework explicitly with `--for` |
| Peer list is obviously stale or cross-contaminated | Wrong framework state file or old federation residue | Back up then clear the relevant `peers.json` for the affected framework and re-form federation |

### Check OGP daemon status
```bash
ogp config show
ogp --for openclaw status
ogp --for hermes status
# Or check the logs:
tail -f ~/.ogp/daemon.log
tail -f ~/.ogp-hermes/daemon.log
```

### Restart the daemon
```bash
ogp --for openclaw stop
ogp --for openclaw start --background
ogp --for hermes stop
ogp --for hermes start --background
```

### Clean federation state for one framework
```bash
cp ~/.ogp/peers.json ~/.ogp/peers.json.backup.$(date +%Y%m%d-%H%M%S)
printf '[]\n' > ~/.ogp/peers.json

cp ~/.ogp-hermes/peers.json ~/.ogp-hermes/peers.json.backup.$(date +%Y%m%d-%H%M%S)
printf '[]\n' > ~/.ogp-hermes/peers.json
```

---

## State Files

| File | Purpose |
|------|---------|
| `~/.ogp-meta/config.json` | Enabled frameworks, aliases, and default framework |
| `~/.ogp/config.json` | OpenClaw gateway config |
| `~/.ogp-hermes/config.json` | Hermes gateway config |
| `~/.ogp/keypair.json` | OpenClaw public key file (private key is in Keychain on macOS) |
| `~/.ogp-hermes/keypair.json` | Hermes public key file |
| `~/.ogp/peers.json` | OpenClaw federation peers + scopes |
| `~/.ogp-hermes/peers.json` | Hermes federation peers + scopes |
| `~/.ogp/projects.json` | OpenClaw project data + contributions |
| `~/.ogp-hermes/projects.json` | Hermes project data + contributions |
| `~/.ogp/daemon.log` | OpenClaw daemon log |
| `~/.ogp-hermes/daemon.log` | Hermes daemon log |
| `~/.ogp/activity.log` | OpenClaw agent-comms activity log |
| `~/.ogp-hermes/activity.log` | Hermes agent-comms activity log |

---

## Design Notes

- **Peer Identity (OGP 0.2.24+):** Peers are identified by the first 16 characters of their Ed25519 public key (e.g., `302a300506032b65`). This is stable even when tunnel URLs rotate — the public key is the identity, the URL is just the address.
- **Framework isolation matters:** In multi-framework mode, OpenClaw and Hermes must keep distinct state directories, keypairs, peers, projects, and logs. Always use `--for` when the active framework is not obvious.
- **Intent Negotiation (OGP 0.2.24+):** Federation requests include `offeredIntents`. Approval automatically mirrors those intents back to the requester, creating symmetric capabilities by default.
- **Scopes are bilateral:** Each side independently grants what the other can call. OGP 0.2.24+ auto-mirrors offered intents on approval.
- **Project isolation:** Projects are scoped to their member list. Full mesh federation does NOT give all peers access to all projects. A peer only sees projects they are a member of.
- **Signatures:** All federation messages are signed with Ed25519. Peer's public key is stored in `peers.json` at federation time.
- **Rendezvous is optional:** Peers with a static IP or existing tunnel continue working unchanged. Rendezvous is an additional discovery path, not a requirement.
- **Notification Routing:** The `notifyTargets` config enables multi-agent setups where different agents handle different types of federation messages.
- **Stable public URLs win:** Use a canonical public hostname per framework. Treat ephemeral tunnel URLs as temporary diagnostics, not long-term identity.
