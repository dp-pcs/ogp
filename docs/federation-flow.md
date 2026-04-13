# Federation Flow

Detailed walkthrough of OGP federation message flows.

## Table of Contents

1. [Discovery](#discovery)
2. [Federation Request](#federation-request)
3. [Federation Approval](#federation-approval)
4. [Message Exchange](#message-exchange)
5. [Federation Removal (Asymmetric Tear-Down)](#federation-removal-asymmetric-tear-down)
6. [Security Model](#security-model)

## Discovery

Before federating, peers discover each other via the `/.well-known/ogp` endpoint.

### Request

```http
GET /.well-known/ogp HTTP/1.1
Host: peer.example.com
```

### Response

```json
{
  "version": "0.2.3",
  "displayName": "Alice",
  "email": "alice@example.com",
  "gatewayUrl": "https://peer.example.com",
  "publicKey": "302a300506032b6570032100abc123...",
  "agentId": "main",
  "capabilities": {
    "intents": ["message", "task-request", "status-update", "agent-comms", "project.join", "project.contribute", "project.query", "project.status"],
    "features": ["scope-negotiation", "reply-callback"]
  },
  "endpoints": {
    "request": "https://peer.example.com/federation/request",
    "approve": "https://peer.example.com/federation/approve",
    "reply": "https://peer.example.com/federation/reply/:nonce"
  }
}
```

This endpoint:
- Is unauthenticated (public discovery)
- Returns peer identity and public key
- Lists federation endpoints
- Advertises gateway capabilities (v0.2.0+)
- Indicates supported intents and features
- Includes `agentId` (v0.2.28+) - identifies which OpenClaw agent owns this gateway

## Federation Request

Alice wants to federate with Bob. Alice sends a signed request.

### Alice's Side

In v0.2.3, the peer-id is **optional** and auto-resolves from the gateway's `/.well-known/ogp`:

```bash
ogp federation request https://bob.example.com
```

Or specify a custom peer-id:

```bash
ogp federation request https://bob.example.com --alias bob
```

This:
1. Fetches Bob's `/.well-known/ogp` to discover peer info
2. Auto-resolves peer-id if not provided (uses hostname or displayName)
3. Loads Alice's keypair
4. Builds peer info with Alice's public key
5. Signs the peer info with Alice's private key
6. POSTs to Bob's `/federation/request`
7. Fires an OpenClaw notification (via Telegram if configured)

### Request

```http
POST /federation/request HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "peer": {
    "id": "peer-alice",
    "displayName": "Alice",
    "email": "alice@example.com",
    "gatewayUrl": "https://alice.example.com",
    "publicKey": "302a300506032b6570032100def456..."
  },
  "signature": "a1b2c3d4e5f6..."
}
```

### Bob's Side

Bob's OGP daemon:
1. Receives request
2. Stores peer as `pending`
3. Returns acknowledgment

```json
{
  "received": true,
  "status": "pending",
  "message": "Federation request received and pending approval"
}
```

Bob sees the request:

```bash
$ ogp federation list --status pending

PENDING PEERS:

  alice
    Name: Alice
    Status: pending
    Gateway: https://alice.example.com
    Public key: 302a300506032b6570032100def456...
```

## Federation Approval

Bob approves Alice's request. In v0.2.0+, Bob can include **scope grants** to control what Alice can access.

### Bob's Side

Approve with scope grants (v0.2.0+):

```bash
ogp federation approve alice \
  --intents message,agent-comms \
  --rate 100/3600 \
  --topics memory-management,task-delegation
```

Or approve without restrictions (v0.1 compatibility):

```bash
ogp federation approve alice
```

This:
1. Updates peer status to `approved` in `~/.ogp/peers.json`
2. Stores scope grants with the peer record
3. POSTs approval to Alice's `/federation/approve`

### Request

v0.2.0+ approval includes scope bundle:

```http
POST /federation/approve HTTP/1.1
Host: alice.example.com
Content-Type: application/json

{
  "peerId": "peer-alice",
  "approved": true,
  "protocolVersion": "0.2.3",
  "scopeGrants": {
    "version": "0.2.0",
    "grantedAt": "2026-03-24T10:30:00Z",
    "scopes": [
      {
        "intent": "message",
        "enabled": true,
        "rateLimit": {
          "requests": 100,
          "windowSeconds": 3600
        }
      },
      {
        "intent": "agent-comms",
        "enabled": true,
        "topics": ["memory-management", "task-delegation"],
        "rateLimit": {
          "requests": 100,
          "windowSeconds": 3600
        }
      }
    ]
  }
}
```

v0.1 approval (backward compatible):

```http
POST /federation/approve HTTP/1.1
Host: alice.example.com
Content-Type: application/json

{
  "peerId": "peer-alice",
  "approved": true
}
```

### Alice's Side

Alice's OGP daemon:
1. Receives approval
2. Updates Bob's status to `approved`
3. Stores received scope grants (what Alice can request from Bob)

Now both sides have approved peers:

```bash
$ ogp federation list --status approved

APPROVED PEERS:

  bob
    Name: Bob
    Status: approved
    Gateway: https://bob.example.com
    Public key: 302a300506032b6570032100abc123...
    Granted scopes: message, agent-comms
    Rate limit: 100 requests / 3600 seconds
```

View detailed scopes:

```bash
$ ogp federation scopes bob

Scopes granted TO bob (what they can request from you):
  [not configured - full access]

Scopes received FROM bob (what you can request from them):
  • message (enabled)
    Rate limit: 100 requests / 3600 seconds

  • agent-comms (enabled)
    Topics: memory-management, task-delegation
    Rate limit: 100 requests / 3600 seconds
```

## Message Exchange

Alice sends a message to Bob.

### Alice Sends

```bash
ogp federation send bob message '{"text":"Hello, Bob!"}'
```

This:
1. Builds message object with intent, nonce, timestamp, payload
2. Signs message with Alice's private key
3. POSTs to Bob's `/federation/message`

### Request

```http
POST /federation/message HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "message": {
    "intent": "message",
    "from": "peer-alice",
    "to": "peer-bob",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-19T10:30:00.000Z",
    "payload": {
      "text": "Hello, Bob!"
    }
  },
  "signature": "a1b2c3d4e5f6..."
}
```

### Bob Receives

Bob's OGP daemon (doorman):
1. Verifies sender (`peer-alice`) is in approved peers
2. **Checks scope grants** - Is `message` intent allowed for Alice? (v0.2.0+)
3. **Checks rate limits** - Has Alice exceeded their quota? (v0.2.0+)
4. Verifies signature using Alice's public key
5. Checks intent exists in registry
6. Forwards to Bob's OpenClaw via the local platform delivery backend

If scope check fails:
- Response: `403 Forbidden`
- Message: `"Intent 'message' not granted"`

If rate limit exceeded:
- Response: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`
- Message: `"Rate limit exceeded for intent 'message'"`

### OpenClaw Notification

For human-facing federated work, the OpenClaw reference path is now an agent-turn hook rather than raw session injection:

```http
POST /hooks/agent HTTP/1.1
Host: bob-openclaw.local:18789
Authorization: Bearer <hooks-token>
Content-Type: application/json

{
  "agentId": "main",
  "text": "[OGP Federation] Alice says: Hello, Bob!",
  "metadata": {
    "ogp": {
      "from": "peer-alice",
      "intent": "message",
      "nonce": "550e8400-e29b-41d4-a716-446655440000",
      "payload": {
        "text": "Hello, Bob!"
      }
    }
  }
}
```

That lets OpenClaw run a real agent turn, apply the configured human-delivery policy, and decide how to surface the result to the human.

If OGP needs direct session injection for fallback or synchronization, it uses Gateway RPC against the TLS-enabled local gateway:

```bash
openclaw gateway call --url wss://localhost:18789 sessions.send ...
```

`sessions.send` is still useful, but it is not the primary delivery primitive for human-facing federated work.

Bob's OpenClaw agent sees the resulting human-facing output in the configured channel:

```
[OGP] Message from Alice: Hello, Bob!
```

### Response

Bob's OGP daemon responds to Alice:

```json
{
  "received": true,
  "timestamp": "2026-03-19T10:30:01.000Z"
}
```

## Agent-Comms Flow (v0.2.0+)

Agent-comms enables rich agent-to-agent communication with topic routing, priority, and reply support.

### Alice Sends Agent-Comms

```bash
ogp federation agent bob memory-management "How do you persist context?" --priority high --wait
```

### Request

```http
POST /federation/message HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "message": {
    "intent": "agent-comms",
    "from": "peer-alice",
    "to": "peer-bob",
    "nonce": "abc-123-def-456",
    "timestamp": "2026-03-24T10:30:00Z",
    "replyTo": "https://alice.example.com/federation/reply/abc-123-def-456",
    "payload": {
      "topic": "memory-management",
      "message": "How do you persist context?",
      "priority": "high"
    }
  },
  "signature": "a1b2c3d4e5f6..."
}
```

### Bob Receives with Policy

Bob's doorman:
1. Verifies Alice is approved
2. **Checks intent grant** - Does Alice have `agent-comms` access?
3. **Checks topic grant** - Is `memory-management` in Alice's allowed topics?
4. **Checks rate limit** - Within quota?
5. Verifies signature
6. **Loads response policy** - How should Bob's agent respond?
7. Forwards to OpenClaw with policy metadata

Bob sees:

```
[OGP Agent-Comms] [HIGH] Alice → memory-management [FULL]: How do you persist context?
```

The `[FULL]` indicator tells Bob's agent to respond openly based on the configured response policy.

### Bob Replies

Bob's agent can reply via the `replyTo` callback URL:

```http
POST /federation/reply/abc-123-def-456 HTTP/1.1
Host: alice.example.com
Content-Type: application/json

{
  "reply": {
    "nonce": "abc-123-def-456",
    "success": true,
    "data": {
      "answer": "We use PostgreSQL with a custom context table that stores conversation history..."
    },
    "timestamp": "2026-03-24T10:30:05Z"
  },
  "signature": "x1y2z3..."
}
```

Alice's agent receives the reply and completes the `--wait` operation.

## Project Intent Flow (v0.2.0+)

Project intents enable collaborative project management across federated peers.

### Alice Sends Contribution

```bash
ogp project send-contribution bob shared-app progress "Completed authentication system"
```

### Request

```http
POST /federation/message HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "message": {
    "intent": "project",
    "from": "peer-alice",
    "to": "peer-bob",
    "nonce": "proj-123-456",
    "timestamp": "2026-03-24T11:00:00Z",
    "payload": {
      "action": "contribute",
      "projectId": "shared-app",
      "contribution": {
        "entryType": "progress",
        "summary": "Completed authentication system",
        "metadata": {
          "files": ["src/auth.ts", "src/jwt.ts"],
          "tests": "all passing"
        }
      }
    }
  },
  "signature": "a1b2c3d4..."
}
```

### Bob Receives

Bob's daemon:
1. Verifies Alice is approved
2. Checks `project` intent grant
3. Verifies signature
4. **Stores contribution** in local project record
5. Notifies OpenClaw agent

Bob sees:

```
[OGP Project] Alice contributed to shared-app (entry type: progress): Completed authentication system
```

### Alice Queries Bob's Project

```bash
ogp project query-peer bob shared-app --limit 10
```

### Request

```http
POST /federation/message HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "message": {
    "intent": "project",
    "from": "peer-alice",
    "to": "peer-bob",
    "nonce": "proj-789-012",
    "timestamp": "2026-03-24T11:05:00Z",
    "replyTo": "https://alice.example.com/federation/reply/proj-789-012",
    "payload": {
      "action": "query",
      "projectId": "shared-app",
      "filters": {
        "limit": 10
      }
    }
  },
  "signature": "b2c3d4e5..."
}
```

### Bob's Response

Bob's daemon replies with project contributions:

```http
POST /federation/reply/proj-789-012 HTTP/1.1
Host: alice.example.com
Content-Type: application/json

{
  "reply": {
    "nonce": "proj-789-012",
    "success": true,
    "data": {
      "projectId": "shared-app",
      "projectName": "Shared Mobile App",
      "contributions": [
        {
          "entryType": "progress",
          "summary": "Deployed staging environment",
          "author": "peer-bob",
          "timestamp": "2026-03-24T10:00:00Z"
        },
        {
          "entryType": "blocker",
          "summary": "Waiting for API key approval",
          "author": "peer-bob",
          "timestamp": "2026-03-23T15:30:00Z"
        }
      ]
    },
    "timestamp": "2026-03-24T11:05:01Z"
  },
  "signature": "c3d4e5f6..."
}
```

Alice receives a unified view of project activity from both local and Bob's contributions.

## Federation Removal (Asymmetric Tear-Down)

Federation can be terminated by either peer at any time. OGP uses **asymmetric removal** — when one peer removes the other, the removed peer is notified but does not need to acknowledge the removal for it to take effect.

### How Asymmetric Removal Works

1. **Initiator removes peer** — Alice decides to remove Bob from her federation list
2. **Notification sent (best-effort)** — Alice's daemon POSTs to Bob's `/federation/removed` endpoint
3. **Removal takes effect immediately** — Alice's side is updated regardless of whether Bob receives the notification
4. **Bob is notified (if reachable)** — If Bob's gateway is online, he receives the notification and updates his peer list

**Important:** The removal notification is **best-effort only**. Network failures, firewalls, or offline peers do not prevent removal. The removing peer's decision is authoritative.

### Alice Removes Bob

```bash
ogp federation remove bob
```

This:
1. Signs a removal payload with Alice's private key
2. POSTs the notification to Bob's `/federation/removed` endpoint
3. Updates Bob's status to `removed` in Alice's `~/.ogp/peers.json`
4. Notifies Alice's OpenClaw agent of the removal

Alice sees:
```
✓ Notified peer of removal
✓ Removed peer: bob (Bob)
```

If Bob is unreachable:
```
⚠ Could not notify peer of removal: fetch failed
✓ Removed peer: bob (Bob)
```

The removal still succeeds — the warning only indicates Bob wasn't notified.

### Removal Notification Payload

Alice sends to Bob's `/federation/removed`:

```http
POST /federation/removed HTTP/1.1
Host: bob.example.com
Content-Type: application/json

{
  "peerId": "peer-alice",
  "timestamp": "2026-04-02T04:10:00.000Z",
  "signature": "a1b2c3d4e5f6..."
}
```

The signature covers the JSON-serialized payload `{peerId, timestamp}` signed with Alice's Ed25519 private key.

### Bob Receives Removal Notification

Bob's OGP daemon:
1. Validates required fields (`peerId`, `timestamp`, `signature`)
2. Finds the peer by `peerId` (404 if unknown)
3. Verifies the signature using Alice's public key (403 if invalid)
4. Checks timestamp freshness (5-minute window, 400 if stale)
5. Updates Alice's status to `removed` in `~/.ogp/peers.json`
6. Notifies Bob's OpenClaw agent

Bob sees:
```
[OGP Federation Removed] Alice (peer-alice) has removed your gateway from their federation
Your gateway is no longer federated with Alice.
You can re-establish federation by sending a new request if needed.
```

### Bob's Response to Alice

```json
{
  "success": true,
  "peerId": "peer-alice",
  "status": "removed"
}
```

Error responses:
- `400` — Missing required fields or stale timestamp
- `403` — Invalid signature (possible impersonation attempt)
- `404` — Unknown peer (peer already removed or never existed)
- `500` — Failed to update peer status

### Re-establishing Federation

After removal, either peer can re-establish federation by sending a new request:

```bash
# Alice wants to federate with Bob again
ogp federation request https://bob.example.com

# Or Bob initiates
ogp federation request https://alice.example.com
```

The new request goes through the normal request → approval flow.

### Removed Peer Status

Peers with `removed` status remain in `~/.ogp/peers.json` for audit purposes but:
- Cannot send messages to you
- Do not appear in `ogp federation list` by default
- Can be viewed with `ogp federation list --status removed` (flag not yet implemented)
- Can be re-added by initiating a new federation request

## Security Model

### Keypair Generation

Each OGP instance generates an Ed25519 keypair:

```typescript
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
```

Stored in `~/.ogp/keypair.json`:

```json
{
  "publicKey": "302a300506032b6570032100...",
  "privateKey": "302e020100300506032b657004220420..."
}
```

### Message Signing

When Alice sends a message:

1. Build message object
2. Serialize to JSON
3. Sign with Ed25519 private key

```typescript
const message = {
  intent: "message",
  from: "peer-alice",
  to: "peer-bob",
  nonce: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  payload: { text: "Hello!" }
};

const signature = crypto.sign(
  null,
  Buffer.from(JSON.stringify(message)),
  privateKey
);
```

### Signature Verification

When Bob receives a message:

1. Look up Alice's public key from `peers.json`
2. Verify signature

```typescript
const isValid = crypto.verify(
  null,
  Buffer.from(JSON.stringify(message)),
  alicePublicKey,
  signature
);
```

If signature is invalid:
- Message is rejected
- Error returned to sender
- No notification sent to OpenClaw

### Threat Model

**OGP protects against:**

- ✓ Impersonation (signature verification)
- ✓ Message tampering (signature covers full message)
- ✓ Unauthorized peers (approval required)
- ✓ Man-in-the-middle (HTTPS tunnels)
- ✓ **Scope violations** (doorman enforcement, v0.2.0+)
- ✓ **Rate abuse** (per-peer rate limiting, v0.2.0+)
- ✓ **Topic restrictions** (topic-based access control for agent-comms, v0.2.0+)

**OGP does NOT protect against:**

- ✗ Compromised peer credentials (keep `keypair.json` secure)
- ✗ DDoS attacks (rate limiting mitigates but doesn't prevent)
- ✗ Replay attacks (nonce tracking not yet implemented)

### Best Practices

1. **Keep private keys secure**
   - Don't commit `~/.ogp/keypair.json` to git
   - Use file permissions: `chmod 600 ~/.ogp/keypair.json`

2. **Verify peer identity**
   - Before approving, confirm peer identity out-of-band
   - Check `/.well-known/ogp` matches expected public key

3. **Use HTTPS tunnels**
   - Always use cloudflared or ngrok (both provide HTTPS)
   - Never expose raw HTTP to the internet

4. **Monitor peer activity**
   - Check OpenClaw logs for suspicious messages
   - Reject peers that send malicious content

## Message Flow Diagrams

### Full Federation Flow

```
Alice                    Bob
  |                       |
  |--- GET /.well-known/ogp -->
  |<-- Discovery response ---|
  |                       |
  |-- POST /federation/request -->
  |<-- Status: pending -------|
  |                       |
  |                [Bob approves]
  |                       |
  |<-- POST /federation/approve --
  |--- Acknowledgment --->|
  |                       |
  |-- POST /federation/message -->
  |<-- Response ----------|
  |                       |
  |                [Bob's OpenClaw]
  |                       |<-- Webhook
  |                       |
```

### Message Verification Flow

```
┌─────────────────────────────────────┐
│ Incoming message + signature        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 1. Check: Is sender approved?       │
└──────────────┬──────────────────────┘
               │ Yes
               ▼
┌─────────────────────────────────────┐
│ 2. Load sender's public key         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 3. Verify signature                 │
└──────────────┬──────────────────────┘
               │ Valid
               ▼
┌─────────────────────────────────────┐
│ 4. Check intent exists              │
└──────────────┬──────────────────────┘
               │ Yes
               ▼
┌─────────────────────────────────────┐
│ 5. Notify OpenClaw                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 6. Return success                   │
└─────────────────────────────────────┘
```

## Next Steps

- See [quickstart.md](./quickstart.md) for hands-on tutorial
- Read [scopes.md](./scopes.md) for scope negotiation details
- Learn [agent-comms.md](./agent-comms.md) for agent-to-agent messaging
- Check [README.md](../README.md) for CLI reference
- Register custom intents with `ogp intent register`
- Configure response policies with `ogp agent-comms configure`
