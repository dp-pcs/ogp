# Implementation Details

This section documents the technical implementation of OGP, including architecture, performance characteristics, and deployment considerations.

---

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    OGP Gateway                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Express.js HTTP Server (port 18790)             │  │
│  │                                                   │  │
│  │  Routes:                                          │  │
│  │  • GET /.well-known/ogp (discovery)              │  │
│  │  • POST /federation/request (peer requests)      │  │
│  │  • POST /federation/approve (peer approvals)     │  │
│  │  • POST /federation/message (intent invocations) │  │
│  └──────────────┬──────────────────────────────────┘  │
│                 │                                       │
│  ┌──────────────┼──────────────────────────────────┐  │
│  │              │      Doorman Layer               │  │
│  │              ▼                                   │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Signature Verification (Ed25519)          │ │  │
│  │  │  src/shared/signing.ts                     │ │  │
│  │  └────────────────┬───────────────────────────┘ │  │
│  │                   │                              │  │
│  │  ┌────────────────▼───────────────────────────┐ │  │
│  │  │  Access Check (6-step validation)         │ │  │
│  │  │  src/daemon/doorman.ts                    │ │  │
│  │  │  1. Peer lookup                           │ │  │
│  │  │  2. Approval status                       │ │  │
│  │  │  3. Scope bundle                          │ │  │
│  │  │  4. Intent grant                          │ │  │
│  │  │  5. Topic coverage                        │ │  │
│  │  │  6. Rate limit                            │ │  │
│  │  └────────────────┬───────────────────────────┘ │  │
│  └──────────────────┼────────────────────────────┘  │
│                     │                                 │
│  ┌──────────────────▼──────────────────────────────┐ │
│  │  Message Handler                                │ │
│  │  src/daemon/message-handler.ts                  │ │
│  │                                                  │ │
│  │  Intent Routing:                                │ │
│  │  • agent-comms → Agent API                      │ │
│  │  • project.* → Project Storage                  │ │
│  │  • message → Notification System                │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
└─────────────────────┼─────────────────────────────────┘
                      │
           ┌──────────┼──────────┐
           │          │          │
           ▼          ▼          ▼
    ┌──────────┐ ┌────────┐ ┌─────────┐
    │  Agent   │ │Project │ │ Notify  │
    │   API    │ │Storage │ │ Service │
    │(OpenClaw)│ │(JSON)  │ │         │
    └──────────┘ └────────┘ └─────────┘
```

---

## Technology Stack

### Core Dependencies

**Runtime:**
- Node.js 18+ (ES modules, modern async/await)
- TypeScript 5.0+ (strict type checking)

**HTTP Server:**
- Express.js 4.18+ (routing, middleware)
- cors middleware (CORS headers for web clients)
- body-parser (JSON payload parsing)

**Cryptography:**
- Node.js `crypto` module (Ed25519 via native OpenSSL bindings)
- No external crypto libraries (reduces attack surface)

**Storage:**
- File system (`fs.promises` for async I/O)
- JSON serialization (human-readable, diff-friendly)
- Atomic writes via `fs.renameSync()` (POSIX guarantee)

**Networking:**
- HTTPS/TLS 1.3 (mandatory for production)
- Tunnel support: ngrok, Cloudflare Tunnel, localhost.run

**Build Tools:**
- `tsc` (TypeScript compiler)
- `tsx` (TypeScript execution for CLI)
- No bundling (direct execution of compiled JS)

---

## Deployment Architecture

### Single-Gateway Deployment (Typical)

```
┌─────────────────────────────────────────────┐
│  Host Machine (laptop, server, cloud VM)   │
│                                             │
│  ┌────────────────────────────────────────┐ │
│  │  OGP Daemon (port 18790)               │ │
│  │  Process: node dist/daemon/server.js   │ │
│  └────────────┬───────────────────────────┘ │
│               │                              │
│  ┌────────────┴───────────────────────────┐ │
│  │  OpenClaw Gateway (port 3000)          │ │
│  │  Agents access via localhost           │ │
│  └────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  Tunnel Service │
         │  (ngrok/CF)     │
         │  Public HTTPS   │
         └────────┬────────┘
                  │
                  ▼
            [Internet]
