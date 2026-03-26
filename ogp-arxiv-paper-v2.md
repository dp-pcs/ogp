# OGP: A Lightweight Federation Protocol for AI Gateway Interoperability



## Abstract

As AI personal assistants and agent-based systems proliferate, they increasingly operate in isolation---unable to securely communicate with or delegate tasks to agents running in other environments. We present the **Open Gateway Protocol (OGP)**, a lightweight peer-to-peer federation protocol enabling AI gateways to discover, authenticate, and exchange structured intent messages across organizational and geographic boundaries. OGP establishes per-gateway cryptographic identity via Ed25519 key pairs published at a well-known endpoint, enforces bilateral human-approved trust through a signed callback handshake, and routes inbound intents through a policy-aware Doorman layer before delivery to the resident AI agent. An agent-comms subsystem provides per-peer, per-topic response policy control, giving users fine-grained authority over what their agent will act upon. A Project Intent Layer enables structured cross-gateway collaboration, with strict isolation guarantees ensuring that project data is visible only to explicitly admitted members---even when those gateways share other federation relationships. We describe the architecture, a reference implementation ( v0.2.8, TypeScript, $$2,800 lines), and a three-node mesh validation spanning Colorado USA, Spain, and AWS ECS Fargate (us-east-1) conducted on March 26, 2026. We further demonstrate multi-tenant deployment via Clawporate, a hosted platform running per-user OGP gateway containers on AWS ECS Fargate. OGP is designed to complement---not replace---existing standards such as the Model Context Protocol (MCP) and the Agent-to-Agent (A2A) protocol, offering a minimal trust bootstrap layer for heterogeneous AI deployments.

**Keywords:** AI federation, gateway protocol, agent interoperability, Ed25519, intent routing, trust handshake, project collaboration, scope negotiation, multi-tenant deployment, personal AI assistant

## Introduction

The rapid adoption of AI personal assistants has produced a landscape of isolated silos. A user's agent running on a home gateway in Denver cannot, without custom integration work, ask a colleague's agent in Madrid to schedule a meeting, relay a message, or query calendar availability. Each deployment operates behind its own authentication boundary, with no standard mechanism for peer discovery, trust establishment, or secure message exchange.

This isolation limits the utility of AI agents in precisely the scenarios where they would be most valuable: cross-organizational coordination, delegated task execution, and multi-party workflows. The problem is not merely technical; it is also social. Any federation mechanism for AI agents must respect human authority---users must explicitly approve which remote agents their local agent trusts, and they must retain per-peer, per-topic control over what actions are permitted.

Prior work has addressed pieces of this problem. The Model Context Protocol (MCP) [mcp2024] standardizes how agents consume tools and context from servers, but does not define how two *autonomous agents* authenticate each other or exchange intent-bearing messages. The Agent-to-Agent (A2A) protocol [a2a2025] specifies a richer task-delegation framework, but targets enterprise service meshes and assumes pre-existing credential infrastructure. Federated social protocols such as ActivityPub [activitypub] establish peer identity and message passing but carry significant complexity and are not designed for structured AI task intents.

We identify four requirements that remain unmet by existing approaches:

  - **Minimal bootstrap**: Peers with no prior relationship should be able to discover and authenticate each other with no centralized directory.
  - **Human-in-the-loop trust**: Trust establishment must require explicit approval from the humans on both sides of the federation link.
  - **Intent-level policy**: Users must be able to specify, per peer and per topic, whether their agent should act on, queue, or reject inbound requests.
  - **Collaborative intent with isolation**: Federated peers should be able to collaborate on structured projects without leaking project membership or data to uninvited peers---even peers who share other federation relationships.

This paper presents OGP, a protocol designed around these requirements. The primary contributions are:

  - A well-known endpoint schema for gateway identity publication using Ed25519 public keys.
  - A bilateral, human-approved trust handshake with cryptographically signed callbacks.
  - Automatic bidirectional scope negotiation during federation approval.
  - A typed intent message format covering the most common cross-agent interactions.
  - A Doorman policy layer that enforces intent-level rules before delivery to the AI agent.
  - An agent-comms subsystem for per-peer, per-topic response policy management.
  - A Project Intent Layer for structured cross-gateway collaboration with provable isolation semantics.
  - A reference implementation, three-node mesh validation, and multi-tenant cloud deployment demonstration.

