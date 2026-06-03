# Case Studies

## Case Study 1: Colorado-Spain Collaboration (Happy Path)

### Scenario

**Participants:**
- Alice (Colorado): Gateway A at `https://alice-tunnel.ngrok.io`, Ed25519 public key `a1b2c3d4...` (peer ID: `a1b2c3d4e5f6g7h8`)
- Bob (Spain): Gateway B at `https://bob-cloudflare.com`, Ed25519 public key `f9e8d7c6...` (peer ID: `f9e8d7c6b5a4321`)

**Use Case:** Alice and Bob are collaborating on a software project. Alice's agent needs to query Bob's agent about design decisions related to the project.

### Protocol Flow

**Step 1: Federation Request (Alice → Bob)**

```http
POST https://bob-cloudflare.com/federation/request
Content-Type: application/json

{
  "fromGatewayId": "a1b2c3d4e5f6g7h8",
  "fromDisplayName": "Alice (Colorado)",
  "fromGatewayUrl": "https://alice-tunnel.ngrok.io",
  "fromPublicKey": "a1b2c3d4...",
  "fromEmail": "alice@example.com",
  "timestamp": 1742572800000,
  "protocolVersion": "0.2.0",
  "scopeGrants": {
    "intents": [
      {
        "intent": "agent-comms",
        "topics": ["project-validation", "general"],
        "rateLimit": {"requests": 100, "windowSeconds": 3600}
      },
      {
        "intent": "message",
        "rateLimit": {"requests": 50, "windowSeconds": 3600}
      }
    ]
  }
}
```

**Step 2: User Approval (Bob)**

Bob runs CLI command:
```bash
ogp federation list-requests
# Shows pending request from a1b2c3d4e5f6g7h8 (Alice)

ogp federation approve a1b2c3d4e5f6g7h8
```

**Step 3: Approval Response (Bob → Alice)**

Bob's gateway automatically sends approval with symmetric scope mirroring:

```http
POST https://alice-tunnel.ngrok.io/federation/approve
Content-Type: application/json

{
  "fromGatewayId": "f9e8d7c6b5a4321",
  "fromDisplayName": "Bob (Spain)",
  "fromGatewayUrl": "https://bob-cloudflare.com",
  "fromPublicKey": "f9e8d7c6...",
  "fromEmail": "bob@example.com",
  "timestamp": 1742573100000,
  "protocolVersion": "0.2.0",
  "scopeGrants": {
    "intents": [
      {
        "intent": "agent-comms",
        "topics": ["project-validation", "general"],
        "rateLimit": {"requests": 100, "windowSeconds": 3600}
      },
      {
        "intent": "message",
        "rateLimit": {"requests": 50, "windowSeconds": 3600}
      }
    ]
  }
}
```

Note: Bob's gateway mirrors Alice's offered scopes back to her (symmetric scope mirroring).

**Step 4: Agent Communication (Alice → Bob)**

Alice's agent queries Bob's agent about project architecture:

```http
POST https://bob-cloudflare.com/federation/message
Content-Type: application/json

{
  "fromGatewayId": "a1b2c3d4e5f6g7h8",
  "intent": "agent-comms",
  "payload": {
    "topic": "project-validation",
    "priority": "normal",
    "content": "What's the current status of the authentication refactor?",
    "conversationId": "conv-12345",
    "replyTo": "https://alice-tunnel.ngrok.io/federation/message"
  },
  "timestamp": 1742573200000,
  "signature": "<Ed25519 signature of canonical JSON>"
}
```

