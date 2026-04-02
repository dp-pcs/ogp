# OGP Protocol Specification

> Open Gateway Protocol (OGP) v0.2.x — Federation Protocol Reference

## Overview

OGP enables cryptographically secured peer-to-peer federation between OpenClaw AI gateway instances. This document specifies the protocol endpoints, message formats, and sequences.

## Table of Contents

1. [Endpoints](#endpoints)
2. [Federation Lifecycle](#federation-lifecycle)
3. [Tear-Down Sequence](#tear-down-sequence)
4. [Security Requirements](#security-requirements)
5. [Error Handling](#error-handling)

## Endpoints

### Discovery

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/.well-known/ogp` | GET | None | Public discovery — returns gateway identity, public key, capabilities |

### Federation Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/federation/request` | POST | Signature | Receive federation request from peer |
| `/federation/approve` | POST | Signature | Receive approval from peer |
| `/federation/removed` | POST | Signature | **Receive tear-down notification (BUILD-113)** |

### Messaging

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/federation/message` | POST | Signature | Receive federated message |
| `/federation/reply/:nonce` | GET | None | Poll for reply to a message |
| `/federation/reply/:nonce` | POST | Signature | Receive reply callback from remote gateway |
| `/federation/ping` | GET | None | Health check — returns `pong: true` |

## Federation Lifecycle

### 1. Discovery

Peers discover each other via `/.well-known/ogp` before establishing federation.

### 2. Request → Approval

```
Alice                    Bob
  |                       |
  |-- POST /federation/request ->
  |<- 200 {received: true, status: "pending"} --|
  |                       |
  |                [Bob approves]
  |                       |
  |<- POST /federation/approve ----|
  |--- 200 {received: true} --->|
```

### 3. Active Federation

Both peers can now send messages via `/federation/message`.

### 4. Tear-Down (Asymmetric Removal)

Either peer can terminate federation unilaterally. See [Tear-Down Sequence](#tear-down-sequence).

## Tear-Down Sequence

OGP uses **asymmetric removal** for federation tear-down. The removing peer's decision is authoritative; the removed peer is notified on a best-effort basis but does not control the removal.

### Sequence Diagram

```
Alice (Initiator)                    Bob (Recipient)
    |                                    |
    |  1. CLI: ogp federation remove     |
    |     peer-bob                       |
    |                                    |
    |  2. Sign {peerId, timestamp}       |
    |     with Alice's private key       |
    |                                    |
    |  3. POST /federation/removed ----> |
    |     {peerId, timestamp, signature} |
    |                                    |
    |<-- 4. 200 {success: true} ---------|
    |     (best-effort, ignored if fails)|
    |                                    |
    |  5. Update status to 'removed'     |
    |     (local, authoritative)         |
    |                                    |
    |  6. Notify OpenClaw agent          |
    |                                    |
    [Federation terminated — Alice side]
    |                                    |
    |                                    |  7. Validate signature
    |                                    |     with Alice's public key
    |                                    |
    |                                    |  8. Update status to 'removed'
    |                                    |     (local)
    |                                    |
    |                                    |  9. Notify OpenClaw agent
    |                                    |
         [Federation terminated — Bob side]
```

### Asymmetric Removal Properties

| Property | Description |
|----------|-------------|
| **Unilateral** | Either peer can remove the other without consent |
| **Authoritative** | Remover's local state change is immediate and binding |
| **Best-effort notify** | Notification is sent but failures don't block removal |
| **No retry** | If notification fails, no automatic retry (remover already removed peer) |
| **Reversible** | Either peer can re-establish federation with a new request |

### `/federation/removed` Endpoint Specification

**URL:** `POST /federation/removed`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "peerId": "string",      // Public key prefix (16 chars) of removing peer
  "timestamp": "string",   // ISO 8601 timestamp
  "signature": "string"   // Ed25519 signature (base64/hex)
}
```

**Payload for Signature:**
The signature covers the canonical JSON serialization of `{peerId, timestamp}`:
```typescript
const payload = JSON.stringify({ peerId, timestamp });
const signature = sign(payload, privateKey);
```

**Response (Success):**
```json
{
  "success": true,
  "peerId": "peer-alice",
  "status": "removed"
}
```

**Response (Error):**

| Status | Condition |
|--------|-----------|
| 400 | Missing required fields (`peerId`, `timestamp`, or `signature`) |
| 400 | Invalid or stale timestamp (>5 minute window) |
| 403 | Invalid signature (authentication failure) |
| 404 | Unknown peer (not in recipient's peer list) |
| 500 | Failed to update peer status |

### Error Response Bodies

```json
// 400 - Missing fields
{
  "success": false,
  "error": "Missing required fields: peerId, timestamp, signature"
}

// 400 - Stale timestamp
{
  "success": false,
  "error": "Invalid or stale timestamp"
}

// 403 - Invalid signature
{
  "success": false,
  "error": "Invalid signature"
}

// 404 - Unknown peer
{
  "success": false,
  "error": "Unknown peer"
}

// 500 - Internal error
{
  "success": false,
  "error": "Failed to update peer status"
}
```

## Security Requirements

### Signature Verification

All federation endpoints (except discovery and ping) require Ed25519 signatures:

1. **Serialize payload** — Canonical JSON string
2. **Sign** — Ed25519 private key of sender
3. **Verify** — Look up sender's public key from `peers.json`, verify signature

### Timestamp Freshness

Removal notifications include a timestamp checked for freshness:
- Valid window: ±5 minutes from server time
- Purpose: Prevent replay attacks
- Failure: HTTP 400 with "Invalid or stale timestamp"

### Peer Lookup

Recipients must verify:
1. Peer exists in local `peers.json` (or return 404)
2. Peer status allows receiving notifications (approved, pending)
3. Public key matches stored key (via signature verification)

## Error Handling

### Client (Initiator) Errors

| Scenario | Behavior |
|----------|----------|
| Network timeout | Log warning, continue with local removal |
| HTTP 4xx/5xx | Log warning with status code, continue with local removal |
| Signature failure (local) | Abort, display error to user |

### Server (Recipient) Errors

| Scenario | Behavior |
|----------|----------|
| Missing fields | HTTP 400, do not modify peer state |
| Invalid signature | HTTP 403, do not modify peer state |
| Stale timestamp | HTTP 400, do not modify peer state |
| Unknown peer | HTTP 404, do not create new peer |
| Update failure | HTTP 500, peer state unchanged |

### OpenClaw Notification

On successful removal (either side):
- Fire `notifyOpenClaw()` with metadata
- Include: peer ID, display name, removal type ("federation_removed")
- Session key: `agent:main:main` (configurable)

## CLI Reference

### Remove Peer Command

```bash
ogp federation remove <peer-id>
```

**Example:**
```bash
ogp federation remove peer-bob
```

**Output (success):**
```
✓ Notified peer of removal
✓ Removed peer: peer-bob (Bob)
```

**Output (peer unreachable):**
```
⚠ Could not notify peer of removal: fetch failed
✓ Removed peer: peer-bob (Bob)
```

The removal succeeds even if notification fails.

## Version History

| Version | Change |
|---------|--------|
| 0.2.x | Added asymmetric federation removal (`/federation/removed` endpoint) — BUILD-113 |
| 0.2.0 | Added scope negotiation and agent-comms |
| 0.1.0 | Initial protocol with request/approve/message |