The remainder of this paper is organized as follows. the relevant section reviews related work. the relevant section describes the OGP architecture. the relevant section details the reference implementation. the relevant section presents evaluation results. the relevant section discusses limitations and future directions. the relevant section concludes.

## Related Work

### Agent-to-Agent Protocol (A2A)

The Agent-to-Agent protocol [a2a2025] (arXiv:2504.16902v2) defines a comprehensive framework for multi-agent task delegation, including agent discovery via Agent Cards, task lifecycle management, and streaming result delivery over HTTP. A2A is well-suited to enterprise environments with managed identity providers and service meshes. OGP differs in scope and philosophy: where A2A defines a full task-execution protocol, OGP focuses on the minimal substrate needed for two human-supervised gateways to establish mutual trust and exchange lightweight intents. The two protocols are complementary; OGP could serve as a trust bootstrap layer for A2A deployments between previously unknown peers.

### Model Context Protocol (MCP)

MCP [mcp2024] standardizes the interface between AI models and external tools or data sources via a client-server architecture. It solves the vertical integration problem (connecting an agent to its tools) rather than the horizontal federation problem (connecting two agents to each other). OGP addresses the horizontal dimension and can coexist with MCP: a gateway may simultaneously expose MCP tool endpoints to its local agent and participate in OGP federation with remote gateways.

### Federated Identity and Messaging

The W3C ActivityPub specification [activitypub] defines an actor model for federated social networking, including inbox/outbox semantics and HTTP signatures for message authentication. While OGP shares ActivityPub's peer-to-peer orientation, ActivityPub is designed for human social content rather than machine-executable task intents, and its actor model does not map cleanly onto the AI gateway context. The Fediverse ecosystem demonstrates that web-of-trust federation at internet scale is achievable, but brings protocol complexity that is disproportionate to OGP's target use case.

### Decentralized Identifiers (DIDs)

W3C DIDs [did2022] provide a general-purpose mechanism for self-sovereign cryptographic identity. OGP's identity layer shares the same underlying intuition---each entity controls its own key material---but deliberately avoids the DID resolution infrastructure in favor of a simpler well-known URL approach that works without a DID method registry or resolver.

### OpenID Connect and OAuth 2.0

Standard identity federation via OIDC [oidc] and OAuth 2.0 requires a trusted authorization server acting as an identity provider. This is appropriate for user-facing web applications but introduces a centralized dependency that OGP intentionally avoids. OGP peers authenticate each other directly using public-key cryptography, with no third-party issuer.

## OGP Architecture

the figure below illustrates the high-level architecture of an OGP-enabled gateway. The core components are: the Identity Layer, the Pairing Handshake, Scope Negotiation, the Intent Message Format, the Doorman, the Agent-Comms subsystem, and the Project Intent Layer.

[*See LaTeX source for figure*]

### Identity Layer

Each OGP gateway generates an Ed25519 key pair at initialization. The public key, together with gateway metadata, is published at a well-known URL:

```
GET /.well-known/ogp
Content-Type: application/json

  "version": "1.0",
  "gatewayId": "<sha256-fingerprint>",
  "publicKey": "<base64url-encoded Ed25519 pubkey>",
  "name": "Alice's Gateway",
  "ogpEndpoint": "https://alice.example.com/ogp",
  "capabilities": ["calendar-read","message",
                   "task-create","ping"]

```

The  is a stable identifier derived from the SHA-256 hash of the public key, providing key-pinning semantics: if the key rotates, the identity changes and the pairing must be re-established.

### Pairing Handshake

OGP uses a bilateral, human-approved handshake to establish trust between two previously unknown gateways. The handshake proceeds in four steps:

  - **Initiation**: Gateway A sends a  to Gateway B's OGP endpoint, signed with A's private key. The payload includes A's public key, fingerprint, a nonce, and a human-readable display name.
  - **Human approval at B**: Gateway B presents the request to its user with a clear description of the requesting gateway. The user approves or rejects the request.
  - **Signed callback with scope grant**: Upon approval, Gateway B sends a signed  to Gateway A's callback URL, including B's public key, a signature over both the original nonce and B's identity, and the standard scope bundle B is granting to A.
  - **Human approval at A**: Gateway A presents the acceptance to its user for final confirmation. Upon approval, both gateways store each other's public keys and granted scopes in their peer registries.

The bilateral approval requirement is a deliberate design choice: neither gateway automatically trusts a pairing initiated by the other side's user. This ensures that both humans are aware of and consent to the federation relationship.

