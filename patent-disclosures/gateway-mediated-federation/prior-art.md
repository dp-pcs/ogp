# Prior Art

This section documents known prior art and demonstrates how OGP differs fundamentally from existing approaches.

---

## 1. Agent-to-Agent Protocol (A2A)

**Developed by**: Google DeepMind (2024-2025)

**Purpose**: Enable autonomous AI agents to discover and invoke capabilities on other agents.

### Technical Mechanism

**Capability Cards**:
Agents expose JSON-LD documents describing their capabilities:

```json
{
  "@context": "https://schema.org/Agent",
  "agentId": "research-assistant-v2",
  "endpoint": "https://agent.example.com/invoke",
  "capabilities": [
    {
      "name": "search_papers",
      "description": "Search academic papers",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"},
          "year": {"type": "integer"}
        }
      }
    }
  ]
}
```

**Invocation Model**:
- Agent A retrieves Agent B's capability card via HTTP GET
- Agent A validates that capability X exists in card
- Agent A invokes capability X via HTTP POST to Agent B's endpoint
- Agent B authenticates via API key or OAuth token

### Key Differences from OGP

| Dimension | A2A | OGP |
|-----------|-----|-----|
| **Agent Exposure** | Agents are public HTTP endpoints | Agents remain behind gateway |
| **Capability Discovery** | Public capability cards | Gateway advertises intents (not agent capabilities) |
| **Access Control** | All-or-nothing (agent-level auth) | Per-peer scope grants with intent+topic granularity |
| **Authentication** | API keys at agent level | Ed25519 signatures at gateway level |
| **Trust Boundary** | Agent is the boundary | Gateway is the boundary |
| **Gateway Protection** | Bypassed (direct agent access) | Preserved (gateway enforces scopes) |

**Why A2A Cannot Solve the Same Problem**:

A2A fundamentally requires agents to be **directly addressable network endpoints**. This violates the security model of gateway-based frameworks like OpenClaw, where:
- Agents are processes, not services
- All external access must flow through gateway (for auth, rate limiting, audit logging)
- Direct agent exposure creates attack surface for prompt injection, token exhaustion, and data exfiltration

A2A solves "how do agents discover and invoke each other's capabilities" but does NOT solve "how do agents collaborate while remaining behind gateways." OGP addresses a different problem space.

**Prior Art Status**: Disclosed in Google AI Blog (2024-Q3). No known patents filed as of March 2026.

---

## 2. Model Context Protocol (MCP)

**Developed by**: Anthropic (2024)

**Purpose**: Enable AI models (like Claude) to access external context and tools via structured protocol.

### Technical Mechanism

**Server Interface**:
MCP servers expose tools via stdio or HTTP:

```json
{
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {"type": "string"}
        }
      }
    }
  ]
}
```

**Invocation Model**:
- Model (e.g., Claude) runs MCP client
- Client connects to MCP server via stdio or HTTP
- Model invokes tools by sending JSON-RPC requests
- Server executes tool and returns result

### Key Differences from OGP

| Dimension | MCP | OGP |
|-----------|-----|-----|
| **Primary Use Case** | Model-to-tool access | Gateway-to-gateway federation |
| **Communication Model** | Client-server (model is client) | Peer-to-peer (gateways are peers) |
| **Trust Model** | Model trusts server | Bilateral cryptographic trust |
| **Scope Negotiation** | None (client accesses all tools) | Bilateral scope grants |
| **Multi-Organization** | Not designed for this | Primary use case |
| **Gateway Containment** | N/A (no gateway concept) | Core requirement |

**Why MCP Cannot Solve the Same Problem**:

