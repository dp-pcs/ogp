# Multi-Agent Personas — Design Document

> **Bead:** B0032
> **Status:** Design (pre-implementation)
> **Target version:** v0.7.0
> **Author:** Relay (per David Proctor)
> **Last updated:** 2026-04-28 (revision 3 — all 8 open questions decided; Hermes confirmed as single-persona; default persona grant = primary-only)

## Goal

Allow a single OGP daemon — one keypair, one peer ID, one human-level trust relationship — to advertise and route to **multiple addressable agent personas**, with **per-(peer, persona) access control** so a single federation can expose different personas to different peers. A peer that federates with `David @ ogp.sarcastek.com` should be able to discover David's agents `Junior`, `Sterling`, and `Apollo`, address messages to a specific persona, and only see/reach the personas David has explicitly granted them — without re-federating, exchanging new keys, or going through a second human-approval handshake.

## What's in v0.7.0

Five linked capabilities that ship together:

1. **Multi-persona advertisement.** One federation card lists N agent personas under one keypair.
2. **Per-persona inbound routing.** A `toAgent` field in the message envelope routes to a specific persona.
3. **Per-persona scope grants** (3D access control: peer × intent × persona). A peer's grant can name which personas it covers.
4. **Framework auto-sync.** OGP detects OpenClaw/Hermes agents on the host and pre-populates personas with sensible defaults — zero-config persona setup.
5. **Internal peer registry endpoint.** A localhost-only API surface so in-gateway agents can introspect their human's federation graph.

## Non-goals

- **Per-persona keypairs.** Each persona is metadata under one human-level trust relationship, not a separate cryptographic identity. Use multiple daemons (existing meta-config support) if you need separate keypairs.
- **A2A-style per-agent endpoints.** No persona gets its own `/.well-known/` URL, port, or DNS entry.
- **Agent-to-agent message routing inside the gateway.** That's OpenClaw/Hermes's job; OGP only delivers the inbound message with a routing hint.
- **Per-persona rate limits.** Rate limits stay keyed at `{peerId}:{intent}` to prevent a misbehaving peer from multiplying their effective rate by the number of personas. Per-persona rate limits remain a v2 question (see Security § 4).
- **OGP-level intra-gateway agent-to-agent routing.** If Junior wants to message Sterling on the same gateway, that's a framework concern (OpenClaw's internal channels, Hermes's session model). OGP exposes peer registry data to local agents via the internal endpoint, but routing inside the gateway is the framework's job.

## Background — current state

### One daemon, one identity (today)

```
Today:
┌───────────────────────────────────────────┐
│  Daemon (port 18790)                      │
│    keypair: 302a300506032b65...           │
│    displayName: "David - Junior"          │
│    agentName: "Junior"                    │
│                                           │
│   Inbound federated message               │
│        │                                  │
│        ▼                                  │
│   Hook: /hooks/agent                      │
│   { agentId: "main", message: ... }       │  ← always "main"
│        │                                  │
│        ▼                                  │
│   OpenClaw → Junior                       │
└───────────────────────────────────────────┘
```

The OGP daemon has one identity. All inbound messages get routed to OpenClaw with `agentId: 'main'` (see `src/daemon/openclaw-bridge.ts:292`). To address multiple agents today, you must run multiple daemons via the meta-config registry — each gets its own port, keypair, and config dir. Three agents = three daemons = three federations to manage. The peer sees three unrelated humans.

### Plumbing already in place

Three pieces of infrastructure make this feature cheap to build:

1. **`agentId` in the OpenClaw hook payload** already exists (`openclaw-bridge.ts:292`). The daemon just always passes `'main'`.
2. **Identity fields in `OGPConfig`** (`humanName`, `agentName`, `organization`) — `src/shared/config.ts:130–132`. These already establish the framing that human ≠ agent.
3. **`AuthorIdentity` snapshots in project contributions** — `src/daemon/projects.ts:8–14`. The `agentName` field is already part of the contribution payload; v0.7 just needs to make it the *active routing target*, not just attribution metadata.

## Design overview

```
With Multi-Agent Personas (v0.7):
┌───────────────────────────────────────────────────────┐
│  Daemon (port 18790)                                  │
│    keypair: 302a300506032b65...     ← UNCHANGED       │
│    humanName: "David Proctor"                         │
│    agents:                                            │
│      - id: "junior",   role: primary                  │
│      - id: "sterling", role: specialist               │
│      - id: "apollo",   role: specialist               │
│                                                       │
│  Inbound federated message                            │
│  { ..., toAgent: "sterling" }   ← NEW envelope field  │
│        │                                              │
│        ▼                                              │
│   Persona resolution:                                 │
│     toAgent="sterling" → agentId="sterling"           │
│     toAgent="junior"   → agentId="main"  (alias)      │
│     toAgent=undefined  → agentId="main"  (default)    │
│        │                                              │
│        ▼                                              │
│   Hook: /hooks/agent                                  │
│   { agentId: "<resolved>", message: ... }             │
└───────────────────────────────────────────────────────┘
```

**One trust unit (the keypair). Many addressable personas (the `agents[]` advertisement and `toAgent` routing field).**

## Wire format changes

### 1. Federation card (`/.well-known/ogp`)

Add an optional `agents[]` array. Pre-v0.7 peers ignore it; v0.7+ peers use it for discovery.

**Current** (`src/daemon/server.ts:349–366`):
```jsonc
{
  "version": "0.6.0",
  "displayName": "David - Junior",
  "email": "...",
  "gatewayUrl": "https://ogp.sarcastek.com",
  "publicKey": "302a300506032b65...",
  "capabilities": {
    "intents": ["message", "agent-comms", "project.join", ...],
    "features": ["scope-negotiation", "reply-callback", "bidirectional-health"]
  },
  "endpoints": { ... }
}
```

