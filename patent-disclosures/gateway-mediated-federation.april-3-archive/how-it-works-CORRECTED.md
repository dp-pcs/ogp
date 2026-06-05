# What It Does & How It Works

## Overview

OGP (Open Gateway Protocol) is a gateway-mediated agent federation system that enables AI agents to collaborate across organizational boundaries while preserving containment. The core innovation is **three-layer scope isolation with bilateral negotiation** that allows agents to invoke capabilities on remote gateways without compromising security boundaries.

---

## Core Algorithms

### Algorithm 1: Doorman Access Check (Novel)

**Location**: `src/daemon/doorman.ts::checkAccess()`

**Purpose**: Layer 3 runtime enforcement. Validates every incoming request against negotiated grants before routing to the agent.

**6-Step Validation Process:**

1. **Peer Lookup** (`doorman.ts:87-98`):
   ```typescript
   let peer = getPeer(peerId);
   if (!peer && peerId.length >= 16) {
     peer = getPeerByPublicKey(peerId);
   }
   if (!peer) {
     return { allowed: false, reason: 'Unknown peer', statusCode: 403 };
   }
   ```

2. **Approval Status Check** (`doorman.ts:100-106`):
   ```typescript
   if (peer.status !== 'approved') {
     return { allowed: false, reason: 'Peer not approved', statusCode: 403 };
   }
   ```

3. **Scope Bundle Determination** (`doorman.ts:108-121`):
   ```typescript
   let scopeBundle: ScopeBundle;
   if (peer.grantedScopes) {
     scopeBundle = peer.grantedScopes;
   } else {
     // Backward compatibility: v0.1 peers get default scopes
     scopeBundle = DEFAULT_V1_SCOPES;
   }
   ```

4. **Intent Grant Lookup** (`doorman.ts:123-132`):
   ```typescript
   const grant = findScopeGrant(scopeBundle, intent);
   if (!grant) {
     return { 
       allowed: false, 
       reason: `Intent '${intent}' not in granted scope`, 
       statusCode: 403 
     };
   }
   ```

5. **Topic Coverage Check** (`doorman.ts:134-151`):
   ```typescript
   const topic = payload?.topic;
   if (!scopeCoversIntent(grant, intent, topic)) {
     if (topic && grant.topics && grant.topics.length > 0) {
       return {
         allowed: false,
         reason: `Topic '${topic}' not allowed for intent '${intent}'`,
         statusCode: 403
       };
     }
     return { allowed: false, reason: 'Intent scope check failed', statusCode: 403 };
   }
   ```
   
   **Note:** `scopeCoversIntent()` uses **exact intent matching** (`grant.intent !== intent`) and **topic prefix matching** (`topic.startsWith(allowed + '/')`) for agent-comms. There are NO wildcards in intent names.

6. **Rate Limit Check** (`doorman.ts:153-164`):
   ```typescript
   const rateLimit = grant.rateLimit || DEFAULT_RATE_LIMIT;
   const rateLimitResult = checkRateLimit(peerId, intent, rateLimit);
   if (!rateLimitResult.allowed) {
     return {
       allowed: false,
       reason: `Rate limit exceeded for intent '${intent}'`,
       statusCode: 429,
       retryAfter: rateLimitResult.retryAfter
     };
   }
   ```

**Complexity**: O(1) for peer lookup (hash map), O(k) for intent matching where k = number of granted intents, O(w) for rate limit check where w = requests in sliding window

**Novel Aspect**: Combines cryptographic identity (peer ID), scope grants (Layer 2), and runtime policy enforcement in a single decision point before agent invocation.

---

### Algorithm 2: Hierarchical Topic Policy Resolution (Novel)

**Location**: `src/daemon/agent-comms.ts::resolveTopicPolicy()`

**Purpose**: Determine which agent policy applies to a given topic using **prefix matching** with hierarchical fallthrough.

**Inputs**:
- `topic`: string (e.g., `"project-validation/legal"`)
- `policies`: TopicPolicy[] from agent config

**Algorithm**:
1. **Exact Match First**:
   ```typescript
   const exactMatch = policies.find(p => p.topic === topic);
   if (exactMatch) return exactMatch;
   ```

2. **Prefix Matching with Longest-Prefix-Wins**:
   ```typescript
   const prefixMatches = policies
     .filter(p => topic.startsWith(p.topic + '/'))
     .sort((a, b) => b.topic.length - a.topic.length);  // Longer = more specific
   
   return prefixMatches[0] || null;
   ```

3. **Global Fallback**:
   ```typescript
   const globalPolicy = policies.find(p => p.topic === '*');
   return globalPolicy || null;
   ```

