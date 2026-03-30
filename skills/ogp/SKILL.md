---
skill_name: ogp
version: 2.1.0
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

## Known Peers

| Name | Peer ID | Gateway URL |
|------|---------|-------------|
| Stanislav | giving-produces-microphone-mild.trycloudflare.com:18790 | https://giving-produces-microphone-mild.trycloudflare.com |
| Clawporate (David) | david-proctor.gw.clawporate.elelem.expert:3001 | https://david-proctor.gw.clawporate.elelem.expert |

> Peer IDs can change when tunnel URLs rotate. Always verify with `ogp federation list`.
> **Prefer the invite flow (v0.2.15+)** for new connections — no URL or peer ID needed.

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

## Federation Management

### List all peers
```bash
ogp federation list
ogp federation list --status pending
ogp federation list --status approved
```

### Request federation with a new peer
```bash
ogp federation request <peer-gateway-url> [peer-id]
# Example:
ogp federation request https://giving-produces-microphone-mild.trycloudflare.com stanislav
```

### Approve an inbound federation request
```bash
# Auto-grants default scopes (message, agent-comms, project.*)
ogp federation approve <peer-id>

# Or approve with specific custom scopes:
ogp federation approve <peer-id> --intents "message,agent-comms,project.join,project.contribute,project.query,project.status"
```

> **Note:** As of OGP 0.2.7, `federation approve` automatically grants default scopes bidirectionally.
> Both sides get full scopes in a single handshake — no manual grant step needed.

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
ogp federation agent giving-produces-microphone-mild.trycloudflare.com:18790 project-coordination "Stan, join Project Synapse: ogp project join synapse 'Project Synapse' --create"
```

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
4. Done — no URL, no pubkey, no manual config
```

### Old way — manual URL exchange (still works)
```
1. Get peer's gateway URL (they share it with you)
2. Check their card: curl -s <url>/.well-known/ogp | python3 -m json.tool
3. Request federation: ogp federation request <url>
4. They approve on their side (or you approve if they requested)
5. Confirm scopes: ogp federation scopes <peer-id>
6. Test: ogp federation ping <url>
7. (Optional) Create or join a shared project
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
| `Send failed` on agent-comms | Scope not granted or topic not allowed | Check `ogp federation scopes <peer-id>` |
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
| `~/.ogp/config.json` | Gateway config (URL, email, port) |
| `~/.ogp/keypair.json` | Ed25519 signing keypair |
| `~/.ogp/peers.json` | All federation peers + scopes |
| `~/.ogp/projects.json` | Local project data + contributions |
| `~/.ogp/daemon.log` | Daemon logs |
| `~/.ogp/activity.log` | Intent activity log |

---

## Design Notes

- **Scopes are bilateral:** Each side independently grants what the other can call. OGP 0.2.7+ auto-grants defaults on approval.
- **Project isolation:** Projects are scoped to their member list. Full mesh federation does NOT give all peers access to all projects. A peer only sees projects they are a member of.
- **Signatures:** All federation messages are signed with Ed25519. Peer's public key is stored in `peers.json` at federation time.
- **Tunnel URLs rotate:** If using Cloudflare/ngrok tunnels, peer IDs (hostname:port) change when tunnels restart. Use the invite flow instead to avoid this entirely.
- **Rendezvous is optional:** Peers with a static IP or existing tunnel continue working unchanged. Rendezvous is an additional discovery path, not a requirement.