MCP is designed for **single model accessing external tools**, not **multi-organization agent collaboration**. Key gaps:
- No concept of bilateral trust between autonomous systems
- No scope negotiation (model either has access to server or doesn't)
- No cryptographic identity or signature-based authentication
- Not designed for cross-organizational boundaries

MCP and OGP are complementary: MCP defines how a model accesses tools, OGP defines how gateways federate. A federated gateway could expose MCP tools to local agents while using OGP to federate with remote gateways.

**Prior Art Status**: Open source protocol, published by Anthropic (2024-11). No known patents.

---

## 3. ActivityPub (W3C Standard)

**Developed by**: W3C Social Web Working Group (2018)

**Purpose**: Federated social networking protocol enabling decentralized social media (Mastodon, PeerTube).

### Technical Mechanism

**Actor Model**:
Each user is an "actor" with inbox/outbox:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Person",
  "id": "https://mastodon.social/users/alice",
  "inbox": "https://mastodon.social/users/alice/inbox",
  "outbox": "https://mastodon.social/users/alice/outbox",
  "followers": "https://mastodon.social/users/alice/followers",
  "publicKey": {
    "id": "https://mastodon.social/users/alice#main-key",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n..."
  }
}
```

**Federation Model**:
- Server A sends Activity (Create, Like, Follow) to Server B's inbox
- Server B validates HTTP signature using actor's public key
- Activity is delivered to local user's inbox
- Users see activities in timeline

### Key Differences from OGP

| Dimension | ActivityPub | OGP |
|-----------|-------------|-----|
| **Design Paradigm** | Social networking | Agent capability invocation |
| **Message Semantics** | Social objects (Post, Like, Follow) | Intent-based operations (agent-comms, project.query) |
| **Access Control** | Follower/following | Per-peer scope grants |
| **Capability Granularity** | All-or-nothing (follow = see all public posts) | Per-intent + topic filtering |
| **Rate Limiting** | User-level | Per-peer, per-intent |
| **Agent-Native Primitives** | None (designed for humans) | Priority, threading, reply callbacks |
| **Scope Negotiation** | Not supported | Core feature (Layer 2) |

**Why ActivityPub Cannot Solve the Same Problem**:

ActivityPub is designed for **human-to-human social communication** with timeline-centric UX. Key gaps for agent collaboration:
- **Semantic mismatch**: Social activities (posts, likes) don't map to agent operations (query memory, contribute to project)
- **No capability negotiation**: Following a user grants access to their public timeline, not selective access to specific capabilities
- **Missing agent primitives**: No native support for conversation threading, priority levels, or async reply callbacks
- **Access control mismatch**: Social model (public/followers-only) doesn't fit agent model (per-peer, per-capability, per-topic)

While ActivityPub's HTTP signature authentication is conceptually similar to OGP's Ed25519 signatures, the protocols serve fundamentally different problem spaces.

**Prior Art Status**: W3C Recommendation (2018). No known patents (open standard).

---

## 4. Matrix Protocol

**Developed by**: Matrix.org Foundation (2014-present)

**Purpose**: Federated real-time communication protocol for chat, VoIP, and IoT.

### Technical Mechanism

**Room-Based Model**:
Users join rooms (channels) on homeservers:

```json
{
  "type": "m.room.message",
  "sender": "@alice:matrix.org",
  "room_id": "!example:matrix.org",
  "content": {
    "msgtype": "m.text",
    "body": "Hello world"
  }
}
```

**Federation Model**:
- Homeservers exchange events for shared rooms
- Complex state synchronization (room state is DAG)
- End-to-end encryption (Olm/Megolm)
- Server-to-server API for event distribution

### Key Differences from OGP

| Dimension | Matrix | OGP |
|-----------|--------|-----|
| **Design Paradigm** | Chat rooms | Agent capability invocation |
| **State Model** | Complex room state DAG | Stateless message passing |
| **Synchronization** | All servers in room sync state | No state synchronization |
| **Capability Model** | None (room membership) | Intent-based with scope grants |
| **Scale Characteristics** | Large rooms (1000s of users) | Bilateral peer relationships |
| **Agent Semantics** | None (chat-oriented) | Native (priority, topics, threading) |

**Why Matrix Cannot Solve the Same Problem**:

Matrix is designed for **real-time chat** with complex state synchronization. Key gaps for agent collaboration:
- **Semantic mismatch**: Chat rooms don't map to agent capabilities
- **Complexity overhead**: Room state DAG is unnecessary for stateless agent invocations
- **No capability model**: Room membership is binary (in/out), not granular (can invoke X but not Y)
- **State synchronization**: Matrix's core feature (room state sync) is not needed for agent-to-agent RPC

Matrix's federation model is conceptually similar to OGP (server-to-server with signatures), but the protocol is optimized for different use cases.

**Prior Art Status**: Open source protocol. Matrix.org Foundation holds trademarks, no known patents on core protocol.

---

## 5. XMPP/Jabber

**Developed by**: IETF (1999-present, RFC 6120)

**Purpose**: Federated instant messaging and presence protocol.

### Technical Mechanism

**XML-Based Messaging**:
```xml
<message
  from='alice@example.com'
  to='bob@example.org'
  type='chat'>
  <body>Hello Bob!</body>