**v0.7** — add `agents[]` and a new capability flag `multi-agent-personas`:
```jsonc
{
  "version": "0.7.0",
  "displayName": "David Proctor (Junior)",
  "humanName": "David Proctor",
  "email": "...",
  "gatewayUrl": "https://ogp.sarcastek.com",
  "publicKey": "302a300506032b65...",
  "capabilities": {
    "intents": [...],
    "features": ["scope-negotiation", "reply-callback", "bidirectional-health", "multi-agent-personas"]
  },
  "endpoints": { ... },

  "agents": [
    {
      "id": "junior",
      "displayName": "Junior",
      "role": "primary",
      "displayIcon": "⭐",
      "description": "Main coordination agent",
      "skills": ["code", "ops", "general"]
    },
    {
      "id": "sterling",
      "displayName": "Sterling",
      "role": "specialist",
      "displayIcon": "💰",
      "description": "Finance and data analysis",
      "skills": ["finance", "data-analysis"]
    },
    {
      "id": "apollo",
      "displayName": "Apollo",
      "role": "specialist",
      "displayIcon": "🔬",
      "description": "Long-form research and writing",
      "skills": ["research", "writing"]
    }
  ]
}
```

**Field semantics:**

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable persona identifier. Lowercase, alphanumeric + dash/underscore. Used as the routing key. |
| `displayName` | yes | Human-readable name. May contain spaces, capitals. |
| `role` | yes | `primary` (exactly one — the default routing target) or `specialist` (any number). Future: `archived`, `experimental`. |
| `description` | no | Free-text. Surfaced by `ogp federation peers --show-agents`. |
| `skills` | no | Array of free-text capability hints. Discoverability only — not enforced. |
| `displayIcon` | no | Optional emoji or URL for chat UIs. Pure presentation, not enforced. |

**Invariants:**
- Exactly one persona MUST have `role: "primary"`. The federation card is invalid otherwise.
- If `agents[]` is omitted entirely, the daemon synthesizes a single primary persona from the legacy `agentName` field for backward compatibility (see "Backward compatibility" below).

### 2. Federation message envelope (`FederationMessage`)

Add an optional `toAgent` field. Routes the message to a specific persona.

**Current** (`src/daemon/message-handler.ts:51–63`):
```ts
export interface FederationMessage {
  intent: string;
  from: string;        // peer ID
  to: string;          // our peer ID (= keypair fingerprint)
  nonce: string;
  timestamp: string;
  payload: any;
  replyTo?: string;
  conversationId?: string;
  projectId?: string;
}
```

**v0.7**:
```ts
export interface FederationMessage {
  intent: string;
  from: string;
  to: string;          // our peer ID — the trust unit (unchanged)
  toAgent?: string;    // NEW: persona id within `to`. Undefined = primary.
  nonce: string;
  timestamp: string;
  payload: any;
  replyTo?: string;
  conversationId?: string;
  projectId?: string;
}
```

**Routing semantics:**

| `toAgent` value | Behavior |
|---|---|
| Omitted / `undefined` | Route to the primary persona. Backward-compatible with v0.6.x peers. |
| Matches a defined persona `id` | Route to that persona. |
| Matches no defined persona | Reject with `404 unknown-agent` (signed). The sender gets a clear error and can retry against the primary or a different persona. |
| Empty string `""` | Treat as omitted (route to primary). |

**Why 404, not silent fallback to primary:** silent fallback is friendly but covers up bugs. If a peer thinks they're talking to Sterling and they're actually talking to Junior, that's worse than a 404 they can recover from. The signed rejection lets them surface the error to the human or retry against the listed personas.

### 3. Project contributions

Already supports `authorIdentity.agentName` (see `src/daemon/projects.ts:8–14`). When a contribution arrives via `project.contribute`, the daemon should:

1. Use `toAgent` to determine which persona received the contribution.
2. Stamp the local persona's `displayName` into the contribution if the receiving daemon has multi-agent enabled.

This makes the contribution log clearer: "David's Sterling received this contribution from Stan's research-bot" instead of just "the gateway received it."

## Schema changes

### `OGPConfig` (`src/shared/config.ts`)

Add an optional `agents` array. Keep legacy `agentName`/`displayName` for backward compatibility.

```ts
export interface AgentPersona {
  id: string;                  // "junior", "sterling"
  displayName: string;         // "Junior", "Sterling"
  role: 'primary' | 'specialist';   // Exactly one persona MUST have role: "primary"
  description?: string;
  skills?: string[];
  displayIcon?: string;        // Optional emoji or URL for chat UIs. Pure presentation.
  hookAgentId?: string;        // Override the framework `agentId` for this persona.
                               // Defaults: primary → 'main' (back-compat); specialist → `id`.
}

export interface OGPConfig {
  // ... existing fields ...
  displayName: string;         // Legacy: kept for backward compatibility
  humanName?: string;
  agentName?: string;          // Legacy: synthesized into agents[] if agents[] missing
  organization?: string;
  // NEW:
  agents?: AgentPersona[];     // If undefined, synthesized from agentName + 'primary' role
}
```

**`hookAgentId` lets each persona route to a different OpenClaw agent.** Example:

```yaml
agents:
  - id: junior
    displayName: Junior
    role: primary
    hookAgentId: main          # OpenClaw's "main" agent
  - id: sterling
    displayName: Sterling
    role: specialist
    hookAgentId: sterling      # OpenClaw must have an agent named "sterling"
  - id: apollo
    displayName: Apollo
    role: specialist
    hookAgentId: apollo        # Different OpenClaw agent
```

**The user is responsible for ensuring the underlying framework actually has agents matching these `hookAgentId` values.** OGP doesn't create OpenClaw agents; it just routes to ones the user has set up. If `hookAgentId: "sterling"` is configured but OpenClaw doesn't have a "sterling" agent, the hook call will fail and the daemon will return a structured error to the sending peer.

## Routing changes

### Message-handler (`src/daemon/message-handler.ts`)

Add a persona-resolution step before the existing intent-dispatch logic:

```ts
// Pseudo-code, in handleMessage() after auth/scope checks pass
const personas = loadPersonasFromConfig(); // helper from config.ts
const targetPersona = resolveTargetPersona(message.toAgent, personas);

if (!targetPersona) {
  return {
    success: false,
    nonce: message.nonce,
    error: `Unknown agent: '${message.toAgent}'`,
    statusCode: 404
  };
}

// Pass targetPersona.hookAgentId down to the bridge / openclaw-bridge call
// so /hooks/agent gets the right agentId.
```

