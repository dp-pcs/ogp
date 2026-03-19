# Federation Flow

Detailed walkthrough of OGP federation message flows.

## Table of Contents

1. [Discovery](#discovery)
2. [Federation Request](#federation-request)
3. [Federation Approval](#federation-approval)
4. [Message Exchange](#message-exchange)
5. [Security Model](#security-model)

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
  "version": "0.1.0",
  "displayName": "Alice",
  "email": "alice@example.com",
  "gatewayUrl": "https://peer.example.com",
  "publicKey": "302a300506032b6570032100abc123...",
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

## Federation Request

Alice wants to federate with Bob. Alice sends a signed request.

### Alice's Side

```bash
ogp federation request https://bob.example.com peer-bob
```

This:
1. Loads Alice's keypair
2. Builds peer info with Alice's public key
3. Signs the peer info with Alice's private key
4. POSTs to Bob's `/federation/request`

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

  peer-alice
    Name: Alice
    Status: pending
    Gateway: https://alice.example.com
    Public key: 302a300506032b6570032100def456...
```

## Federation Approval

Bob approves Alice's request.

### Bob's Side

```bash
ogp federation approve peer-alice
```

This:
1. Updates peer status to `approved` in `~/.ogp/peers.json`
2. POSTs approval to Alice's `/federation/approve`

### Request

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

Now both sides have approved peers:

```bash
$ ogp federation list --status approved

APPROVED PEERS:

  peer-bob
    Name: Bob
    Status: approved
    Gateway: https://bob.example.com
    Public key: 302a300506032b6570032100abc123...
```

## Message Exchange

Alice sends a message to Bob.

### Alice Sends

```bash
ogp federation send peer-bob message '{"text":"Hello, Bob!"}'
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

Bob's OGP daemon:
1. Verifies sender (`peer-alice`) is in approved peers
2. Verifies signature using Alice's public key
3. Checks intent exists in registry
4. Forwards to Bob's OpenClaw via webhook

### OpenClaw Notification

```http
POST /api/system-event HTTP/1.1
Host: bob-openclaw.local:18789
Authorization: Bearer bob-token
Content-Type: application/json

{
  "text": "[OGP] Message from Alice: Hello, Bob!",
  "sessionKey": "agent:main:main",
  "ogp": {
    "from": "peer-alice",
    "intent": "message",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "payload": {
      "text": "Hello, Bob!"
    }
  }
}
```

Bob's OpenClaw agent sees:

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

**OGP does NOT protect against:**

- ✗ Compromised peer credentials (keep `keypair.json` secure)
- ✗ DDoS attacks (add rate limiting if needed)
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
- Check [README.md](../README.md) for CLI reference
- Explore custom intents in `~/.ogp/intents.json`