</message>
```

**Federation Model**:
- XMPP servers connect via TCP (port 5269)
- TLS encryption + SASL authentication
- Server-to-server (S2S) dialback for identity verification
- Presence subscriptions (like following on social media)

### Key Differences from OGP

| Dimension | XMPP | OGP |
|-----------|------|-----|
| **Message Format** | XML | JSON |
| **Transport** | TCP with custom protocol | HTTP/HTTPS (firewall-friendly) |
| **Capability Model** | None (IM-focused) | Intent-based with scope grants |
| **Access Control** | Roster-based (presence subscriptions) | Per-peer scope grants |
| **Agent Semantics** | None (chat/presence) | Native (priority, topics, threading) |
| **Cryptographic Identity** | Domain-based (DNS) | Public key-based (Ed25519) |

**Why XMPP Cannot Solve the Same Problem**:

XMPP is designed for **instant messaging with presence**. Key gaps for agent collaboration:
- **No capability model**: XMPP has no concept of capabilities or scoped permissions
- **XML complexity**: XML is more verbose than JSON, less agent-friendly
- **IM semantics**: Chat messages and presence don't map to agent operations
- **Identity model**: XMPP uses domain names (DNS), not cryptographic keys (breaks when domains change)

While XMPP's federated architecture is conceptually similar to OGP, the protocol is designed for human messaging, not agent capability invocation.

**Prior Art Status**: IETF RFC 6120 (2011). No known patents on core protocol.

---

## 6. Border Gateway Protocol (BGP)

**Developed by**: IETF (1989, RFC 1105; current version RFC 4271, 2006)

**Purpose**: Internet routing protocol enabling autonomous systems (AS) to exchange routing information.

### Technical Mechanism

**AS Path Advertisement**:
```
AS 64500 announces route to 192.0.2.0/24
AS Path: [64500]

AS 64501 receives announcement, adds itself to path
AS Path: [64501, 64500]

AS 64502 receives announcement from AS 64501
AS Path: [64502, 64501, 64500]
```

**Trust Model**:
- Autonomous systems (AS) are independently operated networks
- Each AS trusts its direct neighbors ("trust at the boundary")
- No central authority controls routing (fully decentralized)
- Route filtering policies control which routes are accepted/advertised

### Key Inspiration for OGP

OGP applies BGP's **"trust at the boundary"** principle to AI agents:

| BGP Concept | OGP Equivalent |
|-------------|----------------|
| **Autonomous System (AS)** | Gateway (with agents behind it) |
| **Border Router** | Gateway daemon (OGP daemon) |
| **Route Advertisement** | Intent advertisement (Layer 1 capabilities) |
| **Route Filtering Policy** | Scope grants (Layer 2 negotiation) |
| **AS Path** | Federation path (peer chain) |
| **Trust at Boundary** | Doorman enforcement at gateway layer |

**Key Differences from OGP**:

| Dimension | BGP | OGP |
|-----------|-----|-----|
| **Domain** | IP routing | Agent collaboration |
| **Message Type** | Route announcements | Intent invocations |
| **Trust Token** | AS number | Ed25519 public key |
| **Policy Object** | IP prefix list | Scope bundle (intents + topics) |
| **Enforcement** | Route filtering | Doorman access check |
| **Application Layer** | Network layer (IP) | Application layer (agent RPC) |

**Why BGP is Inspiration, Not Prior Art**:

BGP is a **network routing protocol**, not an application-layer federation protocol. OGP takes the architectural principle ("trust at the boundary, filter at the edge") and applies it to a completely different domain (agent collaboration). The technical mechanisms are entirely different:
- BGP exchanges route announcements (IP prefixes), OGP exchanges intent invocations (agent operations)
- BGP uses AS numbers (globally coordinated), OGP uses public keys (no coordination needed)
- BGP operates at network layer, OGP operates at application layer

BGP is cited as **inspiration** for the architectural approach, not as prior art that solves the same problem.

**Prior Art Status**: IETF RFC 4271 (2006). No known patents on core protocol (widely implemented standard).

---

## 7. OAuth 2.0 / Delegated Authorization

**Developed by**: IETF (RFC 6749, 2012)

**Purpose**: Delegated authorization framework enabling third-party applications to access resources on behalf of a user.

### Technical Mechanism

**Authorization Flow**:
1. Client (app) requests authorization from resource owner (user)
2. User grants authorization via authorization server
3. Client receives access token
4. Client uses access token to access protected resources

**Scope Mechanism**:
```
GET /authorize?
  client_id=abc123&
  redirect_uri=https://app.example.com/callback&
  scope=read:profile+write:posts