After pairing, all messages between the gateways are signed by the sender with its Ed25519 private key and verified by the receiver against the stored public key. Replay attacks are mitigated by including a timestamp and nonce in each message, with the receiver maintaining a short-window nonce cache.

### Scope Negotiation

OGP v0.2.7 introduced bidirectional scope negotiation, resolving a friction point in early deployments where peers had to manually grant permissions after pairing.

When a federation request is approved, both gateways automatically grant each other a standard scope bundle covering the most common inter-agent operations:

 \\

Scopes are stored in the peer registry entry for each peer and checked by the Doorman before any intent is forwarded to the AI agent. The scope check is the third step in the Doorman policy chain (after signature verification and peer trust confirmation), ensuring that even fully authenticated peers cannot invoke operations they have not been granted.

Operators may customize the default scope bundle on approval using the  flag or update scopes for existing peers via the  subcommand. The scope model is deliberately coarse-grained at this stage; finer-grained payload-level authorization is identified as future work.

The auto-grant design reflects a pragmatic tradeoff: for personal and small-team deployments, the overhead of per-scope manual configuration is a barrier to adoption. The standard bundle covers the intended use cases. Operators with stricter requirements can reduce the bundle at federation time.

### Intent Message Format

OGP defines a small vocabulary of typed intent messages. Each intent has the following envelope structure:

```

  "ogpVersion": "1.0",
  "intentId": "<uuid>",
  "type": "<intent-type>",
  "fromGatewayId": "<sender-fingerprint>",
  "toGatewayId": "<receiver-fingerprint>",
  "timestamp": "<ISO-8601>",
  "nonce": "<random-hex>",
  "payload":  ... ,
  "messageStr": "<canonical-JSON-string>",
  "signature": "<base64url Ed25519 sig>"

```

The  field (introduced in v0.2.8) carries the exact canonical JSON string that was signed by the sender. The receiver uses this raw string for signature verification, rather than re-serializing the parsed object. This prevents verification failures caused by JSON key-order drift across different serialization implementations---a subtle interoperability hazard in heterogeneous deployments.

The current intent vocabulary includes:

  - **: Liveness check; receiver responds with a signed .
  - **: Request for the receiver's agent to query and return free/busy or event data for a specified time range.
  - **: Deliver a natural-language message to the receiver's agent or user.
  - **: Request the receiver's agent to create a structured task with a title, description, and optional deadline.
  - **: Agent-to-agent natural language message, routed through the per-peer policy system.
  - **: Project collaboration intents (see the relevant section).

The vocabulary is intentionally minimal and extensible. Custom intent types can be registered by prefixing the type string with a namespace (e.g., ).

### Doorman: Policy Enforcement Layer

The Doorman is a middleware component that intercepts every inbound intent before it reaches the AI agent. For each intent, the Doorman evaluates a policy chain:

  - **Authentication**: Verify the intent signature against the sender's stored public key, using the attached  for stable verification.
  - **Peer trust**: Confirm that the sending gateway is in the approved peer registry.
  - **Scope check**: Confirm that the intent type is within the scopes granted by the local user to this peer.
  - **Rate limiting**: Enforce per-peer request rate limits.
  - **Agent-comms policy**: Consult the agent-comms subsystem for per-topic response rules.

Intents that pass the full policy chain are forwarded to the AI agent. Rejected intents receive a signed error response with a structured reason code, allowing the sending gateway to surface actionable feedback to its user.

The Doorman is stateless with respect to individual intents: each intent carries all context needed for policy evaluation. This simplifies horizontal scaling and crash recovery.

### Agent-Comms Subsystem

The agent-comms subsystem provides fine-grained control over how the local AI agent responds to approved inbound intents. Policies are defined per peer and per topic (intent type), and each policy specifies one of three response modes:

  - **: The agent processes the intent and responds automatically.
  - **: The intent is held for the local user to review before the agent responds.
  - **: The agent declines all intents of this type from this peer, with a polite signed response.

Policies are stored as a JSON document in the gateway's local configuration store and can be updated through the gateway's management API or the CLI. Default policies for new peers apply the  mode until explicitly changed, preventing any auto-processing without deliberate user opt-in.

### Project Intent Layer

The Project Intent Layer is a major capability added in OGP 0.2.6--0.2.8, enabling structured asynchronous collaboration between federated gateways. It addresses a gap in the original intent vocabulary: while  and  support ad-hoc communication, teams of AI agents frequently need to maintain shared, structured state---decisions made, blockers encountered, work in progress.