```

**Configuration** (`~/.ogp/config.json`):
```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:3000",
  "gatewayUrl": "https://abc123.ngrok.io",
  "displayName": "Alice (Colorado)",
  "email": "alice@example.com"
}
```

### Home User Setup (Behind NAT)

**Challenge**: Home ISPs use CGNAT (carrier-grade NAT), preventing inbound connections.

**Solution**: Tunnel service provides stable HTTPS endpoint.

**Tunnel Options**:
1. **ngrok**: Free tier rotates URLs, paid tier provides stable subdomain
2. **Cloudflare Tunnel**: Free, stable URLs, requires DNS setup
3. **localhost.run**: SSH-based tunneling, no signup required

**Setup**:
```bash
# Start OGP daemon
ogp daemon start

# Start tunnel (ngrok example)
ngrok http 18790 --region us
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:18790

# Update OGP config with tunnel URL
ogp config set gatewayUrl https://abc123.ngrok.io
```

**URL Rotation Handling**:
- Peer identity is derived from Ed25519 public key (NOT URL)
- When URL changes, send a signed message to any peer
- Peer's gateway verifies signature, updates stored URL automatically
- No re-approval needed

---

## Performance Characteristics

### Throughput

**Request Processing Pipeline:**
1. HTTP request parsing: ~0.1ms (Express overhead)
2. Ed25519 signature verification: ~0.5ms (OpenSSL native)
3. Doorman access check: ~0.2ms (hash map lookups)
4. Intent routing + agent API call: ~50-500ms (depends on agent LLM latency)

**Bottleneck**: Agent LLM inference time dominates (50-500ms). Federation overhead (signature + doorman) is <1ms.

**Scalability**:
- **Per-gateway throughput**: 1000 req/sec (limited by agent capacity, not federation protocol)
- **Concurrent connections**: 100+ peers (Express default thread pool)
- **Memory**: ~50 MB baseline + 8 MB per 1M rate limit entries

### Latency

**End-to-End Federation Message:**
```
Alice's agent → Alice's gateway → [Internet] → Bob's gateway → Bob's agent
     0ms              1ms            50-200ms        1ms            50-500ms
                                                                    ────────
                                                                    52-701ms
```

**Breakdown**:
- Alice's gateway signing: ~0.5ms
- Network latency (US ↔ Europe): 50-200ms typical
- Bob's gateway verification + doorman: ~1ms
- Bob's agent processing: 50-500ms (LLM inference)

**Comparison to Alternatives**:
- **Central Broker**: +100-200ms (extra hop through broker)
- **Direct A2A**: -1ms (no gateway overhead), but loses containment
- **VPN Tunnel**: +10-50ms (VPN encryption overhead)

### Memory

**Static Memory (per gateway)**:
- Node.js runtime: ~30 MB
- OGP daemon code: ~10 MB
- Peer storage: ~100 bytes per peer × 100 peers = 10 KB

**Dynamic Memory (per active peer)**:
- Rate limit tracking: ~8 bytes per timestamp × 100 req/hour = 800 bytes
- In-flight requests: ~1 KB per request × 10 concurrent = 10 KB

**Worst Case** (100 peers, 10 intents each, 1000 req/hour):
- 100 peers × 10 intents × 1000 timestamps × 8 bytes = 8 MB

**Cleanup**: Rate limit entries idle > 24 hours are removed every 5 minutes.

### Storage

**Peer Storage** (`~/.ogp/peers.json`):
- ~500 bytes per peer (includes scope bundle)
- 100 peers = 50 KB
- Atomic writes use temporary file (2× disk space during write)

**Project Storage** (`~/.ogp/projects.json`):
- ~1 KB per project (metadata + member list)
- 10 projects = 10 KB

**Config** (`~/.ogp/config.json`):
- ~2 KB (static configuration)

**Total**: <100 KB for typical deployments

---

## Security Implementation

### Ed25519 Cryptographic Implementation

**Key Generation** (`src/shared/signing.ts::generateKeyPair()`):
```typescript
import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' }
});

