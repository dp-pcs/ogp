# Open Gateway Protocol (OGP)

[![npm version](https://img.shields.io/npm/v/@dp-pcs/ogp)](https://www.npmjs.com/package/@dp-pcs/ogp)
[![npm downloads](https://img.shields.io/npm/dt/@dp-pcs/ogp)](https://www.npmjs.com/package/@dp-pcs/ogp)
[![license](https://img.shields.io/npm/l/@dp-pcs/ogp)](./LICENSE)

**OGP is a federation protocol for AI agent gateways.** It lets two gateways, owned by different people or organizations, establish a trusted peer relationship — with human approval, cryptographic identity, scoped permissions, and unilateral revocability — so their agents can communicate directly without any central authority.

> 🚧 **Active build — releasing daily.** Check the [changelog](https://github.com/dp-pcs/ogp/releases) or `npm show @dp-pcs/ogp version` for the latest. Read the articles behind this build at [Trilogy AI Center of Excellence](https://trilogyai.substack.com).

---

## The Problem

AI assistants are siloed. When David's agent needs to collaborate with Cosmo's agent — on a legal document, an insurance authorization, a shared project — the only option today is copy-paste between conversations. There is no protocol for two AI systems owned by different people to establish a trusted, scoped, revocable relationship.

Existing protocols solve adjacent problems:

| Protocol | Layer | What it solves |
|---|---|---|
| **MCP** | Application | LLM ↔ tool integration within a single agent's trust boundary |
| **A2A** | Middleware | Task delegation between agents inside an organization |
| **ANP** | Internet | Open-web agent discovery and P2P execution (public marketplaces) |
| **ActivityPub** | Application | Federated social content delivery between servers |
| **OGP** | Gateway | **Cross-org bilateral trust between AI gateways, human-approved** |

OGP does not compete with any of these. It federates the gateways that agents using other protocols sit behind.

---

## The Design

OGP is modeled on BGP — the protocol that governs routing policy between autonomous networks on the internet. The mapping is precise:

| BGP concept | OGP equivalent |
|---|---|
| Autonomous System (AS) | Individual gateway (identified by Ed25519 public-key prefix) |
| OPEN message | `GET /.well-known/ogp` |
| Session establishment | `request` → human approval → `approve` callback |
| Route policy / filters | Per-peer scope grants (intents, rate limits, topics) |
| MD5 session authentication | Ed25519 per-message signatures |
| Route dampening | Sliding-window rate limiting in the Doorman |
| BGP WITHDRAW | `federation remove` — signed tear-down notification |
| Neighbor states | `init` → `twoWay` → `established` → `degraded` → `down` → `tombstoned` |

**A2A is HTTP — request/response between services. OGP is BGP — trust and policy between autonomous systems owned by different parties.**

### Four Design Principles

1. **Decentralized.** No central registry. You share your gateway URL out-of-band. The protocol handles everything from there.
2. **Policy-driven.** Every relationship has explicit, bilateral scope. Nothing flows without a configured policy on both ends.
3. **Human-gated.** Trust is established once, by a human, at the gateway boundary. Federation cannot be automated or bypassed.
4. **Unilaterally revocable.** Either party can remove the other at any time. Revocation is immediate, signed, and tombstoned — preventing silent re-trust.

### Trust Architecture

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│       Gateway A (David)         │         │       Gateway B (Cosmo)         │
│  publicKey: 302a300506032b65... │         │  publicKey: 1a2b3c4d5e6f7890... │
│                                 │         │                                 │
│  ┌──────────┐  ┌─────────────┐  │         │  ┌──────────┐  ┌─────────────┐  │
│  │  Junior  │  │  Sterling   │  │         │  │  Cosmo   │  │  agents...  │  │
│  │  (main)  │  │  (finance)  │  │         │  │  (main)  │  │             │  │
│  └────┬─────┘  └─────────────┘  │         │  └────┬─────┘  └─────────────┘  │
│       └──── intra-gateway ──────┤         ├───────┴── intra-gateway ────────┤
│                                 │         │                                 │
│  OGP Policy:                    │         │  OGP Policy:                    │
│  • Cosmo: scope=agent-comms     │◄──OGP──►│  • David: scope=agent-comms     │
│         + project.contribute    │  signed │         + project.contribute    │
│  • Rate: 100/3600 per intent    │messages │  • Rate: 100/3600 per intent    │
│  • Auth: Ed25519 per message    │         │  • Auth: Ed25519 per message    │
│                                 │         │                                 │
└─────────────────────────────────┘         └─────────────────────────────────┘

  The gateway is the trust boundary. Agents never leave their own gateway.
  Both sides independently control what the other can request.
```

The gateway is the trust boundary. A compromised peer agent cannot directly access your agent's tools, memory, or context — it can only send signed intents that your gateway's Doorman validates against your configured policy.

### Three-Layer Scope Model

```
Layer 1: Gateway Capabilities  → What I CAN support  (advertised at /.well-known/ogp)
Layer 2: Peer Negotiation      → What I WILL grant YOU  (set at approval time)
Layer 3: Runtime Enforcement   → Is THIS request within YOUR granted scope  (Doorman)
```

```bash
# Approve with granular access control
ogp federation approve cosmo \
  --intents agent-comms,project.contribute \
  --topics project-updates,signal \
  --rate 100/3600

# cosmo can send: ✓
ogp federation agent david project-updates "What's the status on the auth system?"

# cosmo cannot send: ✗ 403 Topic not allowed
ogp federation agent david personal-finances "What's your budget?"
```

### Federation Lifecycle

Every peer relationship follows an OSPF-inspired state machine:

```
[no peer]  → init        (federation request received or sent)
init       → twoWay      (peer approved)
twoWay     → established (first bidirectional health check succeeds)
established→ degraded    (one direction fails threshold)
established→ down        (both directions fail)
any        → tombstoned  (peer rejected or removed)
tombstoned → init        (peer re-federates as fresh pending record)
```

---

## What This Package Does

OGP ships as a companion daemon that runs alongside your AI framework on a separate port. It handles:

- **Cryptographically signed peer-to-peer messaging** using Ed25519 (every message, no exceptions)
- **Peer relationship management** (request, approve, reject, remove)
- **Three-layer scope enforcement** via the Doorman (capability → grant → runtime)
- **Agent-to-agent communication** with topic routing and delegated-authority response levels
- **Identity attribution** — separate human and agent names with snapshot history (v0.5.0+)
- **Project collaboration** — signed contributions with stable ULIDs, verifiable across the federation (v0.6.0+, v0.8.0+)
- **Multi-agent personas** — multiple local agents per gateway (v0.7.0+)
- **Transport independence** — direct, relay, and future P2P transports (v0.10.0+)
- **OGP Apps** — declarative peer-distributed capability bundles with consent gating
- **Public tunnel support** (cloudflared/ngrok) via `ogp tunnel`
- **Optional macOS LaunchAgent** for automatic startup

---

## Prerequisites

- **Node.js 18 or higher**
- **An AI agent framework with a gateway** — the reference implementation supports OpenClaw and Hermes. Any framework that accepts webhooks works.
- **A public HTTPS endpoint** for your gateway (cloudflared tunnel, ngrok, VPS, or cloud deploy)

---

## Installation

```bash
npm install -g @dp-pcs/ogp
```

Install OGP skills for Claude Code:

```bash
ogp-install-skills
```

Verify installed skill versions after upgrade:

```bash
rg -n '^version:' ~/.openclaw/skills/ogp*/SKILL.md ~/.claude/skills/ogp*/SKILL.md 2>/dev/null
```

### Shell Completion

```bash
ogp completion install            # auto-detects shell (bash or zsh)
ogp completion install zsh        # explicit
```

After installing, open a new terminal or `source` your shell rc. Use `ogp <Tab>` to explore commands, `ogp federation <Tab>` for federation subcommands, etc.

**Context-sensitive help:**

```bash
ogp help                  # top-level commands
ogp federation help       # federation commands
ogp config '?'            # config subcommands
```

---

## Quick Start

### 1. Setup

```bash
ogp setup
```

The wizard detects installed frameworks and prompts for:
- Framework selection (OpenClaw, Hermes, or standalone)
- Agent ID (auto-discovers from framework config)
- Daemon port (default: 18790)
- Public gateway URL
- Display name and email
- Rendezvous (optional discovery layer)
- Human delivery target and inbound federation policy

### 2. Make Your Gateway Reachable

Peers need to reach your gateway over the internet. See [Making Your Gateway Reachable](#making-your-gateway-reachable) below for cloudflared, ngrok, and VPS options.

### 3. Start the Daemon

```bash
ogp start --background
```

### 4. Federate with a Peer

**Invite flow (recommended, v0.2.15+):**

```bash
# You generate a code, share it with your peer
ogp federation invite
# → Your invite code: a3f7k2  (expires in 10 minutes)

# Your peer runs:
ogp federation accept a3f7k2
```

**Manual URL exchange:**

```bash
ogp federation request https://peer.example.com --alias cosmo
# They approve, then:
ogp federation agent cosmo general "Hello from David"
```

### 5. Multi-Framework

When multiple frameworks are configured, use `--for`:

```bash
ogp --for openclaw federation list
ogp --for hermes status
ogp config set-default openclaw   # set default so --for is optional
ogp --for all start --background  # start all daemons
```

---

## Making Your Gateway Reachable

For OGP federation to work, peers need to reach your gateway over the internet.

### Option 1: Cloudflare Named Tunnel (Recommended — Free, Permanent URL)

```bash
cloudflared tunnel login
cloudflared tunnel create ogp
cloudflared tunnel route dns ogp ogp.yourdomain.com

cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID_FROM_STEP_2>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: ogp.yourdomain.com
    service: http://localhost:18790
  - service: http_status:404
EOF

cloudflared service install
# Edit ~/.ogp/config.json: "gatewayUrl": "https://ogp.yourdomain.com"
ogp start --background
```

### Option 2: ngrok

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
ngrok http 18790
# Copy the HTTPS URL, set as gatewayUrl in ~/.ogp/config.json
```

### Option 3: Cloudflare Quick Tunnel (Testing Only — URL Changes on Restart)

```bash
cloudflared tunnel --url http://localhost:18790
```

### Option 4: Port Forwarding

Forward port 18790 on your router to your machine. Set `gatewayUrl` to `http://YOUR_PUBLIC_IP:18790`. Use HTTPS tunnels in preference to this.

---

## All Commands

All commands support `--for <framework>` to select which framework configuration to use. Use `--for all` to run across all configured frameworks.

### Daemon Management

| Command | Description |
|---------|-------------|
| `ogp setup` | Interactive setup wizard |
| `ogp start [--background]` | Start daemon (foreground or background) |
| `ogp stop` | Stop the daemon |
| `ogp status` | Show daemon status and configuration |

### Tunnel Management

| Command | Description |
|---------|-------------|
| `ogp tunnel list` | List running tunnels and reconcile against `gatewayUrl` |
| `ogp tunnel start cloudflared` | Start a Cloudflare quick tunnel |
| `ogp tunnel start ngrok` | Start an ngrok tunnel |
| `ogp tunnel stop` | Stop the OGP-managed tunnel |

### System Integration (macOS)

| Command | Description |
|---------|-------------|
| `ogp install` | Install LaunchAgent for auto-start on login |
| `ogp uninstall` | Remove LaunchAgent |

### Configuration Management

| Command | Description |
|---------|-------------|
| `ogp config list` | List all configured frameworks |
| `ogp config set-default <framework>` | Set default framework |
| `ogp config enable <framework>` | Enable a framework |
| `ogp config disable <framework>` | Disable a framework |
| `ogp config show` | Show current configuration |
| `ogp config list-agents` | List local personas for the active framework (v0.7.0+) |
| `ogp config show-identity` | Show current identity + personas |

### Identity Management

OGP separates human operators from agents. This matters for attribution in project contributions and for multi-agent setups.

| Command | Description |
|---------|-------------|
| `ogp config show-identity` | Show current identity configuration |
| `ogp config set-identity --human-name "Name"` | Set human operator name |
| `ogp config set-identity --agent-name "Name"` | Set agent name |
| `ogp config set-identity --organization "Org"` | Set organization |
| `ogp config set-tags work production` | Set tags (replaces existing) |
| `ogp config add-tag <tag>` | Add a single tag |
| `ogp config remove-tag <tag>` | Remove a single tag |

```bash
ogp config set-identity \
  --human-name "David Proctor" \
  --agent-name "Junior" \
  --organization "Trilogy"
```

### Federation Management

| Command | Description |
|---------|-------------|
| `ogp federation list [--status pending\|approved]` | List peers |
| `ogp federation list --tag <tag>` | Filter peers by tag |
| `ogp federation request <url> [--alias <name>]` | Request federation |
| `ogp federation approve <peer-id> [options]` | Approve with optional scope grants |
| `ogp federation reject <peer-id>` | Reject a request |
| `ogp federation remove <peer-id>` | Remove a peer (asymmetric tear-down) |
| `ogp federation alias <peer-id> <alias>` | Set friendly alias |
| `ogp federation tag <peer-id> <tags...>` | Add tags to a peer |
| `ogp federation untag <peer-id> <tags...>` | Remove tags from a peer |
| `ogp federation send <peer-id> <intent> <json>` | Send a raw message |
| `ogp federation scopes <peer-id>` | Show scope grants |
| `ogp federation grant <peer-id> [options]` | Update scope grants |
| `ogp federation agent <peer-id> <topic> <message>` | Send agent-comms message |
| `ogp federation ping <peer-url>` | Test connectivity |
| `ogp federation invite` | Generate a short-lived invite code (v0.2.15+) |
| `ogp federation accept <token>` | Accept an invite (v0.2.15+) |
| `ogp federation connect <pubkey>` | Connect by public key via rendezvous (v0.2.14+) |

### Scope Options (v0.2.0+)

When approving or granting scopes:
- `--intents <list>` — comma-separated intents (e.g., `message,agent-comms,project.contribute`)
- `--rate <limit>` — rate limit as requests/window-seconds (e.g., `100/3600`)
- `--topics <list>` — topics for agent-comms (e.g., `general,project-updates`)

### Intent Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp intent register <name> [options]` | Register a custom intent handler |
| `ogp intent list` | List all registered intents |
| `ogp intent remove <name>` | Remove a registered intent |

### Project Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp project create <id> <name> [options]` | Create a new project |
| `ogp project join <id> [name]` | Join an existing project |
| `ogp project list` | List all projects |
| `ogp project contribute <id> <type> <summary>` | Add a signed contribution |
| `ogp project query <id> [options]` | Query contributions |
| `ogp project status <id>` | Show project status |
| `ogp project request-join <peer> <id> <name>` | Request to join peer's project |
| `ogp project send-contribution <peer> <id> <type> <summary>` | Send contribution to peer |
| `ogp project query-peer <peer> <id>` | Query peer's project |
| `ogp project status-peer <peer> <id>` | Get peer's project status |
| `ogp project delete <id>` | Delete a project |
| `ogp project add-owner <id> <peer-key>` | Grant ownership (owners only) |
| `ogp project claim-ownership <id>` | Claim a pre-existing project |
| `ogp project owners <id>` | List project owners |

### Agent-Comms Policy Management (v0.2.0+)

| Command | Description |
|---------|-------------|
| `ogp agent-comms interview` | Re-run delegated-authority / human-delivery interview |
| `ogp agent-comms policies [peer-id]` | Show response policies |
| `ogp agent-comms configure [peer-ids] [options]` | Configure response policies |
| `ogp agent-comms add-topic <peer> <topic> [options]` | Add topic policy |
| `ogp agent-comms remove-topic <peer> <topic>` | Remove topic policy |
| `ogp agent-comms reset <peer>` | Reset peer to defaults |
| `ogp agent-comms activity [peer]` | Show activity log |
| `ogp agent-comms default <level>` | Set default response level |
| `ogp agent-comms logging <on\|off>` | Enable/disable logging |

---

## Federation Examples

```bash
# Request federation (alias auto-resolves from /.well-known/ogp)
ogp federation request https://peer.example.com

# Approve with scope grants
ogp federation approve cosmo \
  --intents message,agent-comms,project.contribute \
  --rate 100/3600 \
  --topics general,project-updates

# View peer scopes
ogp federation scopes cosmo

# Send agent-comms message
ogp federation agent cosmo general "Hey, status on that PR?"

# Send with priority and wait for reply
ogp federation agent cosmo project-updates \
  "What decisions were made on the auth system?" \
  --priority high \
  --wait \
  --timeout 60000

# Remove a peer (unilateral; they receive a signed notification)
ogp federation remove cosmo
```

---

## Project Examples (v0.2.0+)

```bash
# Create a project
ogp project create signal "Signal AI CoE Hub" \
  --description "Federated knowledge hub for the AI Center of Excellence"

# Log contributions (every contribution is Ed25519-signed with a stable ULID)
ogp project contribute signal progress "Completed authentication system"
ogp project contribute signal decision "Using PostgreSQL for persistence"
ogp project contribute signal blocker "Waiting for API key approval"

# Query project
ogp project status signal
ogp project query signal --limit 10 --type decision

# Collaborate with peers
ogp project send-contribution cosmo signal progress "Deployed staging environment"
ogp project query-peer cosmo signal --limit 5
```

---

## How Federation Works

### Single Framework

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon  │◄────────│   Remote    │
│  :18789     │  webhook│  :18790      │  signed │   Peer      │
│             │         │              │ message │  (OGP)      │
└─────────────┘         └──────────────┘         └─────────────┘
```

### Multi-Framework

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  OpenClaw   │◄────────│  OGP Daemon      │◄────────│   Remote    │
│  :18789     │  webhook│  :18790          │  signed │   Peer      │
└─────────────┘         │ (~/.ogp-openclaw)│ message │  (OGP)      │
                        └──────────────────┘         └─────────────┘
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Hermes    │◄────────│  OGP Daemon      │◄────────│   Remote    │
│  :18792     │  webhook│  :18793          │  signed │   Peer      │
└─────────────┘         │ (~/.ogp-hermes)  │ message │  (OGP)      │
                        └──────────────────┘         └─────────────┘
                                 ▲
                        ┌──────────────────┐
                        │   Meta Config    │
                        │ (~/.ogp-meta/)   │
                        └──────────────────┘
```

### Federation Flow

1. **Discovery** — Peer discovers your gateway via `/.well-known/ogp` or an invite code
2. **Request** — Peer sends a signed federation request
3. **Approval** — A human approves (or rejects) at the receiving gateway
4. **Messaging** — Approved peers send Ed25519-signed messages
5. **Doorman** — Every message is validated against the peer's granted scopes and rate limits
6. **Delivery** — Valid messages are forwarded to the local agent via `POST /hooks/agent`

---

## Key Features In Depth

### Signed Project Contributions (v0.8.0+)

Every project contribution is signed by its author. When you `ogp project contribute`, the CLI mints a sortable **ULID**, builds a canonical record (`id, projectId, authorId, entryType, summary, metadata, timestamp`), and signs it with your Ed25519 key. The same signed envelope is used for the local store and every peer the contribution is pushed to, so a contribution keeps one stable ID across the whole federation.

On receipt, the daemon verifies three things at the authentication layer: the signature is valid, the signed `authorId` matches the federation-authenticated sender, and the signed `projectId` matches the target project. Unsigned live contributions are rejected (`400`); bad, forged, or mismatched signatures are rejected (`401`). `authorId` is the Ed25519 public key — no separate key distribution is needed.

### Delegated-Authority Precedence (v0.4.2+)

Policy evaluation for inbound messages follows a fixed 7-layer precedence chain (most general → most specific):

1. Legacy `inboundFederationPolicy` mode (safety fallback)
2. Global default rule
3. Peer-specific default rule
4. Global message-class rule (`agent-work`, `human-relay`, `approval-request`, `status-update`)
5. Peer message-class override
6. Global topic-level rule
7. Peer topic-level override

More specific rules always win. Peer defaults cannot erase class or topic safeguards.

```bash
# Re-run the delegated-authority interview at any time
ogp agent-comms interview
```

### Default-Deny Agent-Comms (v0.2.9+)

```bash
ogp agent-comms default off   # block everything not explicitly allowed
ogp agent-comms configure --global --topics "general,project-updates" --level summary
```

When a topic hits `off`, the daemon returns a cryptographically signed rejection (`{ status: "rejected", reason: "topic-not-permitted" }`) rather than silently dropping. The sender knows the topic is blocked.

### Identity Snapshots (v0.6.0+)

```bash
ogp config set-identity --human-name "David Proctor" --agent-name "Junior"

ogp project contribute signal progress "Completed auth system"
ogp project query signal
# [2026-06-23 14:00:00] David Proctor (Junior)
#   progress: Completed auth system
```

Identity is captured at contribution time. If you later rename your agent, historical contributions stay attributed to the name that made them.

### Project Ownership (v0.9.0+)

The creator is the root owner (established by a signed creation record). Additional owners are added via signed grants that any peer can verify independently. Pre-existing projects can be claimed by an existing member.

```bash
ogp project create signal "Signal Hub"   # you become root owner
ogp project add-owner signal <peer-key>  # grant ownership (owners only)
ogp project owners signal                # list all owners
```

---

## Agent-Comms Response Policies

| Level | Behavior |
|-------|----------|
| `full` | Respond openly, share details |
| `summary` | High-level responses only |
| `escalate` | Ask human before responding |
| `deny` | Politely decline |
| `off` | Default-deny: send signed rejection, do not process |

```bash
ogp agent-comms policies                          # view all policies
ogp agent-comms configure cosmo \
  --topics "project-updates,signal" \
  --level full --notes "Trusted collaborator"
ogp agent-comms add-topic cosmo finance --level escalate
ogp agent-comms activity cosmo --last 20
```

When a message arrives, your agent receives the policy level in metadata:

```
[OGP Agent-Comms] Cosmo → project-updates [FULL]: What's the status on the auth system?
```

---

## Rendezvous — Optional Discovery Layer (v0.2.14+)

Rendezvous is an optional convenience service for pubkey lookup and short invite codes. It does **not** provide NAT traversal or message relay — it only stores connection hints.

```json
{
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert",
    "publicUrl": "https://your-gateway.example.com"
  }
}
```

Your daemon auto-registers on startup and heartbeats every 30 seconds. Registrations expire after 90 seconds without a heartbeat.

### Invite Flow (v0.2.15+)

```bash
ogp federation invite
# → Your invite code: a3f7k2  (expires in 10 minutes)

# Peer runs:
ogp federation accept a3f7k2
# → Connected to a3f7k2... via rendezvous ✅
```

Tokens are non-consuming — multiple peers can accept the same invite within the TTL window.

### Privacy

Rendezvous stores only: public key, IP address, port, and last-seen timestamp. No message content passes through it. Public instance: `https://rendezvous.elelem.expert`. Self-hostable:

```bash
cd packages/rendezvous && npm install && npm run build
PORT=3000 node dist/index.js
```

---

## Configuration

`~/.ogp/config.json`:

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "gatewayUrl": "https://your-gateway.example.com",
  "displayName": "David Proctor",
  "email": "david@example.com",
  "stateDir": "~/.ogp",
  "agentId": "main",
  "humanDeliveryTarget": "telegram:123456789",
  "inboundFederationPolicy": {
    "mode": "summarize"
  },
  "notifyTargets": {
    "main": "telegram:123456789",
    "scribe": "telegram:987654321"
  },
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

### Human Delivery Preferences (v0.4.2+)

Two separate questions for inbound federation traffic:

1. **Where should human-facing followups go?** → `humanDeliveryTarget`
2. **How should the agent behave?** → `inboundFederationPolicy.mode`

Supported modes: `forward` · `summarize` · `autonomous` · `approval-required`

### Notification Routing (v0.2.28+)

Resolution priority: `humanDeliveryTarget` → `notifyTargets[agentId]` → `notifyTarget` → framework default.

### Multi-Framework Config

Configurations are isolated per framework:
- `~/.ogp-meta/config.json` — enabled frameworks, aliases, and default
- `~/.ogp/config.json` — OpenClaw gateway config
- `~/.ogp-hermes/config.json` — Hermes gateway config

### Environment Variables

- `OGP_PUBLIC_URL` — override IP detection for rendezvous (cloud/ECS gateways)
- `OGP_KEYPAIR_SECRET` — encryption secret for private key at rest (non-macOS)
- `OGP_META_HOME` — override the meta-config directory location

### State Files

| File | Purpose |
|------|---------|
| `~/.ogp/keypair.json` | Public key cache (macOS: private key lives in Keychain) |
| `~/.ogp/peers.json` | Federated peers + scope grants |
| `~/.ogp/intents.json` | Intent registry |
| `~/.ogp/projects.json` | Projects and contributions |
| `~/.ogp/agent-comms-config.json` | Response policies and activity log |
| `~/.ogp/apps.json` | Installed OGP Apps registry |

On macOS, deleting `keypair.json` alone does **not** rotate gateway identity — the private key lives in Keychain. Use `ogp setup --reset-keypair` for intentional rotation.

---

## OGP Apps

OGP Apps are declarative bundles (`ogp-app.json`) that describe a piece of software in terms of the OGP capabilities it uses — what intents it fires, what skills it installs into your AI agent, and where its output lives. Apps are discovered through your federation: peers advertise the apps they publish, you browse and install them with a consent gate.

### App Manifest (`ogp-app.json`)

```json
{
  "schemaVersion": 1,
  "id": "signal",
  "name": "Signal",
  "version": "1.0.0",
  "description": "Federated AI-CoE knowledge hub",
  "uses_intents": ["project.contribute", "project.query"],
  "uses_projects": ["signal"],
  "installs_skills": [
    { "name": "signal-contribute", "install": "scripts/install-signal-contribute.sh" }
  ],
  "published_output": "https://aicoe.elelem.expert",
  "publisher": {
    "name": "Trilogy AI CoE",
    "key": "<ed25519-pubkey-hex>"
  }
}
```

Get your public key: `ogp whoami --json | jq .publicKey`

### Publishing and Installing

```bash
# Publish
ogp app install file:/path/to/my-app-dir   # validate + register locally
ogp app advertise my-app                   # expose to approved peers

# Discover and install (as a peer)
ogp app browse                             # see all peers' apps
ogp app install peer:<peerId>/<appId>      # consent gate shows scripts + intents first
ogp app install peer:<peerId>/<appId> --yes  # skip prompt for automation

# Manage
ogp app list
ogp app show <appId>
ogp app usage [appId]
ogp app remove <appId>
```

The consent gate shows exactly which install scripts will run and which intents the app calls — nothing executes until you confirm.

### Companion App (GUI)

The [OGP Companion app](./ogp-companion/) provides a desktop UI for the full Apps workflow:

- **Gallery tab** — browse apps advertised by your peers
- **Installed tab** — manage installed apps sorted by name, date, or usage
- **Usage tab** — attributed intent call counts per app
- **Consent modal** — same consent gate as the CLI before install

---

## Message Format

```json
{
  "message": {
    "intent": "agent-comms",
    "from": "302a300506032b65...",
    "to": "1a2b3c4d5e6f7890...",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-06-23T14:00:00Z",
    "payload": {
      "topic": "project-updates",
      "text": "What decisions were made on the auth system?"
    }
  },
  "signature": "a1b2c3d4..."
}
```

### Default Intents

| Intent | Description |
|--------|-------------|
| `message` | Simple text message |
| `agent-comms` | Agent-to-agent communication with topic routing |
| `project.contribute` | Send a signed project contribution |
| `project.query` | Query peer's project contributions |
| `project.status` | Get peer's project status |
| `task-request` | Request peer to perform a task |
| `status-update` | Status update from a peer |

Custom intents: `ogp intent register <name>`

---

## Peer Identity: Aliases vs Public Key IDs

| Identifier | Purpose | Example |
|------------|---------|---------|
| **Public Key ID** | Cryptographic identity (stable, used in messages) | `302a300506032b65...` |
| **Alias** | User-friendly name for CLI convenience | `cosmo`, `alice` |

OGP auto-resolves aliases from the peer's `displayName` in `/.well-known/ogp`. Change an alias with `ogp federation alias <peer-id> <new-alias>`.

The `--petname` flag is deprecated — use `--alias`. Existing `petname` fields in `peers.json` are auto-migrated on daemon startup.

---

## Skills (Claude Code)

| Skill | Purpose |
|-------|---------|
| `ogp` | Core protocol: federation setup, peer management, messaging |
| `ogp-expose` | Tunnel setup: cloudflared/ngrok configuration |
| `ogp-agent-comms` | Delegated-authority interview + response policy wizard |
| `ogp-project` | Project context management and peer coordination |

```bash
ogp-install-skills   # install or upgrade all skills
```

---

## Security

**Cryptographic guarantees:**
- Ed25519 signatures on every message — no unsigned messages accepted
- Per-message nonces + 5-minute timestamp window prevent replay attacks
- Public key is the identity — no separate key distribution or PKI
- `authorId` in signed contributions equals the Ed25519 public key — forgery is detectable

**Trust model:**
- Human approval is mandatory for federation — no automated path
- Three-layer Doorman enforcement separates capability from grant from runtime
- Unilateral revocation with tombstoning prevents silent re-trust
- Default-deny mode available for high-security postures

**Key storage:**
- macOS: private key in instance-specific Keychain entry (`keypair.json` holds only the public key cache)
- Non-macOS: private key encrypted at rest using `OGP_KEYPAIR_SECRET` (or framework token as fallback)
- Use `ogp setup --reset-keypair` for intentional key rotation

**Best practices:**
- Verify peer identity out-of-band before approving federation requests
- Always use HTTPS tunnels (never expose raw HTTP)
- Set `inboundFederationPolicy.mode` explicitly — don't rely on defaults for production
- Use `ogp agent-comms default off` for maximum control over what peers can initiate

---

## Development

### Build from Source

```bash
git clone https://github.com/dp-pcs/ogp.git
cd ogp
npm install
npm run build
npm link
```

### Run Tests

```bash
npm test
```

### Run Benchmarks

```bash
node bench/ogp-bench.mjs
```

### Project Structure

```
src/
  cli.ts                   # Main CLI entrypoint
  daemon/
    server.ts              # HTTP server and endpoints
    keypair.ts             # Ed25519 keypair management
    peers.ts               # Peer storage and management
    scopes.ts              # Scope types and utilities
    doorman.ts             # Three-layer scope enforcement + rate limiting
    agent-comms.ts         # Agent-comms policy resolution
    projects.ts            # Project storage and contributions
    contribution-signing.ts# Per-contribution Ed25519 signing
    message-handler.ts     # Message verification and routing
    notify.ts              # OpenClaw/Hermes delivery backends
    relay-client.ts        # Relay transport client
    outbox.ts              # Durable delivery outbox
  cli/
    setup.ts               # Setup wizard
    federation.ts          # Federation commands
    project.ts             # Project management commands
    expose.ts              # Tunnel management
    install.ts             # LaunchAgent installation
  shared/
    signing.ts             # Ed25519 sign/verify utilities
    config.ts              # Configuration management
bench/
  ogp-bench.mjs            # Performance benchmark suite
skills/
  ogp/                     # Core OGP skill
  ogp-expose/              # Tunnel configuration skill
  ogp-agent-comms/         # Response policy wizard
  ogp-project/             # Project context management skill
```

---

## Troubleshooting

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Peer not found` | Not yet federated | `ogp federation request <url>` |
| `Peer not approved` | Request pending | `ogp federation list --status pending` |
| `400 Bad Request` on push | Peer hasn't granted you scopes | Ask peer to run `ogp federation grant <your-peer-id>` |
| `Invalid signature` | Version mismatch | Peer needs `npm install -g @dp-pcs/ogp@latest` |
| `Send failed` on agent-comms | Topic blocked on receiver's side | Receiver runs `ogp agent-comms policies <peer-id>` |
| `ogp: command not found` | Not installed | `npm install -g @dp-pcs/ogp` |
| Daemon not running | Process died or wrong framework | `ogp config show`, then `ogp --for <framework> start --background` |

```bash
ogp config show             # verify active framework
ogp --for openclaw status   # check daemon status
tail -f ~/.ogp/daemon.log   # view daemon logs

# Restart
ogp --for openclaw stop
ogp --for openclaw start --background
```

---

## Known Issues

### OpenClaw Delivery

`POST /hooks/agent` is the primary delivery path for inbound federated requests. `openclaw gateway call ... sessions.send` over `wss://` is used for compact sync notes. OpenClaw may render direct session injections with sender metadata like `cli` — OGP includes peer identity in message content where needed. Native sender identity parity in Telegram is a known v0.4.2 limitation; the runtime logs a warning when it cannot request a session override.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Protocol Comparison](./docs/protocol-comparison.md) | OGP vs A2A, ANP, MCP, ACP, ActivityPub |
| [Architecture](./docs/ARCHITECTURE.md) | Design principles, BGP analogy, trust model, scope model |
| [Protocol Spec](./docs/PROTOCOL.md) | Wire format, endpoints, signing, federation lifecycle |
| [Getting Started](./docs/GETTING-STARTED.md) | Comprehensive setup guide |
| [CLI Reference](./docs/CLI-REFERENCE.md) | Complete command reference |
| [Migration Guide](./docs/MIGRATION.md) | Upgrading from single to multi-framework |
| [Federation Flow](./docs/federation-flow.md) | Handshake walkthrough |
| [Scope Negotiation](./docs/scopes.md) | Per-peer scope configuration |
| [Agent Communications](./docs/agent-comms.md) | Agent-to-agent messaging |
| [Rendezvous](./docs/rendezvous.md) | Optional discovery and invite service |
| [Multi-Framework Design](./docs/MULTI-FRAMEWORK-DESIGN.md) | Architecture for multiple frameworks |
| [OGP Apps Spec](./docs/superpowers/specs/2026-06-13-ogp-apps-layer-spec.md) | Apps layer design |

---

## macOS Menu Bar App

A lightweight native app for monitoring OGP status at a glance — color-coded status indicator, quick daemon/tunnel/peer view, and one-click start/stop. See [macos-menubar-app/QUICKSTART.md](./macos-menubar-app/QUICKSTART.md).

---

## License

MIT

---

## Links

- **npm** — https://www.npmjs.com/package/@dp-pcs/ogp
- **GitHub** — https://github.com/dp-pcs/ogp
- **Issues** — https://github.com/dp-pcs/ogp/issues
- **Substack** — https://trilogyai.substack.com
- **Website** — https://ogp.elelem.expert
- **OpenClaw** — https://openclaw.ai