#### Project Model

A *project* is a named, persistent workspace identified by a short slug (e.g., ). Projects have an explicit membership list. Each project stores a log of *contributions*, which are timestamped, typed entries with a natural-language summary and optional structured metadata.

Contribution topics are drawn from a defined vocabulary:

The  namespace is open-ended and supports sub-topics such as  and .

#### Cross-Gateway Operations

Projects are distributed: each member gateway holds its own copy of the contribution log, which is synchronized through push operations. The project CLI provides the following operations:

  - : Create a new local project.
  - : Send a join-request intent to a peer gateway.
  - : Accept a peer's join invitation locally.
  - : Log a contribution and push it to all member peers.
  - : Display the local contribution log for a project.
  - : Summary view of a project's recent activity.
  - : Request a live contribution snapshot from a peer.

The  command triggers an auto-push to all registered member peers, so that the contribution log remains synchronized without requiring manual sync steps.

#### Project Isolation Guarantee

A core security property of the Project Intent Layer is *project isolation*: full mesh federation between gateways A, B, and C does *not* give any gateway access to projects it has not been explicitly added to.

Formally: if gateway A is a member of project $P$ along with gateway B, and gateway C is federated with both A and B but is not a member of $P$, then gateway C receives no contributions from $P$, cannot query $P$'s status, and receives no notification that $P$ exists. Contributions are pushed only to the gateways in the project's member list, and the Doorman scope check enforces this independently of the mesh topology.

This property is critical for multi-party deployments where a shared infrastructure node (such as a cloud-hosted relay gateway) is federated with many peers. Without project isolation, such a node would inadvertently become a data aggregator for all federated projects. the relevant section demonstrates this property empirically.

#### Natural Language Intent Detection

AI agents integrated with OGP can detect project-logging intent from freeform conversation. When an agent recognizes that a user's message contains reportable information (a decision, a blocker, a progress update), it can invoke the project contribution pipeline without requiring the user to use the CLI. This natural language path reduces friction while preserving the structured contribution record.

## Implementation

OGP is implemented in the  npm package, written in TypeScript. Version 0.2.8, the current release as of March 26, 2026, comprises approximately 2,800 lines of source code (excluding tests and generated types)---double the $$1,400 lines of the initial release, reflecting the addition of the Project Intent Layer, scope negotiation, and associated CLI surface.

### Package Structure

```
@dp-pcs/ogp/
  src/
    identity.ts       # Ed25519 key gen, fingerprinting
    handshake.ts      # Pairing handshake state machine
    intent.ts         # Intent serialization and signing
    doorman.ts        # Policy enforcement middleware
    agent-comms.ts    # Per-peer/topic policy store
    router.ts         # HTTP endpoint handlers
    peer-registry.ts  # Persistent peer store + scopes
    crypto.ts         # Signing and verification wrappers
    project.ts        # Project Intent Layer
    project-push.ts   # Contribution push to member peers
  types/
    ogp.d.ts          # Shared TypeScript types
  bin/
    ogp               # Standalone CLI entry point
```

### Cryptographic Implementation

Ed25519 operations are performed using the  library [noble], which provides a pure-JavaScript implementation with no native dependencies. Key pairs are generated using the library's  function seeded from the platform's CSPRNG. Private keys are stored in the gateway's local secret store, which on the reference platform (macOS/Linux) uses the system keychain or an encrypted file store respectively.

Signature creation follows RFC 8037 [rfc8037]: the private key signs the SHA-512 hash of the message bytes using the canonical JSON serialization of the intent envelope. In v0.2.8, the sender also attaches ---the exact string that was signed---so that the receiver can verify the signature against the original byte sequence rather than a re-serialized version. This resolves an interoperability issue observed in early mesh testing where different Node.js runtime versions produced subtly different key orderings during , causing spurious signature failures.

### HTTP Transport

OGP messages are transported over HTTPS using standard HTTP POST requests to the receiver's . The choice of HTTPS as a transport layer provides a baseline of transport-level encryption and server authentication (via TLS certificates), while the application-level Ed25519 signatures provide end-to-end message authentication independent of the TLS layer.

The well-known identity endpoint () is a simple GET endpoint that returns the gateway's public identity document. It does not require authentication, allowing unauthenticated peer discovery.

### CLI

