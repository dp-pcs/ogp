# OGP User Guide

> **Open Gateway Protocol** — federation for AI agent gateways.
> This guide covers everything from first install to advanced collaboration patterns.

## Table of Contents

1. [What is OGP?](#1-what-is-ogp)
2. [How the Companion App and CLI Relate](#2-how-the-companion-app-and-cli-relate)
3. [Installation](#3-installation)
4. [First-time Setup](#4-first-time-setup)
5. [Making Your Gateway Reachable](#5-making-your-gateway-reachable)
6. [Federating with a Peer](#6-federating-with-a-peer)
7. [Sending Agent-to-Agent Messages](#7-sending-agent-to-agent-messages)
8. [Managing Projects](#8-managing-projects)
9. [Controlling What Peers Can Do](#9-controlling-what-peers-can-do)
10. [OGP Apps](#10-ogp-apps)
11. [Using the Companion App](#11-using-the-companion-app)
12. [Multi-Framework Setup](#12-multi-framework-setup)
13. [Key Management and Security](#13-key-management-and-security)
14. [Frequently Asked Questions](#14-frequently-asked-questions)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What is OGP?

OGP is a **federation protocol** for AI agent gateways. It lets two gateways — owned by different people, at different organizations, running different AI frameworks — establish a trusted, scoped, revocable relationship so their agents can communicate directly.

**The problem it solves:** When David's AI assistant needs to work with Cosmo's AI assistant, the only option today is copy-paste between conversations. OGP eliminates that by letting the gateways talk to each other directly, under explicit human-approved rules.

**What OGP is not:**
- It is not an AI agent itself — it is a companion daemon that runs alongside your AI gateway
- It is not a hosting service — you run it on your own machine or server
- It is not a message broker — messages go directly between gateways, peer-to-peer

**How it fits with other protocols:**

| Protocol | What it does | Relationship to OGP |
|----------|-------------|---------------------|
| MCP | Connects an LLM to tools (within one system) | OGP federates the gateways; MCP works inside them |
| A2A | Delegates tasks between agents in one org | OGP handles cross-org trust; A2A can run on top |
| ANP | Discovers agents on the open public web | Different use case; OGP is for bilateral private trust |

---

## 2. How the Companion App and CLI Relate

OGP ships two user interfaces for the same underlying daemon:

### The CLI (`ogp` command)
The primary interface. Every capability is available here. Use the CLI for:
- Initial setup (`ogp setup`)
- Scripting and automation
- Detailed inspection (`ogp federation scopes`, `ogp project query`)
- Server/headless deployments
- Any operation not yet in the companion UI

### The Companion App (OGP Companion)
A native macOS desktop app that wraps the CLI. Use the Companion for:
- Visualizing your federation network (live peer graph)
- Approving incoming federation requests
- Browsing and installing OGP Apps from peers
- Monitoring activity (received messages, agent-comms inbox)
- Managing peers and tunnels without remembering commands

**Critical requirement:** The OGP Companion app requires the OGP daemon to be running. It reads state from the daemon and shells out to the `ogp` CLI for all actions. Without the daemon running, the companion shows an offline state and cannot take any actions.

**What the companion cannot do (use the CLI instead):**
- Initial `ogp setup` — always run this in the terminal first
- Configuring per-peer agent-comms policies in full detail
- Managing OGP Apps from the terminal (advertise, publish)
- Server/cloud deployments
- Complex multi-framework operations

---

## 3. Installation

### Requirements

- **Node.js 18 or higher** — check with `node --version`
- **An AI gateway** — OGP works with OpenClaw, Hermes, or standalone (no framework)
- **A publicly reachable HTTPS URL** for your gateway (see Section 5)

### Install the OGP daemon

```bash
npm install -g @dp-pcs/ogp
```

Verify:
```bash
ogp --version
```

### Install the Companion App (optional)

Download from [ogp.elelem.expert](https://ogp.elelem.expert) or the [GitHub releases page](https://github.com/dp-pcs/ogp/releases).

The companion is a signed, notarized universal macOS app (Intel + Apple Silicon). macOS 11+ required.

> **The companion requires the OGP daemon to be installed and running.** Install the daemon first.

### Install Claude Code skills (optional)

If you use Claude Code (the AI coding assistant), install OGP skills so your agent knows how to use OGP:

```bash
ogp-install-skills
```

### Shell tab completion (recommended)

```bash
ogp completion install        # auto-detects bash or zsh
# open a new terminal window, or:
source ~/.zshrc               # zsh
source ~/.bashrc              # bash
```

After installing, press `Tab` after `ogp` to see available commands.

---

## 4. First-time Setup

Run the interactive setup wizard:

```bash
ogp setup
```

The wizard will:
1. **Detect installed AI frameworks** (OpenClaw, Hermes, or standalone)
2. **Ask which frameworks to enable** — you can enable multiple
3. **Generate an Ed25519 keypair** — this is your gateway's cryptographic identity
4. **Ask for your public gateway URL** — the HTTPS address where peers can reach you (see Section 5)
5. **Ask for your display name and email**
6. **Ask about human delivery preferences** — where OGP should notify you of incoming federation activity

For each framework, setup creates an isolated configuration directory:
- `~/.ogp-meta/config.json` — meta-registry (which frameworks are enabled)
- `~/.ogp/config.json` — framework config (for standalone/default)

After setup, start the daemon:

```bash
ogp start --background
```

Check status:
```bash
ogp status
```

### Revisiting setup

To re-run the human delivery and delegated-authority interview later:
```bash
ogp agent-comms interview
```

To reset your keypair (creates a new gateway identity — peers will need to re-federate):
```bash
ogp setup --reset-keypair
```

---

## 5. Making Your Gateway Reachable

Peers need to reach your gateway over the internet. If you're running on a cloud server or VPS with a public IP, set `gatewayUrl` in your config and you're done. If you're on a home machine, you need a tunnel.

### Option A: Cloudflare Named Tunnel (recommended — free, permanent URL)

Requires a free Cloudflare account and a domain.

```bash
cloudflared tunnel login
cloudflared tunnel create ogp
cloudflared tunnel route dns ogp ogp.yourdomain.com

# Create ~/.cloudflared/config.yml:
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <YOUR-TUNNEL-ID>
credentials-file: ~/.cloudflared/<YOUR-TUNNEL-ID>.json
ingress:
  - hostname: ogp.yourdomain.com
    service: http://localhost:18790
  - service: http_status:404
EOF

cloudflared service install
```

Then update your OGP config:
```bash
ogp stop
# Edit ~/.ogp/config.json: "gatewayUrl": "https://ogp.yourdomain.com"
ogp start --background
```

Your URL is now permanent and survives restarts.

### Option B: OGP built-in tunnel (quick start)

```bash
ogp tunnel start cloudflared    # or: ogp tunnel start ngrok
ogp tunnel list                 # see the URL and reconcile with gatewayUrl
ogp tunnel stop
```

The built-in tunnel is ephemeral — the URL changes on restart. Use it for testing; use a named tunnel for production.

### Option C: ngrok

```bash
ngrok config add-authtoken YOUR_TOKEN
ngrok http 18790
# Copy the HTTPS URL and set as gatewayUrl in ~/.ogp/config.json
```

### Verifying reachability

```bash
curl -s https://your-gateway-url/.well-known/ogp | python3 -m json.tool
```

You should see your public key, display name, and capabilities.

---

## 6. Federating with a Peer

### The fastest way: invite codes (v0.2.15+)

**You generate a code, they accept it:**
```bash
ogp federation invite
# → Your invite code: a3f7k2  (expires in 10 minutes)
# Share this code with your peer out-of-band (Telegram, email, etc.)
```

**They accept:**
```bash
ogp federation accept a3f7k2
```

That's it. Both sides are now approved and can exchange messages.

### Manual URL exchange

```bash
# You request federation with their gateway
ogp federation request https://their-gateway.example.com --alias cosmo

# They see a pending request:
ogp federation list --status pending

# They approve:
ogp federation approve <your-peer-id>

# You can now verify it's established:
ogp federation list --status approved
```

### Checking federation status

```bash
ogp federation list                    # all peers
ogp federation list --status approved  # only approved
ogp federation status                  # peer health and alias mappings
ogp federation ping https://peer-url   # test connectivity
```

### Viewing what a peer can do (and what you can do to them)

```bash
ogp federation scopes cosmo
```

Output shows:
- **GRANTED TO PEER** — what cosmo can call on your gateway
- **RECEIVED FROM PEER** — what you can call on cosmo's gateway

### Removing a peer

```bash
ogp federation remove cosmo
```

This immediately removes the peer on your side and sends a signed notification to theirs. The peer transitions to `tombstoned` state — they would need to send a new request (which you'd need to approve again) to re-federate.

---

## 7. Sending Agent-to-Agent Messages

### Simple message

```bash
ogp federation send cosmo message '{"text": "Hello from David"}'
```

### Agent-comms (natural language, topic-routed)

```bash
ogp federation agent cosmo general "Hey, what's the status on the auth system?"

# With topic and priority
ogp federation agent cosmo project-updates \
  "What decisions were made yesterday?" \
  --priority high

# Wait for a reply (up to 60 seconds)
ogp federation agent cosmo general "Can you check on that?" --wait --timeout 60000

# Fire and check later (detach pattern)
ogp federation agent cosmo general "Run that analysis" --detach
# → Returns a nonce: abc123xyz

ogp federation reply-status abc123xyz     # check if reply arrived
ogp federation pending-replies            # list all pending nonces
```

### What happens when your peer sends you a message

Incoming messages are:
1. Verified (signature + sender identity)
2. Checked by the Doorman (is this peer allowed to send this intent/topic?)
3. Delivered to your AI agent via `POST /hooks/agent`
4. Your agent sees the message with policy metadata (e.g., `[FULL]`, `[SUMMARY]`)

What your agent does with it depends on your `inboundFederationPolicy` setting and the delegated-authority configuration (see Section 9).

---

## 8. Managing Projects

Projects are optional shared collaboration spaces. Both parties contribute signed entries that are verifiable across the federation.

### Create a project

```bash
ogp project create signal "Signal AI CoE Hub" \
  --description "Shared knowledge hub for cross-org AI work"
```

### Log contributions (each one is Ed25519-signed with a stable ULID)

```bash
ogp project contribute signal progress "Completed authentication system"
ogp project contribute signal decision "Using PostgreSQL for persistence"
ogp project contribute signal blocker "Waiting for API key approval"
ogp project contribute signal context "Repo at github.com/org/signal"
```

Entry types are freeform strings — `progress`, `decision`, `blocker`, `context`, `note`, `task` are common conventions but any string is valid.

### Query your project

```bash
ogp project status signal
ogp project query signal --limit 10
ogp project query signal --type decision
ogp project query signal --author <pubkey>
```

### Share with a peer

```bash
# Send a contribution to a peer's project
ogp project send-contribution cosmo signal progress "Deployed staging environment"

# Query a peer's project
ogp project query-peer cosmo signal --limit 5 --type decision

# Request to join a peer's project
ogp project request-join cosmo shared-app "Shared App Project"
```

### Project ownership

The gateway that creates a project is its root owner (established by a signed creation record). Ownership controls moderation actions.

```bash
ogp project owners signal                 # list current owners
ogp project add-owner signal <peer-key>   # grant ownership to a peer (owners only)
ogp project claim-ownership signal        # claim a pre-existing project (members only)
```

---

## 9. Controlling What Peers Can Do

OGP enforces a three-layer scope model on every incoming message:

```
Layer 1: What your gateway advertises it supports
Layer 2: What you've granted this specific peer
Layer 3: Runtime Doorman enforcement (intent + topic + rate limit)
```

### Approving with specific scopes

```bash
# Grant limited scope
ogp federation approve cosmo \
  --intents agent-comms,project.contribute,project.query \
  --topics general,project-updates \
  --rate 100/3600

# Grant full default scope (all standard intents, no topic restriction)
ogp federation approve cosmo
```

### Updating scopes after approval

```bash
ogp federation grant cosmo \
  --intents agent-comms,project.contribute \
  --topics general,project-updates,signal
```

### Configuring how your agent responds (delegated authority)

Run the interview wizard to set global preferences:
```bash
ogp agent-comms interview
```

This sets:
- **Human delivery target** — where OGP notifies you of incoming activity
- **Inbound federation policy mode** — `forward` / `summarize` / `autonomous` / `approval-required`

### Per-peer response policies

```bash
# View policies for a specific peer
ogp agent-comms policies cosmo

# Allow cosmo to use the 'project-updates' topic at full detail
ogp agent-comms add-topic cosmo project-updates --level full

# Allow cosmo to use 'finance' but route to human first
ogp agent-comms add-topic cosmo finance --level escalate

# Block a topic entirely (sends a signed rejection, not a silent drop)
ogp agent-comms set-topic cosmo personal --level off

# Set cosmo's default to summary for unknown topics
ogp agent-comms set-default cosmo summary

# Configure multiple peers at once
ogp agent-comms configure cosmo,alice --topics "general" --level summary

# Reset to global defaults
ogp agent-comms reset cosmo
```

### Response levels

| Level | What happens |
|-------|-------------|
| `full` | Full message content passed to your agent |
| `summary` | Condensed version passed to your agent |
| `escalate` | Routed to your human-delivery target for approval |
| `deny` | Your agent politely declines |
| `off` | Signed rejection sent to peer; message not processed |

### Default-deny posture

```bash
ogp agent-comms default off                                      # block all unknown topics
ogp agent-comms configure --global --topics "general" --level summary  # then allow specific ones
```

### Viewing activity

```bash
ogp agent-comms activity              # recent activity (last 50 entries)
ogp agent-comms activity cosmo        # filter by peer
ogp agent-comms activity --last 20    # limit count
ogp agent-comms logging on            # enable persistent activity logging
```

---

## 10. OGP Apps

OGP Apps are declarative bundles (`ogp-app.json`) that describe capabilities — what intents they use, what skills they install into your AI agent, and where their output lives. Apps distribute through your federation network: peers advertise what they publish, you browse and install with a consent gate.

### Browse and install apps from peers

```bash
ogp app browse                          # see all apps from all approved peers
ogp app browse cosmo                    # see cosmo's apps only

# Install — shows consent gate (scripts + intents + publisher key) before running
ogp app install file:/path/to/my-app-dir       # from a local directory
ogp app install file:/path/to/my-app-dir --yes  # skip prompt (automation)
```

> **Note:** Installing from a peer (`peer:cosmo/signal`) requires peer discovery to be fully active. Check the current release for availability.

### Manage installed apps

```bash
ogp app list                 # list installed apps
ogp app show signal          # details: manifest, skills, project join status, output link
ogp app usage                # how much each app is doing (intent call attribution)
ogp app usage signal         # usage for one app
ogp app remove signal        # remove an app
```

### Publish an app

Create `ogp-app.json` in your app's directory:

```json
{
  "schemaVersion": 1,
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "What this app does.",
  "uses_intents": ["project.contribute", "project.query"],
  "uses_projects": ["my-project"],
  "installs_skills": [
    { "name": "my-skill", "install": "scripts/install-my-skill.sh" }
  ],
  "published_output": "https://my-app.example.com",
  "publisher": {
    "name": "Your Name",
    "key": "<your-ogp-ed25519-public-key-hex>"
  }
}
```

Get your public key:
```bash
ogp whoami --json | grep publicKey
```

Install and advertise:
```bash
ogp app install file:/path/to/app-dir    # validate, consent gate, register
ogp app advertise my-app                 # expose to approved peers
ogp app unadvertise my-app               # stop exposing
```

---

## 11. Using the Companion App

The OGP Companion is a native macOS desktop app. Download it from [ogp.elelem.expert](https://ogp.elelem.expert).

### Before you open the companion

1. Install the OGP daemon: `npm install -g @dp-pcs/ogp`
2. Run setup: `ogp setup`
3. Start the daemon: `ogp start --background`

The companion reads all state from the running daemon. Without the daemon, it shows an offline/error state.

### What you can do in the companion

| Tab / Section | What it shows | What you can do |
|---|---|---|
| **Overview** | Daemon status, tunnel status, public reachability | Start/stop daemon, see pending requests |
| **Federation** | Live network graph of your peers | Approve/reject requests, remove peers, send messages |
| **Activity** | Incoming agent-comms messages | Read and reply to messages from peers |
| **Tunnels** | Running tunnels and their status | Start/stop tunnels |
| **Apps** | Installed apps, peer-advertised apps | Browse, install, view usage |
| **Settings** | Identity, framework, agent-comms policies | Edit identity, change inbound policy |

### What you cannot do in the companion (use the CLI)

- `ogp setup` — initial setup must happen in the terminal
- Detailed per-peer scope configuration (`--intents`, `--rate`, `--topics` flags)
- `ogp project` commands (all project management is CLI-only currently)
- `ogp keychain` commands
- `ogp config transport` settings
- Server/cloud/headless deployments

### Multi-framework switching

If you have multiple frameworks configured (OpenClaw + Hermes), the companion has a framework switcher in Settings. Switch between them to see peers, apps, and activity for each framework.

### The companion vs. the daemon

The companion **does not run the daemon**. It only provides a UI for a daemon that's already running. If you quit the companion, the daemon keeps running in the background. If you kill the daemon, the companion goes offline.

---

## 12. Multi-Framework Setup

If you run multiple AI frameworks (e.g., OpenClaw and Hermes), each gets its own isolated OGP configuration.

```bash
ogp setup    # run for each framework; wizard auto-detects what's installed
```

Always specify `--for` when running commands:

```bash
ogp --for openclaw federation list
ogp --for hermes status
ogp --for all start --background    # start all framework daemons
ogp --for all status                # check all at once
```

Set a default so you don't have to type `--for` constantly:

```bash
ogp config set-default openclaw
```

Configuration is fully isolated per framework:
- `~/.ogp-meta/config.json` — registry of enabled frameworks
- `~/.ogp/config.json` — standalone/default framework config
- Keypairs, peers, projects, and activity logs are separate per framework

---

## 13. Key Management and Security

### Your gateway identity

Your Ed25519 keypair **is** your gateway identity. The public key is what peers store when they federate with you. Losing the private key means losing the identity — peers will need to re-federate with your new key.

**On macOS:** The private key is stored in Keychain under an instance-specific entry. `keypair.json` only stores the public key cache. Deleting `keypair.json` does not rotate your identity.

**On Linux/non-macOS:** The private key is encrypted at rest. Set `OGP_KEYPAIR_SECRET` for strong encryption:

```bash
export OGP_KEYPAIR_SECRET=<strong-random-secret>
ogp start
```

### Key rotation

If you intentionally want a new identity (warning: all peers will need to re-federate):

```bash
ogp setup --reset-keypair
```

### Keychain management

```bash
ogp keychain status    # check keychain state
ogp keychain init      # initialize the keychain entry
ogp keychain unlock    # unlock if locked
```

### Verifying your identity

```bash
ogp whoami             # current gateway identity (human + text display)
ogp whoami --json      # machine-readable with publicKey field
ogp config show-identity
```

### Security best practices

- **Verify peers out-of-band** before approving — confirm their identity through a separate channel (Telegram, email, phone)
- **Use HTTPS tunnels only** — never expose your gateway over plain HTTP
- **Set explicit scopes** when approving peers — don't rely on defaults for production
- **Use `ogp agent-comms default off`** for a default-deny posture on high-security gateways
- **Monitor activity** with `ogp agent-comms activity` and `ogp agent-comms logging on`
- **Rotate keys** if you suspect key compromise; notify federated peers

---

## 14. Frequently Asked Questions

### Do I need OpenClaw to use OGP?

No. OGP supports OpenClaw, Hermes, or standalone mode (no AI framework). In standalone mode, OGP handles federation but message delivery goes to a configured webhook URL rather than an AI agent.

### Can I run OGP on a server?

Yes. For server/cloud deployments:

```bash
export OGP_HOME=/path/to/ogp-config   # or set gatewayUrl directly in config
ogp start --background
```

No `ogp setup` wizard is needed if you pre-populate the config file. Use `--non-interactive` with `--answers <json-file>` for fully automated provisioning.

### Why does my peer say my gateway is unreachable?

Your `gatewayUrl` in the config must be a publicly reachable HTTPS URL. Check:

```bash
curl -s https://your-gateway-url/.well-known/ogp
```

If that fails from another machine, your tunnel isn't working or your URL is wrong. See Section 5.

### What happens if I lose my private key?

Your gateway identity is tied to the keypair. If you lose the private key:
- Generate a new keypair with `ogp setup --reset-keypair`
- Your new public key is a different identity
- All existing peers will need to re-federate with your new gateway

On macOS, the private key is in Keychain. Back up Keychain or export the key if you need portability.

### Can multiple people share one OGP gateway?

Not by design. Each OGP gateway is a single identity (one Ed25519 keypair). For multi-user setups, each person should run their own gateway. The multi-agent personas feature (`ogp config list-agents`) lets one gateway represent multiple AI agents, but the gateway itself is a single identity.

### What does a peer see when they look at my gateway?

They see your `/.well-known/ogp` card:
- Your display name and organization
- Your public key (this is your identity)
- Your declared capabilities (which intents you support)
- Any apps you're advertising
- Your gateway version

They do **not** see your peers, your projects' contents, your agent's conversations, or anything you haven't explicitly granted.

### How does the Companion App know which daemon to connect to?

The companion reads the meta-config at `~/.ogp-meta/config.json` to discover which frameworks are configured and on which ports. It then polls the daemon's HTTP API on the configured port(s). If the daemon isn't running, the companion shows an offline state.

### Can I use OGP with a different AI system (not OpenClaw or Hermes)?

Yes. OGP delivers messages to your AI system via `POST /hooks/agent` webhook. If your AI system exposes a compatible webhook endpoint, you can configure OGP to use it. The protocol itself is framework-agnostic.

### What is the `peer:` prefix in app install?

`peer:cosmo/signal` means "install the app named `signal` that cosmo is advertising." This requires cosmo to be an approved peer with `ogp app advertise signal` running on their side. If peer discovery is not yet available in your release, install apps from local directories using `file:` refs.

### Is OGP open source?

Yes. MIT license. Source at [github.com/dp-pcs/ogp](https://github.com/dp-pcs/ogp).

### How do I file a bug or feature request?

[github.com/dp-pcs/ogp/issues](https://github.com/dp-pcs/ogp/issues) or ping [@lat3ntg3nius](https://x.com/lat3ntg3nius) on X.

---

## 15. Troubleshooting

### Daemon won't start

```bash
ogp status                        # check if already running
ogp config show                   # verify config is valid
tail -f ~/.ogp/daemon.log         # view daemon logs
```

If another process is using the port:
```bash
lsof -i :18790                    # find what's using the port
ogp stop && ogp start --background
```

### Peer can't reach me

1. Verify your `gatewayUrl` is correct in `~/.ogp/config.json`
2. Test from outside your network: `curl -s https://your-url/.well-known/ogp`
3. Check your tunnel is running: `ogp tunnel list`
4. Verify the public key in the well-known card matches `ogp whoami`

### Federation request not appearing

```bash
ogp federation list --status pending   # check pending requests
tail -f ~/.ogp/daemon.log              # check for errors receiving requests
```

### Agent-comms messages not arriving

```bash
ogp agent-comms policies cosmo         # check if topic is allowed
ogp agent-comms activity               # see what's been received
ogp federation scopes cosmo            # confirm agent-comms scope is granted
```

### "Peer not approved" error

The peer sent a message before you approved them, or approval was revoked.

```bash
ogp federation list --status pending   # approve them
ogp federation approve cosmo
```

### "Topic not allowed" error (on the sender side)

The receiving gateway's Doorman is rejecting the topic. The receiver needs to:
```bash
ogp agent-comms add-topic <sender-id> <topic> --level summary
```

### Companion shows "offline"

1. Check daemon is running: `ogp status`
2. Start daemon: `ogp start --background`
3. Check daemon port matches what companion expects: `ogp config show`

### Wrong framework selected

```bash
ogp config show                         # see active framework
ogp config set-default openclaw         # change default
ogp --for openclaw status               # explicit per-command
```

### Logs and diagnostics

```bash
tail -f ~/.ogp/daemon.log               # daemon log
tail -f ~/.ogp/activity.log             # agent-comms activity
ogp agent-comms activity --last 50      # recent activity
ogp status                              # quick health check
ogp config show                         # full config view
ogp federation list                     # all peers + states
ogp federation status                   # peer health summary
```

---

## See Also

- [CLI Reference](./CLI-REFERENCE.md) — complete command reference
- [Getting Started Guide](./GETTING-STARTED.md) — comprehensive setup walkthrough
- [Architecture](./ARCHITECTURE.md) — protocol design and BGP analogy
- [Protocol Spec](./PROTOCOL.md) — wire format and endpoints
- [Scope Negotiation](./scopes.md) — per-peer permission model
- [Agent Communications](./agent-comms.md) — agent-to-agent messaging
- [Protocol Comparison](./protocol-comparison.md) — OGP vs MCP, A2A, ANP
- [Changelog](https://github.com/dp-pcs/ogp/releases) — release notes