### `resolveTargetPersona` rules

```ts
function resolveTargetPersona(
  toAgent: string | undefined,
  personas: AgentPersona[]
): AgentPersona | null {
  // Empty/undefined → primary
  if (!toAgent || toAgent === '') {
    return personas.find(p => p.role === 'primary') ?? null;
  }
  // Exact match → that persona
  const match = personas.find(p => p.id === toAgent);
  return match ?? null;
}
```

### OpenClaw bridge (`src/daemon/openclaw-bridge.ts`)

The bridge already accepts an `agentId`. The change is to plumb `targetPersona.hookAgentId` (or `targetPersona.id` as fallback) instead of the hardcoded `config.agentId`.

```ts
// Current (line ~292):
agentId: config.agentId || 'main',

// New:
agentId: persona?.hookAgentId ?? persona?.id ?? config.agentId ?? 'main',
```

The `persona` argument flows from the message handler. For pre-v0.7 messages with no `toAgent`, the resolver returns the primary persona, which keeps existing behavior identical.

## CLI changes

### Sending side

Add `--to-agent` flag to all outbound message commands.

```bash
# Send a generic message
ogp federation send <peer-id> message <payload> [--to-agent <persona>]

# Send an agent-comms message
ogp federation agent <peer-id> <topic> <message> [--to-agent <persona>]

# Send a project contribution (existing command, new flag)
ogp project contribute <project-id> --topic <t> --summary <s> [--to-agent <persona>]
```

If `--to-agent` is omitted, the message goes to the peer's primary persona (current behavior, no breaking change).

### Discovery side

```bash
# List peers with their advertised personas
ogp --for all federation peers --show-agents

# Output:
# Peer: Stan @ Hermes (1a2b3c4d5e6f7890)
#   Status: established (out 2m, in 30s)
#   Agents:
#     ⭐ shadow      (primary)    "Stan's main agent"
#     ⚙ research-bot (specialist) "Long-form research"
#     ⚙ code-bot     (specialist) "Code review and PRs"
```

```bash
# Show identity (current ogp whoami) updated to list local personas
ogp whoami

# Output:
# Identity: David Proctor (peer ID 302a300506032b65...)
# Gateway: https://ogp.sarcastek.com
# Agents (3):
#   ⭐ junior   (primary)    → OpenClaw agentId: main
#   ⚙ sterling (specialist) → OpenClaw agentId: sterling
#   ⚙ apollo   (specialist) → OpenClaw agentId: apollo
```

### Configuration

```bash
# Add a new persona
ogp config add-agent --id sterling --display-name "Sterling" --role specialist \
  --description "Finance and data analysis" --hook-agent-id sterling \
  --skills finance,data-analysis

# Remove a persona (cannot remove primary unless replacing)
ogp config remove-agent <id>

# Promote a specialist to primary (demotes the current primary to specialist)
ogp config set-primary <id>

# List configured personas
ogp config list-agents
```

## Backward compatibility

This is the load-bearing section. The wire-format change must not break federation with v0.6.x peers.

### Outbound (v0.7 → v0.6.x peer)

When a v0.7 daemon sends a message to a v0.6.x peer, it MUST omit the `toAgent` field unless the peer's federation card advertises `multi-agent-personas` in `capabilities.features`. Sending `toAgent` to a v0.6.x peer is undefined behavior — they'll likely ignore it (no harm) but the spec shouldn't depend on that.

CLI behavior: if the user passes `--to-agent <id>` to a peer that doesn't support multi-agent, the CLI rejects with:
```
Error: peer 'Apollo @ Hermes' is on OGP v0.6.x and does not advertise multi-agent personas.
       Drop --to-agent or upgrade the peer.
```

### Inbound (v0.6.x peer → v0.7 daemon)

Messages arriving from v0.6.x peers won't include `toAgent`. The resolver returns the primary persona. The hook gets called with `agentId: 'main'` (or the primary's `hookAgentId`). Behavior is identical to today.

### Local config without `agents[]`

If `OGPConfig.agents` is undefined or empty, the daemon synthesizes:

```ts
[{
  id: config.agentName?.toLowerCase().replace(/[^a-z0-9_-]/g, '-') ?? 'main',
  displayName: config.agentName ?? config.displayName ?? 'Agent',
  role: 'primary',
  hookAgentId: config.agentId ?? 'main'
}]
```

So a config that says `agentName: "Junior"` (current state) becomes a one-persona setup with primary `junior` automatically. No migration script needed.

### Federation card without `agents[]`

When parsing a peer's federation card, if `agents[]` is missing, synthesize a single primary persona on the local side:

```ts
[{
  id: peer.agentName?.toLowerCase() ?? 'main',
  displayName: peer.agentName ?? peer.displayName,
  role: 'primary'
}]
```

So v0.7 daemons can talk to v0.6.x peers and represent them as single-persona peers in the local registry. No special-casing throughout the codebase — the persona array is always populated.

## Security considerations

### 1. Persona advertisement is unauthenticated discovery

The `/.well-known/ogp` endpoint is public (per F-12 in the threat model). Anyone can see the list of personas. This is by design — the personas are presence advertisements, not secrets. Don't put sensitive metadata in `description` or `skills`.

### 2. Persona spoofing in `from` field

The `from` field still identifies the **gateway** (the peer ID = the keypair). Personas don't have keypairs. There's no separate cryptographic identity for "Junior vs Sterling" — they're metadata under one trust relationship.

This means: a peer cannot send a message *claiming to be from Sterling specifically* and have OGP cryptographically verify the claim. They can only send a message from `David's gateway`. If David then says "Sterling sent this," it's an OGP-internal attribution — accurate as long as David's daemon and routing are honest, but not externally verifiable.

For most use cases this is fine. If you need cryptographically distinct agent identities (e.g., a corporate setup where Junior and Sterling are owned by different teams who shouldn't trust each other's messages), use multiple daemons with separate keypairs — that's exactly what the existing meta-config registry is for.

### 3. Rate limits

Rate limits are keyed on `{peerId}:{intent}` today (`src/daemon/doorman.ts:181`). Multi-agent does NOT change this key.