The standalone  binary (replacing the earlier  subcommand) provides the following subcommand groups:

  - **Setup and daemon**: , ,
  - **Federation**:
  - **Project**:

Selected federation subcommand signatures:

  - : Initiate pairing with a remote gateway.
  - : Approve an inbound request; auto-grants default scopes.
  - : Update scopes for an existing peer.
  - : Display granted and received scopes.
  - : Send an agent-to-agent message.

### Bundled Skills

The OGP ecosystem ships three companion agent skills that extend the platform with additional automation:

  - **: Natural language project management; translates conversational input into structured  CLI calls.
  - **: Interactive wizard for configuring agent-to-agent communication policies.
  - **: Automates Cloudflare or ngrok tunnel setup to expose the OGP daemon to the public internet for inbound peer requests.

### Integration with OpenClaw

The reference implementation is deployed as a plugin within the OpenClaw AI gateway platform. The Doorman is registered as an Express middleware layer. The agent-comms subsystem exposes its policy store to the OpenClaw configuration system, enabling policy management through the platform's CLI and messaging interfaces (Telegram, iMessage, etc.).

The pairing handshake is surfaced to users through the platform's notification system: pairing requests appear as interactive messages in the user's configured channel, with approve/reject buttons. This design keeps the human in the loop without requiring separate UI surfaces.

State is persisted to a set of JSON files under :

  - : Gateway configuration (URL, email, port)
  - : Ed25519 key pair
  - : Federation peers and per-peer scope grants
  - : Local project data and contribution log
  - / : Operational and intent-level logs

## Evaluation

### Cross-Border Two-Node Validation (March 20, 2026)

On March 20, 2026, we conducted an initial cross-border interoperability validation between two OGP gateway deployments:

  - **Gateway A (LatentGenius)**: Colorado, USA (macOS arm64, residential broadband)
  - **Gateway B (Stanislav)**: Spain (macOS, residential broadband)

Both gateways ran the  package within the OpenClaw platform. The test session proceeded as follows:

  - Gateway A initiated a pair request to Gateway B's published OGP endpoint.
  - The human user at Gateway B received an interactive approval prompt via Telegram; approved within 42 seconds.
  - Gateway B's signed callback was received and verified at Gateway A; the Gateway A user approved the pairing within 28 seconds.
  - The pairing was confirmed bidirectionally. Both peer registries updated successfully.
  - Gateway A sent a  intent; Gateway B responded with a signed  in 287 ms (round-trip, Colorado--Spain).
  - Gateway A sent a  intent. The Doorman at B evaluated the policy chain (authentication ✓, peer trust ✓, scope allowed ✓) and routed the intent to Gateway B's AI agent, which returned availability data.
  - Gateway A sent a  intent; held by B's agent-comms queue policy pending user approval. The user at B approved delivery.
  - Gateway A sent a  intent; rejected by B's Doorman ().

### Latency

the table below summarizes observed round-trip latency for each intent type over five trials in the two-node validation. Measurements include HTTPS connection establishment, signature verification, Doorman policy evaluation, agent processing (where applicable), and response signature generation.

[*See LaTeX source for table*]

The higher latency for  reflects AI agent processing time at the remote gateway (LLM inference for availability parsing). The Doorman policy evaluation itself added less than 5 ms overhead in all cases, confirming that policy enforcement is not a meaningful bottleneck.

### Three-Node Mesh Validation

On March 26, 2026, we extended the evaluation to a three-node mesh topology to validate scope negotiation, the Project Intent Layer, and project isolation guarantees:

  - **Gateway A (LatentGenius)**: Colorado, USA (macOS arm64, residential broadband)
  - **Gateway B (Stanislav)**: Spain (macOS, residential broadband)
  - **Gateway C (Clawporate)**: AWS ECS Fargate, us-east-1 (containerized, per-user OGP deployment)

The mesh topology was: A $$ B (existing pair from March 20), A $$ C (new pair), B $$ C (new pair). All three gateways were fully federated with each other---a complete three-node mesh.

#### Scope Negotiation Validation

Both new pairings (A--C and B--C) used the auto-grant scope negotiation introduced in v0.2.7. In each case, a single  command resulted in both sides receiving the full standard scope bundle with no additional steps. We verified with  that granted and received scopes were symmetric.

#### Project Isolation Proof