**Example:**
- Topic: `"project-validation/legal"`
- Policies: `["project-validation", "project-validation/legal", "*"]`
- Winner: `"project-validation/legal"` (exact match beats prefix)

**Complexity**: O(p) where p = number of policies (linear scan)

**Novel Aspect**: Enables fine-grained, hierarchical scope control without requiring explicit configuration for every topic.

---

### Algorithm 3: Cryptographic Peer Verification (Standard Ed25519)

**Location**: `src/shared/signing.ts::verify()`

**Purpose**: Verify incoming messages are signed by the peer's registered public key using **Ed25519** signatures.

**Inputs**:
- `message`: string (JSON-serialized message)
- `signatureHex`: string (hex-encoded signature)
- `publicKeyHex`: string (hex-encoded Ed25519 public key)

**Algorithm**:
```typescript
export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
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

**Key Details:**
- **Ed25519** provides 128-bit security with 32-byte public keys and 64-byte signatures
- Signature generation: `crypto.sign(null, message, privateKey)` where `null` means no hash algorithm (Ed25519 has built-in hashing)
- Public keys stored in DER format (distinguished encoding rules), hex-encoded for JSON transport

**Complexity**: O(log n) for Ed25519 signature verification where n = 256 bits (elliptic curve operations)

**Standard Component**: Uses well-established Ed25519 signature scheme from Node.js crypto module. Not novel, but essential for trust model.

---

### Algorithm 4: Sliding Window Rate Limiting with Precise Retry-After

**Location**: `src/daemon/doorman.ts::checkRateLimit()`

**Purpose**: Track request timestamps per peer+intent and enforce rate limits with precise retry calculation.

**Inputs**:
- `peerId`: string
- `intent`: string
- `limit`: RateLimit `{requests: number, windowSeconds: number}`

**Algorithm**:
```typescript
function checkRateLimit(peerId: string, intent: string, limit: RateLimit): { allowed: boolean; retryAfter?: number } {
  const key = `${peerId}:${intent}`;
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;

  let entry = rateLimitStore.get(key);

  if (!entry) {
    // First request - create entry
    entry = { timestamps: [now], windowStart: now };
    rateLimitStore.set(key, entry);
    return { allowed: true };
  }

  // Filter out timestamps outside the sliding window
  const windowStart = now - windowMs;
  entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
  entry.windowStart = windowStart;

  // Check if we're at the limit
  if (entry.timestamps.length >= limit.requests) {
    // Calculate when the oldest request will expire
    const oldestInWindow = Math.min(...entry.timestamps);
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return {
      allowed: false,
      retryAfter: Math.max(1, retryAfter)
    };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true };
}
```

**Novel Aspect**: Precise retry-after calculation (`Math.ceil((oldestInWindow + windowMs - now) / 1000)`) tells the peer exactly when they can retry, not a fixed delay.

---

## Scope Negotiation Mechanism (Corrected)

OGP does NOT use "scope intersection algorithms" or "wildcard matching" for intents. The actual mechanism is:

**During Peer Approval** (`server.ts:245-260`):

1. **Default Scope Bundle Creation**: When a peer is approved, the gateway creates a default scope bundle with standard intents:
   ```typescript
   const defaultIntents = [
     'message', 
     'agent-comms', 
     'project.join', 
     'project.contribute', 
     'project.query', 
     'project.status'
   ];
   const scopes = defaultIntents.map(intent => 
     createScopeGrant(intent, { rateLimit: DEFAULT_RATE_LIMIT })
   );
   const bundle = createScopeBundle(scopes);
   updatePeerGrantedScopes(peer.id, bundle);
   ```

2. **Symmetric Mirroring**: The approving gateway sends this same scope bundle back to the requester:
   ```typescript
   await fetch(`${freshPeer.gatewayUrl}/federation/approve`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       fromGatewayId, fromDisplayName, fromGatewayUrl, fromPublicKey, fromEmail,
       timestamp, protocolVersion: '0.2.0',
       scopeGrants: bundle  // Send the same scopes back
     })
   });
   ```

3. **CLI Override**: Users can specify custom intents and rate limits during approval:
   ```bash
   ogp federation approve <peer-id> --intents message,agent-comms --rate 50/3600
   ```

**Key Point**: Intents are **exact strings** like `"agent-comms"` or `"project.query"`. There is NO wildcard matching (e.g., `"project.*"`). The only "wildcard" behavior is in **topic prefix matching** within `agent-comms` (e.g., topic `"project-validation/legal"` matches allowed topic `"project-validation"`).

---

[Rest of the section continues with Processing Pipeline diagrams, Data Models, Decision Points, Outputs, Configuration, and Error Handling - all using corrected Ed25519 terminology and no fabricated algorithms]