```

### Key Differences from OGP

| Dimension | OAuth 2.0 | OGP |
|-----------|-----------|-----|
| **Primary Use Case** | User authorizes app to access resources | Gateway-to-gateway federation |
| **Trust Model** | User trusts authorization server | Bilateral peer trust |
| **Scope Definition** | User grants scopes to app | Gateways negotiate scopes bilaterally |
| **Token Type** | Bearer tokens (centrally issued) | Cryptographic signatures (peer-issued) |
| **Identity Provider** | Central authority (authorization server) | Decentralized (Ed25519 public keys) |

**Why OAuth Cannot Solve the Same Problem**:

OAuth is designed for **delegated authorization** (user grants app access to their data on another service). Key gaps for agent collaboration:
- **Centralized model**: Requires authorization server (OGP is peer-to-peer)
- **Human-in-the-loop**: OAuth assumes user approves delegations (OGP automates scope negotiation)
- **Token security**: Bearer tokens can be stolen; Ed25519 signatures cannot
- **No bilateral negotiation**: OAuth is unidirectional (user → app), OGP is bilateral (gateway ↔ gateway)

While OAuth's scope mechanism is conceptually similar to OGP's scope grants, the trust models are fundamentally different (centralized vs. decentralized).

**Prior Art Status**: IETF RFC 6749 (2012). No known patents on core protocol.

---

## Summary Comparison

| Protocol | Domain | Trust Model | Capability Model | Solves Gateway Federation? |
|----------|--------|-------------|------------------|----------------------------|
| **A2A** | Agent-to-agent | Direct agent trust | Public capability cards | **No** (requires agent exposure) |
| **MCP** | Model-to-tool | Client-server | Tool schemas | **No** (single-org, not federation) |
| **ActivityPub** | Social networking | Server-to-server | Follower model | **No** (wrong semantics) |
| **Matrix** | Real-time chat | Homeserver federation | Room membership | **No** (wrong semantics, complex state) |
| **XMPP** | Instant messaging | Server-to-server | Roster/presence | **No** (IM-focused, no capabilities) |
| **BGP** | IP routing | AS-to-AS | Route policies | **No** (network layer, not application) |
| **OAuth 2.0** | Delegated auth | Centralized (auth server) | User-granted scopes | **No** (centralized, not P2P) |
| **OGP** | Gateway federation | Bilateral P2P | Intent-based scope grants | **Yes** |

---

## Novel Contribution of OGP

OGP is the **first protocol** to address the specific problem of **gateway-mediated agent federation with containment preservation**. While it draws architectural inspiration from BGP ("trust at the boundary") and uses standard cryptographic primitives (Ed25519 signatures), the core contribution is novel:

1. **Three-layer scope isolation** (capabilities/negotiation/enforcement) applied to agent collaboration
2. **Bilateral intent negotiation** with automatic symmetric mirroring
3. **Doorman runtime enforcement** validating cryptographically-signed scope grants before agent invocation
4. **Hierarchical topic policies** with four-level fallthrough for fine-grained agent control
5. **Public-key-based stable identity** independent of network addressing

No prior art combines these elements to solve "agents behind gateways cannot collaborate without compromising the security boundary."

---

## Patent Search Notes

**Search Conducted**: March 2026

**Keywords**:
- "gateway mediated federation"
- "agent to agent gateway"
- "bilateral scope negotiation"
- "cryptographic intent routing"
- "Ed25519 agent authentication"

**Databases Searched**:
- USPTO Patent Full-Text Database
- Google Patents
- European Patent Office (Espacenet)
- WIPO PatentScope

**Result**: No patents found addressing gateway-mediated agent federation with bilateral scope negotiation. Existing patents focus on:
- Direct agent-to-agent communication (no gateway mediation)
- Centralized authorization servers (no bilateral P2P trust)
- Network-layer federation (BGP variants, not application layer)
- Social federation (ActivityPub-style, wrong semantics)

**Conclusion**: OGP's approach appears novel and non-obvious in the patent landscape as of March 2026.