To validate the project isolation guarantee, we constructed the following scenario:

  - Gateways A and B created and joined project **Synapse**. Gateway C was not invited.
  - Gateways A and C created and joined project **Starbridge**. Gateway B was not invited.
  - Gateway A contributed several entries to both Synapse and Starbridge.
  - Gateway C attempted to query project Synapse ().
  - Gateway B attempted to query project Starbridge.

Both queries returned empty results---Synapse was not visible to C, and Starbridge was not visible to B---despite C being fully federated with both A and B (who are both Synapse members), and despite B being fully federated with both A and C (who are both Starbridge members).

This confirms that full mesh federation topology does not imply project data sharing. Project visibility is strictly gated on explicit project membership, enforced by the Doorman scope check on every inbound project intent.

#### Additional Features Validated

  - **Auto-push on contribute**: When Gateway A contributed to Synapse, the contribution was automatically pushed to Gateway B (the only other member) within one round-trip, without any manual sync command.
  - **Natural language logging**: Gateway A's AI agent, given a conversational message containing a progress update, correctly detected the logging intent and invoked  autonomously.
  - **Agent-comms across mesh**: All three gateways successfully exchanged  messages after scope auto-grant.

### Security Properties

We verified the following security properties across both evaluations:

  - **Replay rejection**: Replaying a captured  intent 10 seconds after initial delivery was correctly rejected by the nonce cache.
  - **Tamper detection**: Modifying a single byte in the intent payload caused signature verification to fail at the Doorman, with rejection code .
  - **Unknown peer rejection**: An intent crafted with an unregistered  was rejected with  before reaching the AI agent.
  - **Scope enforcement**: Sending an intent for a scope not granted to a peer was rejected at the Doorman before reaching the agent-comms layer.
  - **Project isolation**: As described above, full mesh federation does not leak project data to non-member gateways.
  - **messageStr signing integrity**: Verifying with the raw  field eliminated false verification failures observed in pre-v0.2.8 cross-version testing.

### Multi-Tenant Cloud Deployment

Gateway C in the mesh evaluation ran on **Clawporate** (), a hosted platform that demonstrates OGP viability in multi-tenant cloud environments. Key architectural properties:

  - **Per-user containers**: Each user provisioned through the Clawporate portal receives their own OGP gateway container on AWS ECS Fargate. Containers are fully isolated at the process and network level.
  - **Persistent state**: Each container mounts a per-user Amazon EFS workspace, ensuring OGP state (, , key pair) survives container restarts and task replacements.
  - **Auto-update on boot**: Containers run  on startup, ensuring all hosted gateways track the latest stable release.
  - **Portal-managed lifecycle**: The Clawporate portal provisions, starts, and manages gateway containers via AWS DynamoDB (for user registry) and ECS APIs (for container lifecycle). Users receive their gateway URL on signup.

This deployment proves that OGP is not limited to personal peer-to-peer use cases. A hosted multi-tenant deployment can serve as a federation hub, allowing users without the ability to self-host a gateway to participate in OGP-federated agent networks. The per-user isolation model ensures that the hosting provider cannot read one user's OGP state from another's context, and the auto-update mechanism ensures that security fixes propagate to hosted gateways without user action.

### Code Size and Dependencies

