# Why AI Assistants Need BGP — Not Just API Keys

*Posted to: Trilogy AI Center of Excellence Substack*

---

When David's AI assistant needs to work with Cosmo's AI assistant, what actually happens today?

Copy. Paste. Copy. Paste.

David copies context from his conversation, pastes it into Cosmo's. Cosmo's agent responds. Cosmo copies the response, David pastes it back. Two intelligent systems, mediated by a human performing the world's least interesting clipboard operation.

This is the state of AI agent interoperability in mid-2026. And it's not because nobody noticed the problem.

---

## The Protocols We Already Have (And Why They're Not Enough)

The past year has produced a wave of agent communication protocols:

**MCP** (Anthropic, 2024) standardizes how a single AI agent attaches to tools — databases, search engines, code executors. It's excellent at what it does. It doesn't address how *two* agents talk to each other.

**A2A** (Google, 2025) lets agents delegate tasks to other agents within an organization. One orchestrator, many specialists, all operating under a shared identity provider. Great for enterprise workflows inside a single trust boundary.

**ANP** (open source, 2024) proposes decentralized agent discovery for the open web — think a public marketplace where any agent can find and connect to any other. Right idea, wrong trust model for sensitive collaboration.

None of these solve the David-and-Cosmo problem. None of them ask: *what happens when two humans want their AI systems to work together, but neither human controls the other's infrastructure, neither organization shares an identity system, and both parties have sensitive context they're not willing to hand over wholesale?*

This is a trust problem at the gateway level. And we needed a protocol for it.

---

## BGP for AI Assistants

The closest prior art isn't in the AI stack. It's in network routing.

BGP — the Border Gateway Protocol — is what makes the internet work as a federation of independently operated networks. When Trilogy's network needs to talk to Cosmo's network, BGP handles the trust establishment: bilateral approval, explicit policy negotiation, per-relationship scope control, and revocability. Neither Trilogy nor Cosmo needs to trust some central authority. They negotiate directly, and the negotiated policy governs every subsequent packet.

OGP applies exactly this model to AI gateways.

Two gateways, owned by different people, exchange signed discovery cards at `/.well-known/ogp`. One requests federation. A *human* on the other side approves. The approved relationship carries explicit scope: which capabilities are granted, at what rate, on which topics. Every message is signed with Ed25519 — the sender's cryptographic identity, not a shared secret that could be leaked or spoofed. And either party can revoke at any time, unilaterally, with a signed notification and a cryptographic tombstone that prevents silent re-trust.

The cleanest framing: **A2A is HTTP — request/response between services. OGP is BGP — trust and policy between autonomous systems owned by different parties.**

---

## What David and Cosmo Actually Did

I've been running OGP in production between my OpenClaw gateway and Cosmo's for several months now. Here's what the actual setup looks like:

```bash
# David approves Cosmo with explicit scope
ogp federation approve cosmo \
  --intents agent-comms,project.contribute,project.query \
  --topics general,project-updates,signal \
  --rate 100/3600

# Cosmo can now send this:
ogp federation agent david project-updates \
  "What decisions were made on the auth system?"

# Cosmo cannot send this (403 — topic not granted):
ogp federation agent david personal-finances \
  "What's your budget this quarter?"
```

Cosmo's agent can query project decisions, push signed contributions to shared projects, and send messages on approved topics. It cannot reach my calendar, my email context, or anything I haven't explicitly granted. The Doorman — OGP's runtime enforcement layer — validates every message against the stored scope before my agent ever sees it.

The federation has survived multiple restarts, tunnel URL rotations, and software upgrades. The public key is the durable identity. When Cosmo's tunnel URL rotated, our federation didn't break — because we're not peered to an address, we're peered to a cryptographic identity.

---

## The Security Model That Required Actual Thought

A recent academic paper (arXiv:2602.11327) analyzed four agent protocols against 16 security risks. OGP's design structurally addresses seven of them:

- **Replay attacks**: Per-message nonces + 5-minute timestamp window
- **Identity forgery**: Ed25519 verify on every message, no exceptions
- **Sybil attacks**: Human approval gate — each peer requires individual review
- **Token scope escalation**: The Doorman re-evaluates the *stored grant* on each request, not a token-embedded claim that could be inflated
- **Onboarding exploitation**: No automated path to federation
- **Cross-vendor trust exploitation**: The gateway is the trust boundary; agents never cross it directly
- **Intent deception**: Intents not in the peer's grant are rejected at the Doorman, before the agent sees them

The property I'm most proud of is the information boundary model. OGP gateways don't grant raw data access — they grant the right to *send messages*, which the receiving agent then processes according to its configured response policy. The agent decides what to share; it's not bypassed by the protocol layer.

---

## The Performance Reality

One concern with per-message cryptographic signing: doesn't it add latency?

We ran benchmarks (Apple M4 Pro, Node.js v26.3.0):

| Operation | Mean latency |
|-----------|-------------|
| Ed25519 sign | 19 μs |
| Ed25519 verify | 44 μs |
| Full message lifecycle (sign + verify + auth) | 65 μs |
| Doorman scope enforcement (1000 peers) | < 1 μs |
| 7-layer policy resolution | < 1 μs |

The full OGP overhead per message is **65 microseconds**. Agent-to-agent conversations happen on timescales measured in seconds (the agent needs to reason, form a response, etc.). Adding 65μs to that is not a meaningful constraint.

The 2.3× overhead versus HMAC-SHA256 is the cost of non-repudiable authorship. HMAC gives you shared-secret integrity — it proves the message wasn't tampered with, but it requires both parties to share a secret key, which means compromise of one compromises both. Ed25519 gives you individual identity: each message is provably from a specific keypair, and every signed project contribution is attributable even years later. Worth it.

---

## What This Enables That Wasn't Possible Before

The David-and-Cosmo collaboration now works like this:

Cosmo's agent, working on a shared project, asks: *"What's the status on the authentication system?"* The message arrives at my gateway signed with Cosmo's Ed25519 key, on the `project-updates` topic (which is in Cosmo's granted scope). My gateway's Doorman validates it, then delivers it to my agent at `POST /hooks/agent`. My agent processes it, applies the configured response policy (in this case: `full` — Cosmo is a trusted collaborator on this project), and responds. The whole cycle takes a few seconds of agent reasoning time, plus 65μs of OGP overhead.

No copy-paste. No manual context transfer. No shared credentials or API keys that either party controls. Just a bilateral, human-approved, cryptographically authenticated relationship between two autonomous systems.

---

## What's Next

OGP is now at v0.11.3 with 386 commits over three months. A companion macOS app provides a desktop UI for managing federation. An OGP Apps layer lets peers distribute capability bundles — declarative manifests that install skills into your AI agent, with a consent gate before anything runs.

We've submitted a formal treatment of the protocol design to HotNets 2026 (ACM SIGCOMM workshop on hot topics in networks) and are posting a preprint to arXiv. The goal isn't academic credentialing — it's establishing that this problem has a principled solution, and that the solution is implementable and measurable.

The reference implementation is open source at [github.com/dp-pcs/ogp](https://github.com/dp-pcs/ogp). npm: `@dp-pcs/ogp`.

If you're running an AI agent setup and want to federate, the invite flow takes about 30 seconds:

```bash
npm install -g @dp-pcs/ogp
ogp setup
ogp federation invite
# Share the 6-character code. They run: ogp federation accept <code>
```

Human approval required. Keys stay yours. No central authority.

---

*David Proctor is a Principal at Trilogy and runs the AI Center of Excellence. OGP is built and maintained at [github.com/dp-pcs/ogp](https://github.com/dp-pcs/ogp).*