**Recommendation: keep peer-level rate limits in v0.7.** Per-persona rate limits is a v2 question. A peer flooding "Sterling" is using the same trust budget as flooding "Junior" — the abuse signal is the same, and per-persona limits would let a misbehaving peer multiply their effective rate by the number of personas. Better to keep one bucket per peer.

## Per-persona scope grants (in-scope, v0.7)

The privacy model: when you federate with someone, you decide *which of your personas they can reach*. Without this, every federation is "all-or-nothing" — and the moment a user has a public-facing agent next to a private one, they have a leak.

### Schema change to `ScopeGrant`

Add an optional `personas[]` array to the existing `ScopeGrant` (`src/daemon/scopes.ts:14–28`):

```ts
export interface ScopeGrant {
  intent: string;
  enabled: boolean;
  rateLimit?: RateLimit;
  topics?: string[];
  // NEW in v0.7:
  personas?: string[];   // If present and non-empty, restrict this grant to these personas.
                         // If absent or empty, grant applies to ALL personas (backward compat).
  expiresAt?: string;
}
```

**Semantics:**

| `personas` value | Meaning |
|---|---|
| Absent (`undefined`) | **Backward-compat ONLY** — grants from v0.6.x peers and grants migrated from pre-v0.7 configs apply to all personas. New v0.7 grants always populate `personas`. |
| Empty array `[]` | Same as absent. Grant applies to every persona. (Rare; mostly produced by accidental over-deletion.) |
| `["junior"]` | Grant covers only the `junior` persona. Other personas reject this peer's traffic with `403`. |
| `["junior", "sterling"]` | Grant covers both. `apollo` rejects. |
| Contains an unknown id | Unknown ids are ignored at runtime (forward-compat); known ids are enforced. |

**Default for new federations (v0.7):** when a peer is approved without an explicit `--personas` flag, the granted personas list defaults to `[<primary.id>]` — i.e., the primary persona only. This is a privacy-safer default than "all personas" and preserves scripted flows (no interactive prompt blocks `ogp federation approve` in CI).

If the user wants to grant a peer access to additional personas at approval time, they pass `--personas junior,sterling` explicitly. They can extend later with `ogp federation grant <peer-id> --personas <list>`.

**Why default-primary-only is correct:**
- A v0.6.x user upgrading to v0.7 has only one persona (their legacy `agentName` synthesized as primary). Default-primary-only is a no-op for them — same behavior as today.
- A user with multiple personas who federates with someone new probably wants the conservative default. Granting access to private agents (Sterling-finance, Apollo-research) should be an explicit act, not an accident of approving a peer.
- Scripted flows (`ogp federation approve <peer-id> --intents agent-comms` in CI) get a sensible default and don't block on a prompt.

### Doorman enforcement

Add a persona check to `checkAccess()` in `src/daemon/doorman.ts` between the existing scope-coverage check (step 5) and the rate-limit check (step 6):

```ts
// Step 5.5: persona scope check (NEW in v0.7)
if (grant.personas && grant.personas.length > 0) {
  const personas = loadPersonasFromConfig();
  const targetPersonaId = message.toAgent ?? personas.find(p => p.role === 'primary')?.id;

  if (!targetPersonaId || !grant.personas.includes(targetPersonaId)) {
    return {
      allowed: false,
      reason: `Persona '${targetPersonaId}' not in granted scope for intent '${intent}'`,
      statusCode: 403,
      isV1Peer
    };
  }
}
```

The 6-step checkAccess algorithm becomes 7 steps with persona check inserted between scope-coverage and rate-limit.

### CLI

```bash
# Approve Stan to talk to Junior only
ogp federation approve <stan-peer-id> \
  --intents agent-comms,project.contribute \
  --personas junior

# Later: extend Stan's reach to Sterling for project work
ogp federation grant <stan-peer-id> \
  --intent project.contribute \
  --personas junior,sterling

# Show current grants per peer (existing command, updated output)
ogp federation scopes <stan-peer-id>

# Output:
# Peer: Stan @ Hermes (1a2b3c4d5e6f7890)
#   agent-comms      → personas: junior              (rate: 100/3600)
#   project.contribute → personas: junior, sterling   (rate: 100/3600)
#   project.query    → personas: ALL (no restriction) (rate: 100/3600)
```

### Backward compatibility

- **Existing v0.6.x grants** have no `personas` field. They continue to apply to all personas (the new default). No migration needed.
- **v0.7 daemon talking to v0.6.x peer** sends grants without `personas`. The peer wouldn't know what to do with the field anyway.
- **v0.6.x peer talking to v0.7 daemon** can still federate. Their messages get routed to the primary persona. If the v0.7 daemon's grant for that peer has a `personas` restriction that doesn't include primary, the message is rejected with the new 403 — same enforcement as for v0.7 peers.

### Why this is the third dimension of access control

| Dimension | Question it answers | Existing protocols |
|---|---|---|
| **Per-peer** | Who is allowed to talk to me at all? | OAuth (per-client), Matrix (per-server) |
| **Per-intent** | Which actions can they take? | OAuth (scopes), MCP (per-tool capability), OGP today |
| **Per-persona** | Which of MY agents can they reach? | **Nothing in published prior art** |

This is the new claim worth surfacing in the patent disclosure. It's not just "scope grants" — it's three-dimensional scope grants that map to a real privacy model (different personas serve different audiences).

## Framework auto-sync

OpenClaw and Hermes already define agents in their working directories. Today, OGP makes you re-declare them as personas. v0.7 fixes that.

### Detection paths

| Framework | Detection signal | Agent enumeration |
|---|---|---|
| OpenClaw | `~/.openclaw/` exists; `framework-detection.ts` already detects this | Subdirectories under `agents/`. Each is an agent with `IDENTITY.md`, `AGENT.md`, optional `config.json`. Returns N personas. |
| Hermes | `~/.hermes/` exists; `framework-detection.ts` already detects this | **Hermes is a single integrated runtime, not a multi-agent host.** Auto-sync returns exactly one persona derived from `~/.hermes/IDENTITY.md` + `config.yaml`. The persona is always `role: primary`, with `displayName` taken from the Hermes identity. There is no `agents/` directory in Hermes by design. |
| Standalone | No underlying framework | One synthesized persona from legacy `agentName` (no auto-sync available — manual `add-agent` only). |