The  v0.2.8 package comprises approximately 2,800 lines of TypeScript source. Runtime dependencies remain minimal:

  - : cryptographic operations
  - : intent ID generation
  - : HTTP routing (peer to implementing gateway's existing server)

The small dependency footprint reduces supply-chain attack surface and simplifies deployment in constrained environments, including containerized cloud deployments.

## Discussion

### Limitations

**Trust model scalability.** The bilateral human-approval model scales to small-to-medium peer graphs (tens of peers per gateway) but becomes burdensome for large-scale deployments. Future work could explore trust delegation (allowing a user to pre-approve a class of gateways, e.g., all gateways in an organization) or a web-of-trust propagation scheme.

**Key rotation.** The current protocol ties gateway identity to a single Ed25519 key pair. Key compromise requires revoking and re-establishing all peer relationships. A key rotation mechanism with signed handoff notifications is planned for a future version.

**Intent vocabulary.** Current intent types cover a useful but still-limited slice of possible cross-agent interactions. Richer intents (file transfer, financial transactions, IoT actuator commands) will require careful design of authorization scopes and payload schemas. The namespace prefix mechanism provides extensibility, but interoperability for custom types depends on out-of-band schema sharing.

**Transport assumptions.** OGP requires that both gateways be reachable via HTTPS. Gateways behind NAT or firewalls without public endpoints cannot receive inbound intents. The reference deployment uses a tunnel service (cloudflared) to expose the gateway endpoint; a future protocol extension could define a relay or TURN-like mechanism for NAT traversal. The  skill partially addresses this for the personal deployment case.

**Project log synchronization.** The current project contribution model uses a push-on-contribute strategy. This is simple and low-latency for small member lists, but does not handle network partitions gracefully. A member that is offline at contribution time will miss that entry until a future  call. A more robust distributed log model is future work.

**Evaluation scope.** The three-node mesh evaluation involved gateways under the control of two researchers. Independent multi-party evaluation with gateways operated by different organizations would provide stronger evidence of real-world interoperability.

### Future Work

Several directions are promising for extending OGP:

  - **Synchronous query-peer**: The current  is an async request. A synchronous variant (BUILD-94) would enable real-time collaborative state queries and reduce integration complexity for agent workflows.
  - **QR code remote node pairing**: A QR-based pairing flow (BUILD-101) would allow users to pair a new OGP gateway via a mobile device, eliminating the need to manually exchange gateway URLs.
  - **Group intents**: Broadcasting an intent to a set of peers simultaneously, with aggregated responses, enabling multi-party scheduling without sequential round-trips.
  - **Capability negotiation**: Extending the identity document to include structured capability descriptors so that senders can query receiver capabilities before sending an intent.
  - **Streaming responses**: Long-running agent operations (e.g., research tasks) would benefit from a streaming response mechanism similar to A2A's server-sent events channel.
  - **Formal verification**: The handshake protocol's security properties (mutual authentication, forward secrecy of peer relationships) deserve formal analysis using tools such as ProVerif or Tamarin.
  - **Standards process**: Engaging with IETF or W3C communities to develop OGP into an open standard, ensuring broad adoption and independent security review.
  - **Integration with A2A**: Defining an OGP-to-A2A bridge, allowing OGP-paired gateways to invoke A2A task delegation for richer workflows once mutual trust is established.

### Privacy Considerations

OGP's well-known identity endpoint is publicly readable, which is necessary for peer discovery. This means that any party can learn that a gateway exists at a given URL and retrieve its public key and capability list. Operators who wish to keep their gateway existence private should not publish the well-known endpoint or should restrict access to known IP ranges.

Intent payloads may contain sensitive information (calendar data, personal messages). OGP relies on HTTPS for transport confidentiality; application-level encryption of payloads is not currently specified but is under consideration for a future version.

Project contribution logs may contain sensitive collaboration data. The project isolation guarantee prevents unauthorized peers from reading this data via the OGP protocol, but the logs are stored in plaintext JSON on the local filesystem. Operators should apply appropriate filesystem-level access controls.

## Conclusion

We have presented OGP v0.2.8, a lightweight federation protocol that enables AI gateways to discover, authenticate, and exchange structured intent messages with bilateral human approval, bidirectional scope negotiation, and fine-grained policy control. The addition of the Project Intent Layer extends OGP from a message-passing substrate into a platform for structured multi-agent collaboration with provable isolation semantics.

OGP addresses a concrete gap in the current AI agent ecosystem: the absence of a minimal, human-supervised trust bootstrap layer for peer-to-peer gateway federation. Its design philosophy---minimal bootstrap, human-in-the-loop trust, intent-level policy, and project-scoped isolation---reflects a principled approach to AI agent interoperability that prioritizes user authority over automation convenience.

The three-node mesh validation (Colorado, Spain, and AWS ECS Fargate) conducted on March 26, 2026 confirmed that OGP operates correctly across geographic and network boundaries and deployment modalities, including containerized multi-tenant cloud environments. Project isolation was demonstrated empirically: a gateway fully federated with two others was unable to access a project shared between them. Auto-push, natural language logging, scope auto-grant, and agent-comms all functioned as designed.

The Clawporate hosted deployment demonstrates that OGP is viable beyond personal peer-to-peer use, opening a path toward managed federation hubs that lower the barrier to entry for users who cannot self-host.

OGP is open to community review and extension. We invite feedback on the protocol design, implementation, and security analysis, with the goal of developing OGP into a broadly adopted standard for AI gateway federation.

## Acknowledgments

The author thanks the OpenClaw platform community for tooling support; Stanislav and the Clawporate infrastructure for participation in the March 2026 validation sessions; and the broader agent federation research community for motivating this work.

## References

*See .tex source for full bibliography.*
