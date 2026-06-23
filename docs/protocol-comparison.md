# AI Agent Protocol Comparison

> OGP in context: how Open Gateway Protocol relates to MCP, A2A, ANP, ACP, and ActivityPub

This document supports the academic positioning of OGP and is the reference for the protocol comparison table in the HotNets 2026 paper submission.

## The Protocol Landscape

Five categories of protocols now address AI agent communication. Each occupies a different layer and solves a different problem:

| Category | Protocols | Problem solved |
|---|---|---|
| Tool attachment | MCP | LLM ↔ tool integration (single agent, local trust boundary) |
| Enterprise delegation | A2A, ACP | Task coordination within organizational trust boundaries |
| Open internet discovery | ANP | Cross-platform agent discovery and P2P execution (public web) |
| Social content federation | ActivityPub | Server-to-server social activity delivery (not agent-specific) |
| **Gateway-level federation** | **OGP** | **Cross-org bilateral trust with human approval and scope enforcement** |

OGP does not compete with any of these — it federates the gateways that agents using these protocols sit behind.

## Comparison Table

| Property | MCP | A2A | ANP | ACP | ActivityPub | **OGP** |
|---|---|---|---|---|---|---|
| **Trust model** | Host-delegated; no protocol-level enforcement | OAuth 2.0 + signed Agent Cards | Least-trust; DID cryptographic | Zero-Trust (ZTAS) + reputation ledger | Implementation-delegated; no spec guarantee | **Bilateral cryptographic peer approval** |
| **Identity** | Auth token (DID optional, non-native) | Agent Card + DID/OAuth | `did:wba` (HTTPS-hosted DIDs) | DID + Verifiable Credentials | HTTPS URI (WebFinger in practice) | **Ed25519 keypair per gateway** |
| **Scope control** | Coarse capability negotiation at session init | OAuth scopes + capability tokens (known gap: over-broad scopes) | `humanAuthorization` DID binding; sub-DIDs per context | VC-scoped short-lived tokens; PoI per request | HTTP auth + collection-level filtering | **Three-layer: advertised capability / per-peer grant / runtime Doorman** |
| **Human approval required** | Normative guideline only; not protocol-enforced | Not required; `input-required` state is optional | Required only for high-risk ops via DID document binding | Planned; not yet specified | Recommended for Follow; automatable by spec | **Mandatory for federation establishment; cannot be bypassed** |
| **Message signing** | None | JWS specified; TLS mandatory | ECDHE + DID key signing on auth; token thereafter | JWS (Proof-of-Intent) per message part | Not mandated (advisory only; implementations vary) | **Ed25519 on every message without exception** |
| **Discovery** | Manual / static URL | `/.well-known/agent.json` per domain | `/.well-known/agent-descriptions` + search agent crawl | Registry + DHT + offline manifest | WebFinger (spec-adjacent W3C CG report) | `/.well-known/ogp` + optional Rendezvous (pubkey lookup / invite codes) |
| **Revocability** | None specified | OAuth token expiry (gap: no enforced TTL) | DID deactivation (gap: no CRL/status protocol specified) | Credential revocation + lifecycle state machine | `Delete`/`Undo` activities (no cryptographic revocation) | **Unilateral asymmetric tear-down; tombstone prevents silent re-trust** |
| **Information boundary** | Raw data access gated by permission token | Raw capability access within granted scopes | Raw access after DID authentication | Signed task execution | Raw content delivery | **Gateway mediates what is shared; preference-aware responses** |
| **Designed for** | LLM ↔ tool integration (single-agent) | Enterprise task delegation (intra-org) | Open-internet agent marketplace | Infrastructure-scale multi-agent messaging | Decentralized social networking | **Cross-org AI gateway federation (sensitive workflows)** |
| **Protocol layer** | Application (JSON-RPC over HTTP/Stdio) | Middleware (HTTP enterprise) | Internet (decentralized P2P; JSON-LD) | Middleware (HTTP infrastructure) | Application (HTTP social activities) | **Gateway/infrastructure (companion daemon)** |

## Property Analysis

### Trust Model

**The key distinction is where trust is established and by whom.**

MCP delegates trust decisions entirely to the host application. The spec explicitly states "MCP itself cannot enforce these security principles at the protocol level." A2A uses OAuth 2.0 — trust is brokered by a shared identity provider, which requires organizational alignment. ANP uses DIDs for cryptographic identity but has no mechanism for one agent to formally approve another's access — any agent can attempt to authenticate. ACP introduces a reputation ledger but makes human approval of federation a future roadmap item.

OGP's trust model is bilateral and human-initiated at the gateway level. No peer relationship is established without a human on the receiving end explicitly approving it. This is not a policy recommendation — it is a protocol requirement. The federation handshake cannot complete without the approval callback.

### Identity

**Identity in most protocols is either borrowed (OAuth token) or advisory (DID document).**

ANP's `did:wba` standard provides the strongest identity story among non-OGP protocols — HTTPS-hosted DID documents with key material the agent controls. ACP adds Verifiable Credentials layered on DIDs. A2A's Agent Cards provide per-domain identity but are not universally cryptographic without the v1.0 signing extension.

OGP uses Ed25519 keypairs where **the public key is the identity**. There is no separate identifier that must be resolved against an external registry. The public key embedded in `/.well-known/ogp` is what peer relationships are keyed on in `peers.json`. Key rotation requires re-federation because it constitutes a new identity.

### Scope Control

**OGP is the only protocol with runtime enforcement distinct from the grant itself.**

