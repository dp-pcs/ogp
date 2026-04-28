# OGP Architecture

> Open Gateway Protocol — the *why* behind the daemon. For the *how*, see [`PROTOCOL.md`](./PROTOCOL.md). For commands, see [`CLI-REFERENCE.md`](./CLI-REFERENCE.md).

## What OGP Is

OGP is a vendor-neutral federation protocol that lets two AI gateway systems, owned by different people or organizations, exchange structured agent messages with explicit trust, scoped permissions, and controlled information boundaries — without either party acting as a relay or sharing credentials.

In plain terms: your AI assistant can call your colleague's AI assistant directly. Neither of you has to copy-paste messages between them.

OGP is not tied to any specific AI platform. The reference implementation runs alongside OpenClaw and Hermes today, but the protocol itself is implementation-agnostic. Any agentic system that exposes a gateway boundary can implement OGP and federate with any other OGP-compliant gateway.

## Why "Open"

The name is intentional. OGP is:

- **Open standard** — the protocol specification is public, not proprietary
- **Open to any gateway implementation** — OpenClaw shipped the first reference implementation; the protocol belongs to no vendor
- **Open between humans** — federation is bilateral, human-approved, and revocable. No central authority brokers trust.

## OGP vs. A2A

OGP and Google's Agent2Agent (A2A) protocol are frequently confused but solve different problems.

| | A2A | OGP |
|---|---|---|
| **Layer** | Agent-to-agent task delegation | Gateway-to-gateway federation |
| **Trust model** | Service-level (API keys, JWTs, shared identity provider) | Human-level (bilateral approval, Ed25519 keypairs) |
| **Relationship** | Stateless request/response | Persistent, approved peering |
| **Scope control** | Implicit at the endpoint level | Explicit per-peer scope, rate limits, topic restrictions |
| **Human in the loop** | No | Yes — approval required before first message |
| **Designed for** | Enterprise workflow automation | Personal AI assistants and small-team collaboration |

They are complementary, not competing. An OGP-enabled gateway could use A2A internally to delegate tasks to specialized agents inside its own trust boundary. OGP handles *can these two systems trust each other and under what terms*. A2A handles the message format once they can talk.

The cleanest analogy: A2A is HTTP — request/response between services. OGP is BGP — trust and policy between autonomous systems owned by different parties.

## The BGP Parallel

OGP borrows its trust and policy model from BGP (Border Gateway Protocol), the protocol that handles routing between autonomous networks on the internet. The parallel isn't perfect (OGP doesn't compute paths or maintain route tables), but the *peering model* maps cleanly.

| BGP Concept | OGP Equivalent |
|---|---|
| Autonomous System (AS) | Individual gateway (identified by Ed25519 public-key prefix) |
| OPEN message | `GET /.well-known/ogp` |
| BGP session establishment | `request` → human approval → `approve` exchange |
| Route policy / filters | Per-peer scope grants (which intents are allowed) |
| MD5 session auth | Ed25519 signed messages |
| Route dampening | Per-peer sliding-window rate limiting |
| iBGP (interior) | Agent-to-agent within one gateway |
| eBGP (exterior) | OGP — between different people's gateways |
| BGP WITHDRAW | Federation revocation (peer marked `removed`, lifecycle → `tombstoned`) |
| BGP neighbor states (`Idle`/`Active`/`OpenSent`/`Established`) | OGP federation states (`init`/`twoWay`/`established`/`degraded`/`down`/`tombstoned`) |

What OGP **does not** borrow from BGP: multi-hop routing, route tables, path computation, convergence. OGP is strictly point-to-point peering between two gateways. BGP started the same way.

## Four Design Principles

**1. Decentralized.** No central registry or authority. You share your gateway URL out-of-band (Telegram, email, an invite token through the optional rendezvous server). The protocol handles everything from there. Any gateway can peer with any other OGP-compliant gateway without asking a third party.

**2. Policy-driven.** Every relationship has explicit, bilateral scope. Nothing flows without a configured policy on both ends. You decide what their gateway can ask yours to do; they decide what yours can ask theirs.

**3. Session-oriented.** Trust is established once (the handshake), then messages flow within that relationship until explicitly revoked. No re-authentication on every message. The federation lifecycle state machine tracks the relationship over time.