**Why Hermes is the trivial case:** Per `docs/extending-to-hermes.md`, Hermes is a single conversational AI runtime — fundamentally different from OpenClaw's "many agents under one gateway" architecture. Multi-persona advertisement on a Hermes daemon means advertising one persona (the Hermes runtime itself, e.g. "Apollo @ Hermes" in David's setup). Per-agent inbound routing has no target other than Hermes itself, so `toAgent` from a peer either matches the one persona's id or returns 404. This is correct behavior, not a bug.

If Hermes evolves to support multiple internal agents in the future, this design accommodates it without protocol changes — the auto-sync logic just starts returning N personas instead of one.

### CLI

```bash
# One-shot sync: detect, propose, apply
ogp config sync-agents

# Output:
# Detected OpenClaw at ~/.openclaw/
# Found 4 agents in agents/:
#   main      → "Junior"        (channel: telegram-direct)
#   sterling  → "Sterling"      (channel: telegram-finance)
#   apollo    → "Apollo"        (channel: telegram-research)
#   journal   → "Journal"       (channel: file-only, no human channel)
#
# Proposed OGP personas:
#   ⭐ junior   (primary)    → hookAgentId: main,     channel: telegram-direct
#   ⚙ sterling (specialist) → hookAgentId: sterling, channel: telegram-finance
#   ⚙ apollo   (specialist) → hookAgentId: apollo,   channel: telegram-research
#   ⚙ journal  (specialist) → hookAgentId: journal,  channel: file-only
#
# Apply? [y / n / edit]
```

```bash
# Show what auto-sync would do without applying (dry run)
ogp config sync-agents --dry-run

# Force re-sync (overwrites manually edited persona definitions, with confirmation)
ogp config sync-agents --force
```

### Setup wizard integration

`ogp setup` currently asks for `humanName`, `agentName`, `organization`. After the framework is detected, it should add an interactive step:

```
Detected OpenClaw with 4 agents. Auto-import them as OGP personas? [Y/n]
  ⭐ junior   (primary, was 'main')
  ⚙ sterling
  ⚙ apollo
  ⚙ journal
```

### Detection helper

A new module `src/shared/framework-agents.ts` (or extension of existing `framework-detection.ts`) exposes:

```ts
export interface DetectedAgent {
  id: string;
  displayName: string;
  hookAgentId: string;
  channel?: string;        // Best-effort detection
  description?: string;    // Pulled from IDENTITY.md if available
}

export function detectFrameworkAgents(framework: 'openclaw' | 'hermes' | 'standalone'): DetectedAgent[];
```

Implementation reads the relevant working directory and parses what it finds. For OpenClaw specifically:

1. `cat ~/.openclaw/agents/<name>/IDENTITY.md` → extract first `# Name` line for `displayName`
2. `cat ~/.openclaw/agents/<name>/config.json` (if present) → extract channel/description
3. Generate persona id from directory name (sanitized to lowercase alphanumeric + dash)

If detection fails for a specific agent (missing files, parse errors), skip it but log a warning. Don't block sync on one bad agent.

### Why this matters

Two reasons:

1. **UX.** "Run `ogp config sync-agents` once" beats "edit a YAML file with 10 fields per persona." The persona advertisement feature is useless if setting it up is friction-laden.
2. **Patent claim.** "Automatic discovery of underlying framework agent configurations and zero-config federation persona setup" is itself a non-obvious integration. A2A has nothing analogous — its discovery model is purely outbound (signed Agent Cards) with no notion of introspecting an existing framework's agent registry. This is another claim to surface in the disclosure.

## Internal peer registry endpoint

OGP's peer registry is daemon-internal today. To support framework-side decisions ("should Junior know that Apollo is federated with AICOE?"), expose it via a localhost-only API.

### Endpoint shape

```
GET http://localhost:18790/internal/peers
Authorization: Bearer <local-token>
```

The token is a daemon-managed secret rotated on daemon start.

### Discoverability — push, not pull

Rather than making framework code hunt for the daemon's port and token, the daemon publishes its internal-API config to a well-known location whenever it starts:

```
~/.ogp-{framework}/internal-config.json   (mode 0600)

{
  "version": "0.7.0",
  "endpoint": "http://localhost:18790/internal",
  "token": "<rotating-secret-token>",
  "tokenIssuedAt": "2026-04-28T15:00:00Z",
  "framework": "openclaw"
}
```

In-gateway agents read this file to discover the endpoint and authenticate. The file's `0600` mode ensures only the same OS user can read it, providing the same access control as a token-only scheme but without making the framework code re-derive the daemon's port.

**Token rotation:** the file is regenerated on every daemon start. Long-lived agents must re-read on `ECONNREFUSED` or `401` responses — the helper library should retry once after re-reading the file before surfacing an error. The daemon writes atomically (write to `.tmp`, fsync, rename) so a reader that races with daemon startup never observes a partial file.

**On daemon shutdown:** the file is left in place but the token is invalidated. Any agent calling the endpoint with a stale token gets `401`, which signals "re-read the config file."

**Response:**

```jsonc
{
  "version": "0.7.0",
  "personas": [
    { "id": "junior", "displayName": "Junior", "role": "primary" },
    { "id": "sterling", "displayName": "Sterling", "role": "specialist" }
  ],
  "peers": [
    {
      "id": "1a2b3c4d5e6f7890",
      "displayName": "Stan @ Hermes",
      "humanName": "Stan Huseletov",
      "agentName": "Shadow",
      "federationState": "established",
      "personasGranted": ["junior", "sterling"],
      "lastSeen": "2026-04-28T10:30:00Z"
    }
  ]
}
```

The framework-side agent (Junior) calls this endpoint, sees that Stan is a peer with grants on both `junior` and `sterling`, and can decide whether/how to surface that to its human.

### What this enables (without making it OGP's problem)

- **Cross-persona awareness.** Junior can render "you're federated with Stan; he can talk to me and Sterling" in its UI.
- **Routing decisions in the framework.** OpenClaw can decide "if Junior receives a question about finance, suggest forwarding to Sterling because Stan has access to both."
- **Audit visibility.** A monitoring agent in the gateway can query "show me everyone my human is federated with and what they're allowed to do" without scraping config files.