**Step 5: Doorman Validation (Bob's Gateway)**

Bob's doorman (`doorman.ts:checkAccess()`) performs 6-step validation:

1. **Peer Lookup**: Find peer with ID `a1b2c3d4e5f6g7h8` ✓
2. **Approval Status**: Peer status is `approved` ✓
3. **Scope Bundle**: Retrieve granted scopes from peer record ✓
4. **Intent Grant**: Find grant for intent `agent-comms` ✓
5. **Topic Coverage**: Check if topic `project-validation` is in grant's topics array ✓
6. **Rate Limit**: Check sliding window for `a1b2c3d4e5f6g7h8:agent-comms` ✓ (5 requests in last hour, limit is 100)

Result: `{ allowed: true }`

**Step 6: Message Routing (Bob's Gateway → Bob's Agent)**

Message is routed to Bob's agent via:

```http
POST http://localhost:3000/api/sessions/send
Content-Type: application/json
Authorization: Bearer <Bob's agent token>

{
  "sessionId": "<Bob's active session>",
  "message": "What's the current status of the authentication refactor?",
  "metadata": {
    "source": "federation",
    "peer": "a1b2c3d4e5f6g7h8",
    "topic": "project-validation",
    "conversationId": "conv-12345"
  }
}
```

**Step 7: Agent Response (Bob's Agent → Alice)**

Bob's agent replies via the `replyTo` callback:

```http
POST https://alice-tunnel.ngrok.io/federation/message
Content-Type: application/json

{
  "fromGatewayId": "f9e8d7c6b5a4321",
  "intent": "agent-comms",
  "payload": {
    "topic": "project-validation",
    "priority": "normal",
    "content": "The authentication refactor is 80% complete. We've migrated to JWT tokens but still need to implement refresh token rotation.",
    "conversationId": "conv-12345",
    "inReplyTo": "conv-12345"
  },
  "timestamp": 1742573250000,
  "signature": "<Ed25519 signature>"
}
```

### Key Observations

- **Zero configuration after approval**: Alice and Bob only needed to approve each other once. All subsequent communication is automatic.
- **Symmetric scopes**: Both peers can now query each other with the same capabilities.
- **Cryptographic trust**: Every message is Ed25519-signed and verified at the doorman layer.
- **Agent containment preserved**: Neither agent is directly exposed. All traffic flows through gateways.
- **Topic-based routing**: Message is routed based on topic `project-validation`, which Bob's agent has configured as allowed.

---

## Case Study 2: Rate Limit Enforcement + Topic Denial

### Scenario

**Participants:**
- Charlie: Gateway C at `https://charlie.example.com`
- Dave: Gateway D at `https://dave.example.com`

**Use Case:** Charlie's automated monitoring service queries Dave's agent frequently. Dave has granted limited scope with rate limits to prevent abuse.

### Setup

Dave approves Charlie with restricted scope:

```bash
ogp federation approve <charlie-peer-id> --intents agent-comms --rate 10/3600 --topics monitoring
```

This creates a scope grant:
```json
{
  "intent": "agent-comms",
  "topics": ["monitoring"],
  "rateLimit": {"requests": 10, "windowSeconds": 3600}
}
```

### Flow 1: Successful Query Within Limit

**Request 1-10** (within 1 hour):
```http
POST https://dave.example.com/federation/message
{
  "fromGatewayId": "<charlie-peer-id>",
  "intent": "agent-comms",
  "payload": {
    "topic": "monitoring",
    "content": "Check system health"
  }
}
```

**Doorman Response**: `{ allowed: true }` ✓

Dave's agent receives the query and responds normally.

### Flow 2: Rate Limit Exceeded

**Request 11** (still within 1 hour):
```http
POST https://dave.example.com/federation/message
{
  "fromGatewayId": "<charlie-peer-id>",
  "intent": "agent-comms",
  "payload": {
    "topic": "monitoring",
    "content": "Check system health"
  }
}
```

**Doorman Response**:
```json
{
  "allowed": false,
  "reason": "Rate limit exceeded for intent 'agent-comms'",
  "statusCode": 429,
  "retryAfter": 2847
}
```

**HTTP Response to Charlie**:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 2847
Content-Type: application/json

{
  "error": "Rate limit exceeded for intent 'agent-comms'",
  "retryAfter": 2847
}
```

Note: `retryAfter` is precisely calculated: the oldest request in the sliding window will expire in 2847 seconds, at which point Charlie can send a new request.

### Flow 3: Topic Denial

Charlie attempts to query outside granted topic:

```http
POST https://dave.example.com/federation/message
{
  "fromGatewayId": "<charlie-peer-id>",
  "intent": "agent-comms",
  "payload": {
    "topic": "financial-data",
    "content": "What's the quarterly revenue?"
  }
}
```

**Doorman Response**:
```json
{
  "allowed": false,
  "reason": "Topic 'financial-data' not allowed for intent 'agent-comms'",
  "statusCode": 403
}
```

**HTTP Response to Charlie**:
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "Topic 'financial-data' not allowed for intent 'agent-comms'"
}
```

The request is rejected at the gateway layer. Dave's agent never sees the query.

### Key Observations

- **Gateway-level enforcement**: Rate limiting and topic filtering happen at the doorman layer, protecting the agent from unauthorized queries.
- **Precise retry calculation**: The sliding window algorithm tells Charlie exactly when they can retry (2847 seconds), not a generic "try again later".
- **Topic isolation**: Charlie cannot probe for topics outside their granted scope. Failed queries do not leak information about whether the topic exists.
- **No silent drops**: All denials return signed error responses, so Charlie knows the request was received and explicitly rejected (not lost in transit).

---

## Case Study 3: Three-Node Mesh with Project Isolation

### Scenario

**Participants:**
- Alice, Bob, Charlie with gateways A, B, C
- Federation topology: A ↔ B, B ↔ C, A ↔ C (full mesh)
- Project P is owned jointly by Alice and Bob (NOT Charlie)

**Use Case:** Verify that transitive federation does not grant transitive access. Charlie should NOT be able to access project P despite being federated with both Alice and Bob.

### Setup

All three gateways federate with each other with default scopes:
```json
{
  "intents": [
    {
      "intent": "agent-comms",
      "topics": ["*"],
      "rateLimit": {"requests": 100, "windowSeconds": 3600}
    },
    {
      "intent": "project.query",
      "rateLimit": {"requests": 50, "windowSeconds": 3600}
    }
  ]
}
```

Alice and Bob create a shared project:
```bash
# On Alice's gateway
ogp project create shared-refactor --members alice,bob

# On Bob's gateway
ogp project join shared-refactor --owner alice
```

### Flow 1: Bob Queries Alice's Project (Allowed)

Bob sends project query:
```http
POST https://alice.example.com/federation/message
{
  "fromGatewayId": "<bob-peer-id>",
  "intent": "project.query",
  "payload": {
    "projectId": "shared-refactor",
    "action": "list-contributions"
  }
}
```

**Doorman Validation**:
1. Peer lookup: Bob is approved ✓
2. Scope grant: Bob has `project.query` intent ✓
3. Rate limit: Within limit ✓

**Project Membership Check** (`projects.ts:isProjectMember()`):
```typescript
const project = getProject("shared-refactor");
// project.members = ["alice", "bob"]
const isMember = project.members.includes("<bob-peer-id>");
// isMember = true ✓
```

**Result**: Query succeeds. Alice's agent returns project contributions.

### Flow 2: Charlie Queries Alice's Project (Denied)

Charlie sends identical query:
```http
POST https://alice.example.com/federation/message
{
  "fromGatewayId": "<charlie-peer-id>",
  "intent": "project.query",
  "payload": {
    "projectId": "shared-refactor",
    "action": "list-contributions"
  }
}
```

**Doorman Validation**:
1. Peer lookup: Charlie is approved ✓
2. Scope grant: Charlie has `project.query` intent ✓
3. Rate limit: Within limit ✓

**Project Membership Check**:
```typescript
const project = getProject("shared-refactor");
// project.members = ["alice", "bob"]
const isMember = project.members.includes("<charlie-peer-id>");
// isMember = false ✗
```

**HTTP Response to Charlie**:
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "You are not a member of project 'shared-refactor'"
}
```

### Flow 3: Charlie Queries Bob's Project (Also Denied)

Charlie tries querying Bob's gateway:
```http
POST https://bob.example.com/federation/message
{
  "fromGatewayId": "<charlie-peer-id>",
  "intent": "project.query",
  "payload": {
    "projectId": "shared-refactor",
    "action": "list-contributions"
  }
}
```

Same membership check fails on Bob's gateway. Charlie is denied.

### Key Observations

- **Transitive trust ≠ transitive access**: Charlie is federated with both Alice and Bob, but this does NOT grant access to their shared project.
- **Project-level ACLs compose with federation ACLs**: Layer 3 (doorman) validates federation scope; project handler validates project membership. Both must pass.
- **No information leakage**: Charlie learns the project exists (error message confirms the project ID), but cannot enumerate contributions or members.
- **Mesh topology security**: Full-mesh federation (A ↔ B ↔ C ↔ A) does NOT create transitive access paths. Each peer-pair relationship is isolated.

---

## Case Study 4: Gateway URL Rotation (Tunnel Stability)

### Scenario

**Participant:** Eve (home user behind NAT using ngrok tunnel)

**Use Case:** Eve's ngrok tunnel URL changes (ngrok free tier rotates URLs on restart). Federation relationships must remain stable despite URL changes.

### Initial Setup

Eve's gateway starts with ngrok tunnel:
```bash
ngrok http 18790
# Public URL: https://abc123.ngrok.io
```

Eve federates with Frank:
```http
POST https://frank.example.com/federation/request
{
  "fromGatewayId": "e5v2e1...",  // Derived from Ed25519 public key
  "fromGatewayUrl": "https://abc123.ngrok.io",
  "fromPublicKey": "e5v2e1d3..."
}
```

Frank approves Eve. Peer record stores:
```json
{
  "id": "e5v2e1...",
  "gatewayUrl": "https://abc123.ngrok.io",
  "publicKey": "e5v2e1d3...",
  "status": "approved"
}
```

### Tunnel Rotation

Eve restarts ngrok → new URL:
```bash
ngrok http 18790
# New URL: https://xyz789.ngrok.io
```

Eve sends federation message to Frank:
```http
POST https://frank.example.com/federation/message
{
  "fromGatewayId": "e5v2e1...",  // Same peer ID (derived from public key)
  "intent": "message",
  "payload": {...},
  "signature": "<Ed25519 signature with same private key>"
}
```

**Doorman Validation on Frank's Gateway**:

1. **Peer Lookup by ID**: Find peer with ID `e5v2e1...` ✓
2. **Signature Verification**: Verify signature against stored public key `e5v2e1d3...` ✓
   - Even though the message came from a different URL (`xyz789.ngrok.io` instead of `abc123.ngrok.io`), the Ed25519 signature proves the sender controls the same private key
3. **URL Update**: Frank's gateway automatically updates Eve's stored URL:
   ```typescript
   if (peer.gatewayUrl !== incomingUrl) {
     peer.gatewayUrl = incomingUrl;
     savePeers();  // Atomic write to ~/.ogp/peers.json
   }
   ```

**Result**: Message is accepted. Frank's peer record now shows:
```json
{
  "id": "e5v2e1...",
  "gatewayUrl": "https://xyz789.ngrok.io",  // Updated
  "publicKey": "e5v2e1d3...",
  "status": "approved"
}
```

### Key Observations

- **Identity = public key, not URL**: Peer identity is derived from Ed25519 public key, making it stable across network changes.
- **Automatic URL updates**: Gateways automatically update peer URLs when receiving signed messages from new addresses.
- **No re-approval needed**: Eve doesn't need to re-request federation when her tunnel rotates. The bilateral trust relationship persists.
- **Home user support**: This makes OGP viable for home users behind NAT who cannot maintain static public IPs.

---

## Summary of Case Study Insights

| Case Study | Key Innovation Demonstrated |
|------------|----------------------------|
| 1. Colorado-Spain | Symmetric scope mirroring, agent containment, topic routing |
| 2. Rate Limit + Topic Denial | Gateway-level enforcement, precise retry-after, topic isolation |
| 3. Three-Node Mesh | Transitive trust ≠ transitive access, project-level ACL composition |
| 4. Tunnel Rotation | Public-key identity stability, automatic URL updates, home user support |

These case studies validate the core claims:
- Federation preserves agent containment
- Cryptographic identity enables network mobility
- Scope grants enforce fine-grained access control
- Transitive federation does not create transitive access
- Protocol is viable for home users and enterprises alike