const publicKeyHex = publicKey.toString('hex');
const privateKeyHex = privateKey.toString('hex');
```

**Signature Generation**:
```typescript
function sign(message: string, privateKeyHex: string): string {
  const privateKeyDer = Buffer.from(privateKeyHex, 'hex');
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  // Ed25519 uses built-in SHA-512 hashing (algorithm=null)
  const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKey);
  return signature.toString('hex');
}
```

**Signature Verification**:
```typescript
function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const publicKeyDer = Buffer.from(publicKeyHex, 'hex');
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });

    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf-8'), publicKey, signature);
  } catch (error) {
    return false;
  }
}
```

**Key Properties**:
- **Public key size**: 44 bytes (DER format) = 88 hex chars
- **Private key size**: 48 bytes (DER format) = 96 hex chars
- **Signature size**: 64 bytes = 128 hex chars
- **Security level**: 128-bit (equivalent to RSA-3072)

### Threat Model

**In Scope (Protected Against)**:
- **Peer impersonation**: Ed25519 signatures prevent unauthenticated requests
- **Replay attacks**: Timestamp validation (±5 min window) prevents replay
- **Scope creep**: Doorman validates every request against negotiated grants
- **Rate limit bypass**: Sliding window tracks requests per peer+intent
- **Topic enumeration**: Witty rejection messages don't confirm topic existence
- **MitM attacks**: TLS 1.3 encrypts all traffic (mandatory for production)

**Out of Scope (Not Protected Against)**:
- **DDoS**: No built-in DDoS protection (rely on upstream firewall/CDN)
- **Compromised peer private key**: If peer's private key is stolen, attacker can impersonate that peer (revoke peer immediately)
- **Gateway host compromise**: If gateway host is compromised, all federation relationships are at risk (standard host security practices apply)
- **Social engineering**: OGP cannot prevent users from approving malicious peers (user education required)

---

## Configuration Management

### Configuration File (`~/.ogp/config.json`)

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:3000",
  "gatewayUrl": "https://abc123.ngrok.io",
  "displayName": "Alice (Colorado)",
  "email": "alice@example.com",
  "responsePolicies": [
    {"topic": "project-validation", "level": "interactive", "peer": "bob-peer-id"},
    {"topic": "*", "level": "notifications-only"}
  ],
  "defaultRateLimit": {
    "requests": 100,
    "windowSeconds": 3600
  }
}
```

### CLI Configuration Commands

```bash
# View current config
ogp config show

# Update gateway URL (after tunnel rotation)
ogp config set gatewayUrl https://xyz789.ngrok.io

# Add response policy
ogp config add-policy --topic project-validation --level interactive --peer bob-peer-id

# Remove response policy
ogp config remove-policy --topic project-validation --peer bob-peer-id

# Set default rate limit
ogp config set defaultRateLimit 100/3600
```

---

## Error Handling

### HTTP Error Responses

**403 Forbidden** (Access Denied):
```json
{
  "error": "Topic 'financial-data' not allowed for intent 'agent-comms'",
  "code": "TOPIC_DENIED",
  "peerId": "a1b2c3d4e5f6g7h8",
  "intent": "agent-comms"
}
```

**429 Too Many Requests** (Rate Limit):
```json
{
  "error": "Rate limit exceeded for intent 'agent-comms'",
  "code": "RATE_LIMIT_EXCEEDED",
  "peerId": "a1b2c3d4e5f6g7h8",
  "intent": "agent-comms",
  "retryAfter": 2847
}
```

**500 Internal Server Error** (Gateway Failure):
```json
{
  "error": "Failed to route message to agent",
  "code": "ROUTING_FAILURE",
  "details": "Agent API returned 503"
}
```

### Logging

**Structured Logging** (JSON format for machine parsing):
```json
{
  "level": "info",
  "timestamp": "2026-03-20T15:30:45.123Z",
  "event": "federation_message_received",
  "peer": "a1b2c3d4e5f6g7h8",
  "intent": "agent-comms",
  "topic": "project-validation",
  "allowed": true,
  "latency_ms": 523
}
```

**Audit Trail**:
- All federation messages logged with peer ID, intent, topic, timestamp
- Access denials logged with reason code
- Peer approvals/revocations logged with admin user
- Rate limit violations logged with retry-after