OGP doesn't make the routing decisions; it just exposes the data. The framework decides what to do with it.

### Security

- **Localhost-only binding.** Endpoint is only available on `127.0.0.1`, not external. The daemon refuses requests with non-localhost source addresses.
- **Token-gated.** Even on localhost, requests need the bearer token from the protected file. Other users on a multi-user system can't read the registry.
- **Read-only.** The endpoint exposes data; it cannot mutate peer state. Mutations still go through the existing CLI/HTTP federation endpoints which have their own auth.

### Implementation

New route handler in `src/daemon/server.ts` after the existing `/.well-known/ogp` block. Token generation/rotation in a new `src/daemon/internal-auth.ts`. Reads existing peer state via `listPeers()`, joins with persona config and current grants.

## Test plan

New tests in `test/` (mapped to phase):

| File | Phase | Coverage |
|---|---|---|
| `test/multi-agent-personas-config.test.ts` | P1 | Config parsing, persona-array synthesis from legacy fields, primary-role invariant, `hookAgentId` defaulting |
| `test/multi-agent-personas-wire.test.ts` | P2 | Federation card serialization with/without `agents[]`; message envelope with/without `toAgent`; `personas[]` field on `ScopeGrant` round-trips |
| `test/multi-agent-personas-routing.test.ts` | P3 | `resolveTargetPersona` truth table: undefined → primary, exact match, no match → null |
| `test/multi-agent-personas-handler.test.ts` | P3 | Inbound `toAgent="sterling"` routes to hook with `agentId="sterling"`; unknown `toAgent` returns 404; missing `toAgent` routes to primary |
| `test/multi-agent-personas-cli-outbound.test.ts` | P4 | `--to-agent` flag wired to `federation send`/`agent`/`project contribute`; rejects when peer doesn't advertise `multi-agent-personas` |
| `test/multi-agent-personas-cli-discovery.test.ts` | P5 | `federation peers --show-agents` formatting; `whoami` output; `config add-agent`/`remove-agent`/`set-primary`/`list-agents` |
| `test/multi-agent-personas-scopes.test.ts` | P6 | `personas[]` field semantics (absent/empty/populated); CLI `--personas` flag wiring on `approve` and `grant`; `federation scopes` output renders restrictions |
| `test/doorman-persona-scope.test.ts` | P6 | `checkAccess()` step 5.5 enforcement: persona-restricted grant rejects out-of-list personas with 403; absent/empty personas grants apply universally |
| `test/framework-agents-detection.test.ts` | P7 | `detectFrameworkAgents()` reads OpenClaw `agents/` directory; parses `IDENTITY.md` for displayName; sanitizes ids; skips malformed entries with warning |
| `test/multi-agent-personas-sync-cli.test.ts` | P7 | `ogp config sync-agents` happy path; `--dry-run` prints without applying; `--force` overrides existing personas with confirmation |
| `test/internal-peers-endpoint.test.ts` | P8 | Endpoint binds to localhost only (refuses external); requires bearer token; returns expected join of personas + peers + grants; read-only (rejects PUT/POST) |
| `test/internal-auth.test.ts` | P8 | Token generation, file mode `0600`, rotation on daemon restart, token-file location per framework |
| `test/multi-agent-personas-backwards-compat.test.ts` | P9 | All compatibility matrices: v0.7↔v0.7, v0.7↔v0.6.x, missing config, missing card, persona scopes absent vs empty vs populated, multi-framework with mixed v0.6/v0.7 daemons |

### End-to-end scenarios (manual or scripted)

Scenario 1 — basic multi-persona routing:
1. Set up daemon with three personas (junior, sterling, apollo) via `ogp config sync-agents` against a real OpenClaw setup.
2. Federate with a peer running v0.7.
3. Verify peer sees three personas via `ogp federation peers --show-agents`.
4. Send `--to-agent sterling` from peer; verify message lands at OpenClaw with `agentId: sterling`.
5. Send no `--to-agent`; verify message lands at OpenClaw with `agentId: main` (primary).
6. Send `--to-agent nonexistent`; verify peer gets 404 with clear error.

Scenario 2 — per-persona scope enforcement:
1. From scenario 1's setup, run `ogp federation grant <peer-id> --intent agent-comms --personas junior` (lock peer to junior only).
2. Send `--to-agent junior` from peer with `agent-comms` intent → succeeds.
3. Send `--to-agent sterling` from peer with `agent-comms` intent → 403 with `Persona 'sterling' not in granted scope`.
4. Send `--to-agent sterling` with a *different* intent that wasn't restricted → still rejected unless that intent's grant also includes sterling.
5. Run `ogp federation grant <peer-id> --intent agent-comms --personas junior,sterling`. Step 3 now succeeds.

Scenario 3 — auto-sync from OpenClaw:
1. Configure OpenClaw with a fresh agent `journal` (no entry in OGP config yet).
2. Run `ogp config sync-agents --dry-run` → output proposes adding `journal` as specialist.
3. Run `ogp config sync-agents` → confirms and applies; persona registered.
4. Federation card now lists journal; peers running v0.7+ see it on next discovery refresh.

Scenario 4 — internal endpoint introspection:
1. With the daemon running, an in-gateway agent calls `GET /internal/peers` with the bearer token from `~/.ogp-{framework}/internal-config.json`.
2. Response includes the agent's own persona list, peer list, and per-peer grants.
3. The agent uses this data to render "you're federated with Stan; he can address junior and sterling" in its UI.
4. Try the same call from a different host (e.g., a Docker container that proxies localhost) — refused with 403.

