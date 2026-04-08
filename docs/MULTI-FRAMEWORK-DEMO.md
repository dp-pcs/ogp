# Multi-Framework User Experience Demo

## Scenario 1: Fresh Install (Both Frameworks Detected)

```bash
$ ogp setup

   ___   ____  ____
  / _ \ / ___|  _ \
 | | | | |  _| |_) |
 | |_| | |_| |  __/
  \___/ \____|_|

  Open Gateway Protocol v0.3.4

🔍 Detecting installed AI frameworks...
  ✓ Found OpenClaw at ~/.openclaw/
  ✓ Found Hermes at ~/.hermes/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Which frameworks do you want to enable OGP for?
Use ↑↓ to navigate, space to select, enter to continue

  [x] OpenClaw - AI agent framework by OpenClaw
  [x] Hermes - Multi-platform AI orchestration system
  [ ] Standalone (no framework integration)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Selected: OpenClaw, Hermes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Configure OpenClaw
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gateway URL: https://ogp.sarcastek.com
Display Name: Junior @ OpenClaw
Email: david@theproctors.cloud

✓ OpenClaw configured
  Config: ~/.ogp-openclaw/
  Daemon: http://localhost:18790
  Keychain: ogp-federation-83751d84

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Configure Hermes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gateway URL: https://hermes.sarcastek.com
Display Name: Apollo @ Hermes
Email: david@example.com
Platform: hermes (detected)

Hermes webhook configuration:
  URL: http://localhost:8644/webhooks/ogp_federation
  Secret: ************ (auto-generated)

✓ Hermes configured
  Config: ~/.ogp-hermes/
  Daemon: http://localhost:18793
  Keychain: ogp-federation-79055744

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ OGP configured for 2 frameworks:
  - OpenClaw (Junior @ OpenClaw)
  - Hermes (Apollo @ Hermes)

Default framework: openclaw

Next steps:
  1. Start daemons:
     ogp start --all

  2. Send a federation request:
     ogp --for hermes federation request https://ogp.sarcastek.com

  3. Manage peers:
     ogp federation list            # Lists peers for default framework
     ogp --for hermes federation list   # Lists peers for Hermes
     ogp --for all federation list      # Lists peers for all frameworks

Tips:
  - Set a different default: ogp config set-default hermes
  - Create aliases: ogp alias add oc openclaw
  - Enable tab completion: ogp completion install
  - Get help anytime: ogp federation ?

Happy federating! 🚀
```

## Scenario 2: Day-to-Day Usage

### Starting daemons
```bash
$ ogp start --all
✓ Started OpenClaw daemon (PID: 12345) on http://localhost:18790
✓ Started Hermes daemon (PID: 12346) on http://localhost:18793

$ ogp status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OGP Daemon Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Framework   Status    PID     Port    Uptime    Gateway
─────────────────────────────────────────────────────────────
OpenClaw    Running   12345   18790   2m 34s    https://ogp.sarcastek.com
Hermes      Running   12346   18793   2m 34s    https://hermes.sarcastek.com

Rendezvous: https://rendezvous.elelem.expert (⚠️  503 unavailable)
```

### Using default framework (no --for needed)
```bash
$ ogp federation list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Federation Peers (OpenClaw)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALIAS    DISPLAY NAME           STATUS     SCOPES
──────────────────────────────────────────────────────────────
apollo   Apollo @ Hermes        approved   message, agent-comms, project.*

  Gateway: https://hermes.sarcastek.com
  ID: 302a300506032b6570032100e9dc2284
  Agent-comms: general → summary

Tip: Use `--for all` to see peers across all frameworks
```

### Using specific framework
```bash
$ ogp --for hermes federation list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Federation Peers (Hermes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALIAS    DISPLAY NAME           STATUS     SCOPES
──────────────────────────────────────────────────────────────
junior   Junior @ OpenClaw      approved   message, agent-comms, project.*

  Gateway: https://ogp.sarcastek.com
  ID: 302a300506032b6570032100c3068604
  Agent-comms: general → summary
```

### Using `--for all` for cross-framework view
```bash
$ ogp --for all federation list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Federation Peers (All Frameworks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OpenClaw (Junior @ OpenClaw)
  apollo   Apollo @ Hermes        approved   message, agent-comms, project.*

Hermes (Apollo @ Hermes)
  junior   Junior @ OpenClaw      approved   message, agent-comms, project.*

Total: 2 peers across 2 frameworks
```