**4. Graceful teardown.** Either party can revoke at any time. Revocation is immediate, cryptographically clean, and tombstoned — re-federation from a removed peer creates a fresh `init`-state pending record, never a silent re-trust.

## Architecture

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│       Gateway A (David)         │         │       Gateway B (Stan)          │
│  publicKey: 302a300506032b65... │         │  publicKey: 1a2b3c4d5e6f7890... │
│                                 │         │                                 │
│  ┌──────────┐  ┌─────────────┐  │         │  ┌──────────┐  ┌─────────────┐  │
│  │  Junior  │  │  Sterling   │  │         │  │ Stan's   │  │  Stan's     │  │
│  │  (main)  │  │  (finance)  │  │         │  │  agent   │  │  agents     │  │
│  └────┬─────┘  └─────────────┘  │         │  └────┬─────┘  └─────────────┘  │
│       │   intra-gateway comms   │         │       │   intra-gateway comms   │
│       └──── (iBGP analog) ──────┤         ├───────┴── (iBGP analog) ────────┤
│                                 │         │                                 │
│  OGP Policy:                    │         │  OGP Policy:                    │
│  • Stan: scope=agent-comms      │◄──OGP──►│  • David: scope=agent-comms     │
│         + project.contribute    │         │         + project.contribute    │
│  • Rate: 100/3600 per intent    │         │  • Rate: 100/3600 per intent    │
│  • Auth: Ed25519 per message    │         │  • Auth: Ed25519 per message    │
│                                 │         │                                 │
└─────────────────────────────────┘         └─────────────────────────────────┘

  Both gateways implement OGP. Neither knows nor cares what
  framework the other is built on.
```

## Trust Boundaries

The gateway is the trust boundary. Agents never leave their own gateway. The gateway controls what crosses organizational lines.

This matters for three reasons:

1. **Containment preservation.** A compromised peer agent cannot directly access your agent's tools, memory, or context. It can only send signed intents that the receiving gateway's Doorman validates.

2. **Auditability.** Every cross-gateway message is signed, logged, and attributable to a specific peer's keypair. No "the agent decided" — the human-controlled policy decided, and the agent executed.

3. **Revocability.** Trust granted in one direction can be revoked in one direction. Granular per-peer per-intent scopes can be tightened without breaking the rest of the relationship.

## Scope Model

OGP enforces scope at three layers:

```
Layer 1: Gateway Capabilities  → What I CAN support (advertised at /.well-known/ogp)
Layer 2: Peer Negotiation      → What I WILL grant YOU (set at approval time)
Layer 3: Runtime Enforcement   → Is THIS request within YOUR granted scope (Doorman)
```

Capabilities can be broader than grants. Grants can be broader than runtime enforcement (if a scope is later revoked). The Doorman always enforces the most restrictive applicable layer.

For details on the validation chain, see [Five Layers of No: How OGP's Doorman Actually Works](https://trilogyai.substack.com) (linked from the article series).

## Federation Lifecycle

Every approved peer relationship transitions through an OSPF-inspired state machine:

```
[no peer]    → init        (federation request received / sent)
init         → twoWay      (peer approved)
twoWay       → established (first bidirectional health check succeeds)
established  → degraded    (one direction fails threshold)
established  → down        (both directions fail threshold)
degraded     → established (failures clear)
degraded     → down        (remaining direction also fails)
down         → established (recovery)
any          → tombstoned  (peer rejected / removed)
[tombstoned] → init        (peer re-federates as fresh pending record)
```

Each transition is logged with timestamp + reason and persisted on the peer record. See `src/daemon/peers.ts:deriveFederationState` for the canonical implementation.

## Related Documents

- [`PROTOCOL.md`](./PROTOCOL.md) — wire format, endpoints, message envelopes, signing
- [`scopes.md`](./scopes.md) — scope negotiation and ScopeBundle schema
- [`agent-comms.md`](./agent-comms.md) — delegated authority response levels
- [`federation-flow.md`](./federation-flow.md) — handshake walkthrough
- [`rendezvous.md`](./rendezvous.md) — optional rendezvous discovery and invite tokens
- [`MULTI-FRAMEWORK-DESIGN.md`](./MULTI-FRAMEWORK-DESIGN.md) — multi-framework architecture and meta-config registry
- [`extending-to-hermes.md`](./extending-to-hermes.md) — porting OGP to a non-OpenClaw framework
