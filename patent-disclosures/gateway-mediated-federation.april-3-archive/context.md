# Context / Environment

**Domain:** Distributed AI agent infrastructure and secure inter-organizational communication protocols. OGP operates in the emerging field of AI gateway federation, where autonomous agents require authenticated, scope-limited collaboration across organizational boundaries.

**System Environment:**

OGP is a companion daemon (`src/daemon/server.ts`) that runs alongside OpenClaw AI gateway instances, exposing an Express HTTP server on port 18790 (configurable via `daemonPort` in `~/.ogp/config.json`). The system comprises:

- **Gateway Layer:** Ed25519 cryptographic identity (`src/shared/signing.ts::generateKeyPair()`) with public key discovery via `/.well-known/ogp` endpoint
- **Doorman Enforcement Layer:** Three-tier scope validation (`src/daemon/doorman.ts::checkAccess()`) implementing Layer 1 (gateway capabilities advertised in federation card), Layer 2 (per-peer `ScopeBundle` negotiated during `approvePeer()`), and Layer 3 (runtime validation against `grantedScopes` in `Peer` record stored in `~/.ogp/peers.json`)
- **Peer Storage:** File-based peer registry (`src/daemon/peers.ts`) with atomic write-and-rename (`savePeers()` using `.tmp` + `fs.renameSync()`) to prevent race conditions during concurrent access
- **Rate Limiting:** In-memory sliding window implementation (`src/daemon/doorman.ts::checkRateLimit()`) using `Map<peerId:intent, RateLimitEntry>` with per-intent quotas (e.g., `{requests: 100, windowSeconds: 3600}`)
- **Message Verification:** Ed25519 signature validation (`src/shared/signing.ts::verify()`) over JSON-serialized `FederationMessage` payloads with cryptographic binding to sender's public key

Runtime characteristics: stateless message processing, cryptographic operations dominate CPU (Ed25519 sign/verify), file I/O limited to peer state persistence, HTTP/1.1 over TLS via cloudflared/ngrok tunnels.

**Use Cases:**

1. **Cross-Organization Agent Collaboration** — Trigger: Agent A needs data/task assistance from Agent B in different organization. Consumer: AI agents running in OpenClaw instances. Outcome: Agent A sends `agent-comms` intent with topic `memory-management`, Bob's doorman validates Alice has granted scope for that topic (`ScopeGrant.topics` array), message delivered to Bob's agent via `POST /api/sessions/send`.

2. **Project Federation** — Trigger: Multi-party software project needs unified activity log. Consumer: Development teams with separate OpenClaw deployments. Outcome: `project.contribute` intent delivers progress/decision/blocker entries to peer's `~/.ogp/projects.json`, queries aggregate contributions across federation using `project.query` action with `replyTo` callback.

3. **Scope-Limited External Service Integration** — Trigger: Third-party monitoring service needs limited gateway access. Consumer: External automation without full trust. Outcome: Approve with minimal scope (`--intents monitoring --rate 50/3600`), doorman rejects any intent outside granted bundle with `403 Forbidden`.

**Constraints:**

- **Performance:** Ed25519 signature verification latency <1ms per message; rate limiter must handle 1000 req/min per peer without memory growth (cleanup via `cleanupExpiredEntries()` every 5 minutes)
- **Scale:** Single gateway supports 100+ federated peers; sliding window rate limit tracking scales O(peers × intents × window_size)
- **Security:** BGP-inspired "trust at the boundary" — gateways enforce scope contracts (`doorman.ts::scopeCoversIntent()`) preventing scope creep without internal agent involvement; cryptographic signatures prevent peer impersonation
- **Backward Compatibility:** v0.1 peers (no scope negotiation) automatically receive `DEFAULT_V1_SCOPES` with 100 req/hour limits; protocol version detected via `protocolVersion` field or presence of `scopeGrants` in approval payload

**Broader Applicability:**

**Federated Healthcare Data Exchange:** Hospital A shares radiology reports with Hospital B's diagnostic AI. Input: FHIR resources wrapped in `FederationMessage` with intent `medical-query`, scope grants limit topics to `radiology/*` excluding patient identifiers. Adaptation: Replace `agent-comms` topics with HIPAA audit categories; doorman validates PHI access policies instead of intent topics.

**Supply Chain IoT Gateways:** Factory A's production line gateway federates with Supplier B's inventory gateway. Input: `{"intent": "inventory-check", "payload": {"partNumber": "ABC123"}}`. Adaptation: Rate limits tied to API cost budgets; scope grants map to procurement authorization levels; message payloads carry supply chain transaction IDs instead of agent conversation context.

**Academic Research Collaboration:** University A's compute cluster federates with Lab B's data repository. Input: Job submission requests with `{"intent": "compute-request", "topics": ["genomics", "climate-modeling"]}`. Adaptation: Topics become research domains; scope grants encode resource quotas (CPU hours, storage GB); doorman enforces both computational and data access policies simultaneously using the same three-layer model.

The core innovation — cryptographically-bound scoped intents enforced at the gateway without exposing agent internals — transfers directly to any domain requiring bilateral trust negotiation between autonomous systems.