### Tab completion in action
```bash
$ ogp <TAB><TAB>
setup       start       stop        status
federation  agent-comms config      completion

$ ogp fed<TAB>
$ ogp federation <TAB><TAB>
list     request  approve  reject   remove
send     agent    scopes   alias

$ ogp --for <TAB><TAB>
openclaw  hermes  all

$ ogp --for hermes federation agent <TAB><TAB>
junior   302a300506032b6570032100c3068604

$ ogp federation agent junior<TAB> <TAB><TAB>
general  debug  alerts  status
```

### `?` style help
```bash
$ ogp ?
Available commands:
  setup       Initialize OGP configuration
  start       Start OGP daemon(s)
  stop        Stop OGP daemon(s)
  status      Show daemon status
  federation  Manage federation peers
  agent-comms Configure agent-to-agent messaging
  config      Manage configuration
  completion  Install shell completion

Options:
  --for <framework>  Select framework (openclaw, hermes, all)
  --help            Show help
  --version         Show version

Examples:
  ogp setup                         # Interactive setup wizard
  ogp start --all                   # Start all framework daemons
  ogp --for hermes federation list  # List Hermes peers
  ogp federation ?                  # Show federation commands

$ ogp federation ?
Available commands:
  list     List all peers
  request  Send federation request to another gateway
  approve  Approve a pending peer
  reject   Reject a pending peer
  remove   Remove a peer
  send     Send a message to a peer
  agent    Send agent-comms message
  scopes   View or update peer scopes
  alias    Set an alias for a peer

Examples:
  ogp federation list --status pending
  ogp federation request https://peer.example.com
  ogp federation agent apollo general "Hello!"

$ ogp federation agent ?
Usage: ogp federation agent <peer> <topic> <message> [options]

Send an agent-comms message to a federated peer.

Arguments:
  peer      Peer identifier (alias, ID, or display name)
  topic     Message topic (e.g., general, debug, alerts)
  message   Message text

Options:
  --priority <level>       Message priority (low, normal, high)
  --conversation-id <id>   Thread conversation ID
  --wait-for-reply         Wait for peer response

Available peers (OpenClaw):
  apollo   Apollo @ Hermes   (approved)

Examples:
  ogp federation agent apollo general "Status update"
  ogp federation agent apollo debug "Error in module X" --priority high
  ogp --for hermes federation agent junior general "Hello from Hermes!"
```

## Scenario 3: Switching Default Framework

```bash
$ ogp config set-default hermes
✓ Default framework: hermes

$ ogp federation list
# Now automatically uses Hermes instead of OpenClaw

$ ogp config set-default openclaw
✓ Default framework: openclaw

$ ogp config show
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OGP Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Default framework: openclaw

Enabled frameworks:
  openclaw  OpenClaw          ~/.ogp-openclaw    :18790
  hermes    Hermes            ~/.ogp-hermes      :18793

Aliases:
  (none)

Meta config: ~/.ogp-meta/config.json
```

## Scenario 4: Migration from Existing Setup

```bash
$ ogp setup

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Migration Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I found existing OGP installations:
  ~/.ogp/           (OpenClaw - detected)
  ~/.ogp-hermes/    (Hermes - detected)

Would you like to migrate to the new multi-framework setup?
This will:
  - Create ~/.ogp-meta/ for central configuration
  - Rename ~/.ogp/ → ~/.ogp-openclaw/
  - Keep ~/.ogp-hermes/ as-is
  - Enable both frameworks with OpenClaw as default

Your existing configuration and peers will be preserved.

Migrate now? (Y/n): y

✓ Created ~/.ogp-meta/
✓ Migrated ~/.ogp/ → ~/.ogp-openclaw/
✓ Registered Hermes framework
✓ Set default framework: openclaw

Migration complete! New commands:
  Old: OGP_HOME=~/.ogp ogp federation list
  New: ogp federation list

  Old: OGP_HOME=~/.ogp-hermes ogp federation list
  New: ogp --for hermes federation list

Note: Your old commands with OGP_HOME still work!

Run `ogp completion install` to enable tab completion.
```

## Scenario 5: Power User with Aliases

```bash
$ ogp alias add oc openclaw
✓ Alias 'oc' → openclaw

$ ogp alias add ap hermes
✓ Alias 'ap' → hermes

$ ogp --for oc federation list
# Uses OpenClaw

$ ogp --for ap federation list
# Uses Hermes

$ ogp alias list
Aliases:
  oc → openclaw
  ap → hermes
```

## Scenario 6: Single Framework User (No Change!)

```bash
# User only has OpenClaw, never installed Hermes
$ ogp federation list
# Automatically uses the only configured framework
# No --for flag needed, no framework selection prompt
# Works exactly like before!
```