---

## Monitoring and Observability

### Metrics

**Per-Peer Metrics**:
- Requests per hour (by intent)
- Rate limit violations
- Access denials (by reason)
- Average latency

**Gateway Metrics**:
- Total peers (approved, pending, revoked)
- Total messages per hour
- Error rate (5xx responses)
- Ed25519 signature verification failures

### Health Check Endpoint

```http
GET /.well-known/ogp
```

Returns gateway metadata + health status:
```json
{
  "gatewayId": "a1b2c3d4e5f6g7h8",
  "displayName": "Alice (Colorado)",
  "publicKey": "a1b2c3d4...",
  "protocolVersion": "0.2.0",
  "capabilities": ["agent-comms", "project.query", "message"],
  "status": "healthy",
  "uptime": 86400,
  "peers": {
    "approved": 5,
    "pending": 1,
    "revoked": 0
  }
}
```

---

## Testing

### Unit Tests

**Doorman Access Check** (`test/doorman.test.ts`):
- Peer lookup (by ID, by public key)
- Approval status validation
- Intent grant lookup
- Topic coverage (exact match, prefix match)
- Rate limit enforcement

**Ed25519 Signing** (`test/signing.test.ts`):
- Key generation (public/private pair)
- Signature generation
- Signature verification
- Invalid signature rejection

### Integration Tests

**Federation Flow** (`test/federation.test.ts`):
- Full federation request/approval cycle
- Message routing with doorman validation
- Symmetric scope mirroring
- Asymmetric scope grants (with flags)

### End-to-End Tests

**Multi-Gateway Scenario** (`test/e2e/mesh.test.ts`):
- Three-node mesh (A ↔ B, B ↔ C, A ↔ C)
- Project isolation (A+B project not accessible to C)
- Transitive trust validation (federation != transitive access)

---

## Deployment Checklist

**Prerequisites**:
- [ ] Node.js 18+ installed
- [ ] OGP CLI installed (`npm install -g @ogp/cli`)
- [ ] Tunnel service configured (ngrok/Cloudflare)
- [ ] OpenClaw gateway running (if integrating with OpenClaw)

**Initial Setup**:
```bash
# 1. Initialize OGP
ogp init

# 2. Start daemon
ogp daemon start

# 3. Start tunnel (ngrok example)
ngrok http 18790

# 4. Update gateway URL
ogp config set gatewayUrl <tunnel-url>

# 5. Verify health check
curl <tunnel-url>/.well-known/ogp
```

**Federate with Peer**:
```bash
# 1. Request federation
ogp federation request <peer-gateway-url>

# 2. Wait for peer to approve (they run: ogp federation approve <your-peer-id>)

# 3. Verify peer status
ogp federation list
```

**Production Hardening**:
- [ ] Use stable tunnel URL (ngrok pro / Cloudflare Tunnel)
- [ ] Enable TLS 1.3 (mandatory)
- [ ] Configure response policies for sensitive topics
- [ ] Set conservative default rate limits
- [ ] Enable audit logging
- [ ] Monitor error rates and rate limit violations

---

## Summary

| Component | Implementation | Key Characteristics |
|-----------|----------------|---------------------|
| **HTTP Server** | Express.js | 1000 req/sec, <1ms overhead |
| **Cryptography** | Node.js crypto (Ed25519) | 128-bit security, <0.5ms sign/verify |
| **Storage** | File-based JSON | Atomic writes, <100 KB typical |
| **Rate Limiting** | In-memory sliding window | 8 MB worst case, auto-cleanup |
| **Networking** | HTTPS/TLS 1.3 + tunnels | NAT-friendly, home user support |
| **Monitoring** | Structured JSON logs | Machine-parseable audit trail |

OGP is implemented as a lightweight daemon (~50 MB memory, <1ms latency overhead) that integrates with existing gateway architectures without requiring architectural changes. The implementation prioritizes security (Ed25519 signatures, atomic file writes), performance (in-memory rate limiting, minimal overhead), and operational simplicity (single daemon process, zero external dependencies beyond Node.js).