Most protocols conflate the grant (what you're allowed to do) with the enforcement (checking each request against the grant at runtime). OGP separates these into three explicit layers:

1. **Gateway Capabilities** (`/.well-known/ogp`) — what this gateway supports at all. A peer cannot request a capability not in this list.
2. **Peer Grant** (set at approval) — what *this specific peer* is allowed to call, with optional rate limits and topic restrictions.
3. **Doorman** (runtime) — validates every incoming request against the peer's grant, enforces sliding-window rate limits, and checks topic allowlists for `agent-comms` intent.

The Doorman is a separate enforcement component (`src/daemon/doorman.ts`) distinct from the scope storage (`src/daemon/scopes.ts`). This means grants can be tightened post-approval without code changes — the Doorman re-evaluates against the current grant on each request.

### Human Approval

**This is OGP's sharpest distinction from all other protocols.**

The security threat modeling paper (arXiv:2602.11327) identifies "Onboarding Exploitation" as a risk across all four protocols it analyzes (MCP, A2A, ANP, Agora). OGP eliminates this risk structurally: there is no automated path to federation approval. A human must examine the request and explicitly approve it before any messages can flow.

For the use cases OGP targets — legal document review across firm boundaries, insurance prior authorization between health systems, project coordination between organizations — this is not a feature, it is a requirement.

### Revocability

**OGP's revocation is unilateral and leaves a cryptographic tombstone.**

Most protocols rely on credential expiry (OAuth token TTL) or DID deactivation (requires updating the DID document on the hosting server). ActivityPub's `Undo` requires the initiating party to take action. ANP explicitly flags revocation infrastructure as an open problem in the white paper (arXiv:2508.00007).

OGP's `federation remove` is asymmetric: the removing party updates their local state immediately and sends a best-effort signed notification to the removed peer. The removal is effective immediately regardless of whether the notification is received. The removed peer's entry transitions to `tombstoned`, preventing silent re-federation — a new request from a tombstoned peer creates a fresh `init`-state record requiring explicit re-approval.

### Security Gap Coverage

The security threat modeling paper (arXiv:2602.11327) identified risks that OGP's design addresses:

| Risk | OGP mitigation |
|---|---|
| Replay attacks | Per-message nonces + 5-minute timestamp window in `verifyCanonical()` |
| Identity forgery / impersonation | Ed25519 signature verification against stored public key on every message |
| Sybil attacks | Human approval gate; each peer requires individual human review |
| Token scope escalation | Three-layer model; Doorman enforces at runtime against stored grant (not token-embedded claim) |
| Onboarding exploitation | Mandatory human approval; no automated path to federation |
| Cross-vendor trust boundary exploitation | Gateway is the trust boundary; agents never directly cross it |
| Intent deception / prompt injection | Doorman rejects any intent not in the peer's grant list |

OGP does not address: cross-protocol confusion attacks (out of scope — OGP is not interoperable with other protocols at the wire level), supply chain integrity of the OGP daemon itself (user responsibility), or DoS against the rendezvous server (optional component; failure is graceful).

## The BGP Analogy

OGP's design is deliberately modeled on BGP (Border Gateway Protocol), the protocol that governs routing policy between autonomous networks on the internet. The mapping is precise:

| BGP concept | OGP equivalent |
|---|---|
| Autonomous System (AS) | Individual gateway (keyed by Ed25519 public-key prefix) |
| OPEN message / capability exchange | `GET /.well-known/ogp` |
| BGP session establishment | `request` → human approval → `approve` callback |
| Route policy / import filters | Per-peer scope grants (which intents are allowed, at what rate) |
| MD5 session authentication | Ed25519 per-message signatures |
| Route dampening | Sliding-window rate limiting in the Doorman |
| BGP WITHDRAW | `federation remove` — signed tear-down notification |
| BGP neighbor states | OGP federation lifecycle: `init` → `twoWay` → `established` → `degraded` → `down` → `tombstoned` |

What OGP borrows from BGP: the peering model, the bilateral policy negotiation, and the session-oriented relationship. What it does not borrow: route tables, path computation, multi-hop forwarding, or convergence algorithms. OGP is strictly point-to-point.

The closest existing analogy: **A2A is HTTP — request/response between services. OGP is BGP — trust and policy between autonomous systems owned by different parties.**

## Relationship Between Protocols (Not Competition)

OGP is complementary to all the above:

- **MCP**: OGP-federated gateways can use MCP internally to provide tools to their own agents. OGP controls what crosses the org boundary; MCP controls what the local agent can reach.
- **A2A**: An OGP gateway could use A2A internally to delegate tasks to specialized agents within its own trust boundary. OGP handles "can these two gateways trust each other and under what terms" — A2A handles task execution once they can talk.
- **ANP**: ANP's open-web discovery is appropriate for public agent marketplaces. OGP's bilateral approval model is appropriate for private cross-org workflows. They target different deployment contexts.
- **ACP**: ACP's infrastructure-scale messaging and OGP's gateway federation could coexist — ACP for high-throughput internal messaging, OGP for the trust handshake at org boundaries.

## Sources

- arXiv:2505.02279 — Survey of Agent Interoperability Protocols: MCP, ACP, A2A, ANP
- arXiv:2602.11327 — Security Threat Modeling for Emerging AI-Agent Protocols: MCP, A2A, Agora, ANP
- arXiv:2508.00007 — ANP Technical White Paper
- arXiv:2507.07901 — The Trust Fabric: Decentralized Interoperability and Economic Coordination
- arXiv:2602.15055 — ACP Federated Orchestration
- arXiv:2603.24775 — AIP: Agent Identity Protocol
- W3C ActivityPub Recommendation — https://www.w3.org/TR/activitypub/
- Google A2A Protocol — https://google.github.io/A2A/
- OGP Reference Implementation — https://github.com/dp-pcs/ogp