Scenario 5 — backward compatibility:
1. Federate v0.7 daemon with a v0.6.x daemon.
2. v0.7 sends `--to-agent` (CLI rejects locally because peer doesn't advertise the capability).
3. v0.6.x sends regular agent-comms (no `toAgent`); v0.7 routes to primary persona.
4. Verify both daemons stay in `established` lifecycle state; no errors logged.

## Phased implementation

Ten phases. P1–P3 are sequential (schema → wire → routing). P4–P5 are independent of each other and can parallelize. P6 (per-persona scopes) builds on P3. P7 (auto-sync) and P8 (internal endpoint) are independent of the rest. P9 and P10 are wrap-up.

| Phase | Scope | Depends on | Files touched |
|---|---|---|---|
| **P1: Schema + config** | Add `AgentPersona` interface, `OGPConfig.agents`, persona synthesis from legacy fields, persistence. No wire/runtime changes yet. | — | `src/shared/config.ts`, `test/multi-agent-personas-config.test.ts` |
| **P2: Wire format** | Add `agents[]` to `/.well-known/ogp` response. Add `toAgent` to `FederationMessage`. Add `multi-agent-personas` capability flag. Add `personas[]` field to `ScopeGrant` (carried over the wire even if not yet enforced). | P1 | `src/daemon/server.ts`, `src/daemon/message-handler.ts`, `src/daemon/scopes.ts`, `test/multi-agent-personas-wire.test.ts` |
| **P3: Routing** | Implement `resolveTargetPersona`. Plumb persona through to `openclaw-bridge`. Use `hookAgentId` in the hook call. Return 404 for unknown personas. | P2 | `src/daemon/message-handler.ts`, `src/daemon/openclaw-bridge.ts`, `test/multi-agent-personas-routing.test.ts`, `test/multi-agent-personas-handler.test.ts` |
| **P4: CLI — outbound** | Add `--to-agent` flag to `federation send`, `federation agent`, `project contribute`. Reject if peer doesn't advertise the capability. | P2 | `src/cli/federation.ts`, `src/cli/project.ts` |
| **P5: CLI — discovery & local config** | `ogp federation peers --show-agents`, `ogp whoami` shows local personas, `ogp config add-agent / remove-agent / set-primary / list-agents`. | P1 | `src/cli/federation.ts`, `src/cli/config.ts`, `src/cli/setup.ts` (interview update) |
| **P6: Per-persona scope grants** | Add `personas[]` enforcement to Doorman (step 5.5 in `checkAccess`). Update `ogp federation approve` and `ogp federation grant` with `--personas` flag. Update `ogp federation scopes` output to show persona restrictions. | P2, P3 | `src/daemon/doorman.ts`, `src/cli/federation.ts`, `test/multi-agent-personas-scopes.test.ts`, `test/doorman-persona-scope.test.ts` |
| **P7: Framework auto-sync** | New `framework-agents.ts` module. New `ogp config sync-agents [--dry-run] [--force]` command. Setup-wizard integration. OpenClaw enumerates `~/.openclaw/agents/<name>/` to N personas; Hermes is the trivial case (single persona derived from `~/.hermes/IDENTITY.md`); standalone is unsupported (manual config only). | P1 | `src/shared/framework-agents.ts` (new), `src/cli/config.ts`, `src/cli/setup.ts`, `test/framework-agents-detection.test.ts` |
| **P8: Internal peer registry endpoint** | New `GET /internal/peers` route on localhost only. Token generation/rotation in `src/daemon/internal-auth.ts`. Read-only join of personas + peers + grants. | P2, P6 | `src/daemon/server.ts`, `src/daemon/internal-auth.ts` (new), `test/internal-peers-endpoint.test.ts` |
| **P9: Backwards-compat tests** | Cover all matrices: v0.7↔v0.7, v0.7↔v0.6.x, missing config, missing card, persona scope absent vs empty vs populated. | All prior phases | `test/multi-agent-personas-backwards-compat.test.ts` |
| **P10: Docs** | Update `docs/PROTOCOL.md` with new envelope and capability flag. Update `docs/ARCHITECTURE.md` to add the multi-persona section. Add `docs/MULTI-AGENT-PERSONAS-IMPL.md` companion. Update `README.md` quickstart. Update `CHANGELOG.md`. | All prior phases | `docs/`, `README.md`, `CHANGELOG.md` |

### Dependency graph

```
        P1 (schema)
       /    |     \
      P2   P5     P7  ← P5 depends on P1 only; P7 depends on P1 only
      |
   ┌──┴──┐
   P3    P4         ← P4 depends on P2; P3 depends on P2
   │
   P6 (per-persona scopes — needs P2 wire + P3 routing)
   │
   P8 (internal endpoint — needs P2 wire + P6 grants)
   │
   P9 (backcompat tests — needs everything)
   │
   P10 (docs — needs everything)
```

### Parallelization

| Track | Phases | Notes |
|---|---|---|
| Track A (schema → wire → routing) | P1 → P2 → P3 → P6 → P8 | Sequential, the spine |
| Track B (CLI surface) | P4, P5 | Both depend on P1/P2 only; can run together |
| Track C (auto-sync) | P7 | Independent after P1; can run alongside Track A |

If single-dev: 3–4 weeks at a sustainable pace. If three parallel tracks: ~10 working days. The critical path is Track A (P1 → P2 → P3 → P6 → P8). P9 and P10 are post-merge wrap-up against whatever lands.

**Estimated effort:** ~3 weeks single-developer or ~10 working days dispatched in three parallel tracks. P6 and P7 are the work that grew the scope vs the original v1 design — ~1 extra week if going alone.

## Decisions

All Open Questions from revision 1 have been resolved. Recorded here for traceability and to prevent re-bikeshedding during implementation.

| # | Question | Decision | Notes |
|---|---|---|---|
| 1 | `role` enum vocabulary | **`primary \| specialist`** | One persona must be primary; rest are specialists. Future enum extensions (`archived`, `experimental`) reserved but not in v0.7. |
| 2 | Per-persona icons/avatars | **Yes — optional `displayIcon` field** | Emoji or URL. Pure presentation; not validated; not enforced. Defaults to `⭐` for primary, `⚙` for specialist if unset (CLI rendering only). |
| 3 | `hookAgentId` default | **Asymmetric: primary → `'main'`, specialist → `id`** | Preserves backward compatibility (legacy daemons hardcode `agentId: 'main'`) while making specialist routing predictable. |
| 4 | Hermes routing + auto-sync | **Hermes is single-persona by design** | Hermes is one integrated runtime, not a multi-agent host. Auto-sync returns exactly one persona. No per-agent routing work needed for Hermes in v0.7. If Hermes evolves to support multiple internal agents later, this design accommodates it without protocol changes. |
| 5 | Default persona granting on federation approval | **Primary only by default** | Granting access to specialist personas (Sterling-finance, Apollo-research) must be an explicit act via `--personas`. Preserves scripted CI flows (no interactive prompt). Privacy-safer default. |
| 6 | Per-persona CLI flag style | **Comma-separated `--personas a,b,c`** | Matches existing `--intents` and `--topics` flag conventions. |
| 7 | Internal endpoint discoverability | **Push via `~/.ogp-{framework}/internal-config.json`** | Daemon writes config file on start (mode `0600`, atomic rename). Token rotates per daemon process. Agents re-read on 401. |
| 8 | Article timing | **Deferred** | Article will be drafted alongside or after release ship. Not a blocker for implementation. |

## What this differentiates against

### Functional comparison

| Concept | A2A | OGP today | OGP v0.7 |
|---|---|---|---|
| Trust unit | Per agent | Per gateway | **Per human** |
| Discovery | One Agent Card per agent (per origin) | One federation card per gateway | **One federation card with N personas** |
| Federation cost | N handshakes for N agents | 1 handshake | 1 handshake regardless of persona count |
| Agent addressing | Implicit (each agent has its own URL) | Always primary | Explicit `toAgent` routing |
| Cross-organization friction | DNS, certs, identity provider per agent | One peer record | One peer record, N addressable personas |
| Inbound persona access control | Implicit (each agent gates itself) | All-or-nothing | **Per-(peer × intent × persona) grants** |
| Framework agent auto-discovery | None | None | **`ogp config sync-agents`** |
| Internal agent introspection of federation | N/A | None | **Localhost `/internal/peers` endpoint** |

The architectural claim: **A2A scales linearly with agent count; OGP scales linearly with human/gateway count.** For personal and small-team deployments, the latter is dramatically cheaper.

### 3D access-control matrix (for patent disclosure)

Per-persona scopes complete a 3D access control model that no published prior art implements in this combination:

| System | Per-peer | Per-intent | Per-persona |
|---|---|---|---|
| OAuth 2.0 / OIDC | ✅ (per-client) | ✅ (scopes) | ❌ (no persona concept) |
| MCP | ❌ | ✅ (per-tool) | ❌ |
| A2A | ❌ (no peer-level scope, capability-advertised only) | ❌ (capabilities, not gated) | ❌ |
| Matrix | ✅ (per-server) | partial (room-level) | ❌ |
| ActivityPub | partial (block lists) | ❌ | ❌ |
| DIDComm | ✅ (per-DID) | partial (per-protocol) | ❌ |
| OGP v0.6 | ✅ | ✅ | ❌ |
| **OGP v0.7** | **✅** | **✅** | **✅** |

This 3D matrix combined with cryptographic signing, lifecycle state preservation, and bilateral human-approved establishment is the inventive step. Each individual element has prior art. The combination, applied to AI agent gateways with containment preservation as a first-class invariant, does not.

### What v0.7 adds vs v0.6 (claim deltas for the patent disclosure)

| New claim element | What it enables | Why it's not in prior art |
|---|---|---|
| Multi-persona advertisement under one keypair | Discovery of N agents via one federation card | A2A requires per-agent cards; gateway-card protocols (Matrix, ActivityPub) don't address agent personas |
| `toAgent` routing field with signed envelope | Cross-domain addressed delivery to a specific persona | No comparable gateway-internal routing primitive in cited prior art |
| Per-(peer × intent × persona) scope grants | Granular privacy: federate once, expose only chosen personas | Closest is OAuth's per-client scopes, but OAuth doesn't model gateway-internal personas at all |
| Framework auto-sync (`sync-agents`) | Zero-config persona setup from underlying OpenClaw/Hermes config | No published cross-framework discovery integration of this shape |
| Read-only internal peer registry endpoint | In-gateway agents can introspect their human's federation graph without protocol changes | No equivalent in agent communication protocols; closest analog is BGP's MIB but that's network-routing-specific |

## Reference

### Beads
- **B0032** (`.agent/memory/BEADS.md`) — Multi-Agent Personas, primary bead, v0.7.0
- **B0038** (to be created) — `agent-comms` policy per-persona overrides (deferred to v0.7.x or v0.8)
- **B0039** (to be created) — Hermes per-internal-agent parity if Hermes evolves to host multiple agents (currently the trivial single-persona case is sufficient)
- **B0040** (to be created) — Per-persona rate limits (deferred to v2 / v0.8)

### Code anchors (current state, pre-implementation)
- `src/shared/config.ts:122–134` — current OGPConfig identity fields
- `src/daemon/server.ts:308–367` — current `/.well-known/ogp` endpoint
- `src/daemon/server.ts:349–366` — federation card response shape
- `src/daemon/message-handler.ts:51–63` — current `FederationMessage` interface
- `src/daemon/openclaw-bridge.ts:285–298` — current OpenClaw hook call site
- `src/daemon/scopes.ts:14–28` — current `ScopeGrant` shape
- `src/daemon/doorman.ts:81–171` — current `checkAccess()` 6-step flow (becomes 7-step in P6)
- `src/shared/framework-detection.ts` — existing framework detection (P7 extends this)

### Prior shipped work this builds on
- v0.6.0 identity-snapshot work (commits `aa6f8ec`, `a964aa5`, `e0b1733`, `d3143c7`)
- v0.6.0 OSPF-inspired federation lifecycle (PRs #11, #12, #13)
- v0.4.0 multi-framework meta-config registry (`docs/MULTI-FRAMEWORK-DESIGN.md`)
- v0.2.0 scope negotiation model (`docs/scopes.md`)

### Article series alignment
- Article 04 (*Breaking Up with OpenClaw*) — establishes the gateway-as-trust-boundary framing this design depends on
- Article 06 (*OSPF for Agents*, draft) — establishes the lifecycle state machine which the internal endpoint exposes
- Article 07 (proposed, *One Handshake, Many Agents*) — the multi-persona pitch; publish with v0.7.0 ship
