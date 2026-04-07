# Pseudocode

This section provides executable-style pseudocode for the key algorithms in OGP. Algorithms marked [NOVEL] represent genuinely new contributions; others are standard implementations included for completeness.

---

## Algorithm 1: Federation Message Handler (Entry Point)

**Purpose**: Main entry point for all federation messages. Routes incoming requests based on intent.

**Location**: `src/daemon/message-handler.ts::handleFederationMessage()`

```python
function handleFederationMessage(request):
    """
    Handle incoming federation message from peer gateway

    Input:
        request: HTTP request containing FederationMessage payload

    Output:
        HTTP response (200 OK, 403 Forbidden, or 429 Too Many Requests)
    """

    # Extract message from request body
    message = parseJSON(request.body)
    fromGatewayId = message.fromGatewayId
    intent = message.intent
    payload = message.payload
    signature = message.signature
    timestamp = message.timestamp

    # Step 1: Verify message signature
    canonicalMessage = toCanonicalJSON(message)  # Deterministic serialization
    peer = getPeer(fromGatewayId)
    if peer is null:
        peer = getPeerByPublicKey(fromGatewayId)  # Fallback: lookup by full public key

    if peer is null:
        return HTTP_403("Unknown peer")

    isValidSignature = verifyEd25519(canonicalMessage, signature, peer.publicKey)
    if not isValidSignature:
        return HTTP_403("Invalid signature")

    # Step 2: Run doorman access check [NOVEL - see Algorithm 2]
    accessResult = doormanCheckAccess(peer.id, intent, payload)
    if not accessResult.allowed:
        return HTTP_ERROR(accessResult.statusCode, accessResult.reason, accessResult.retryAfter)

    # Step 3: Route based on intent
    if intent == "message":
        return handleMessageIntent(peer, payload)

    elif intent == "agent-comms":
        return handleAgentCommsIntent(peer, payload)

    elif intent == "project.query":
        return handleProjectQueryIntent(peer, payload)

    elif intent == "project.contribute":
        return handleProjectContributeIntent(peer, payload)

    else:
        return HTTP_400("Unknown intent: " + intent)
```

**Key Points:**
- All messages flow through signature verification first (Layer 1 of defense-in-depth)
- Doorman check happens before intent routing (Layer 2 - scope enforcement)
- Intent handlers may apply additional ACLs (Layer 3 - resource-specific checks, e.g., project membership)

---

## Algorithm 2: Doorman Access Check [NOVEL]

**Purpose**: Layer 3 runtime enforcement. Validates every incoming request against negotiated grants before routing to the agent.

**Location**: `src/daemon/doorman.ts::checkAccess()`

**Novel Aspects:**
- Combines cryptographic identity (peer ID), scope grants (Layer 2), and runtime policy enforcement in single decision point
- Cascading lookups: peer ID → full public key → gateway URL (backward compatibility)
- Exact intent matching (NO wildcards in intent names)
- Topic prefix matching for agent-comms only

```python
function doormanCheckAccess(peerId, intent, payload):
    """
    6-step validation: peer lookup, approval status, scope bundle, intent grant,
    topic coverage, rate limit

    Input:
        peerId: Peer identifier (derived from Ed25519 public key)
        intent: String intent name (e.g., "agent-comms", "project.query")
        payload: Message payload (may contain topic field)

    Output:
        {allowed: boolean, reason?: string, statusCode?: int, retryAfter?: int}
    """

    # Step 1: Peer Lookup
    peer = getPeer(peerId)
    if peer is null and len(peerId) >= 16:
        peer = getPeerByPublicKey(peerId)  # Fallback for full public key

    if peer is null:
        return {allowed: false, reason: "Unknown peer", statusCode: 403}

    # Step 2: Approval Status Check
    if peer.status != "approved":
        return {allowed: false, reason: "Peer not approved", statusCode: 403}

    # Step 3: Scope Bundle Determination
    scopeBundle = null
    if peer.grantedScopes is not null:
        scopeBundle = peer.grantedScopes
    else:
        # Backward compatibility: v0.1 peers get default scopes
        scopeBundle = DEFAULT_V1_SCOPES

    # Step 4: Intent Grant Lookup
    grant = findScopeGrant(scopeBundle, intent)
    if grant is null:
        return {
            allowed: false,
            reason: "Intent '" + intent + "' not in granted scope",
            statusCode: 403
        }

    # Step 5: Topic Coverage Check
    topic = payload.topic if payload is not null else null
    if not scopeCoversIntent(grant, intent, topic):
        if topic is not null and grant.topics is not null and len(grant.topics) > 0:
            return {
                allowed: false,
                reason: "Topic '" + topic + "' not allowed for intent '" + intent + "'",
                statusCode: 403
            }
        return {allowed: false, reason: "Intent scope check failed", statusCode: 403}

    # Step 6: Rate Limit Check
    rateLimit = grant.rateLimit if grant.rateLimit is not null else DEFAULT_RATE_LIMIT
    rateLimitResult = checkRateLimit(peerId, intent, rateLimit)
    if not rateLimitResult.allowed:
        return {
            allowed: false,
            reason: "Rate limit exceeded for intent '" + intent + "'",
            statusCode: 429,
            retryAfter: rateLimitResult.retryAfter
        }

    # All checks passed
    return {allowed: true}


function scopeCoversIntent(grant, intent, topic):
    """
    Check if a scope grant covers the requested intent and topic

    Novel aspect: Exact intent matching + topic prefix matching
    NO wildcards in intent names
    """

    # Exact intent match required (no wildcards)
    if grant.intent != intent:
        return false

    # If no topic specified or grant has no topic restrictions, allow
    if topic is null or grant.topics is null or len(grant.topics) == 0:
        return true

    # Topic prefix matching (for agent-comms)
    # Example: topic "project-validation/legal" matches allowed "project-validation"
    for allowedTopic in grant.topics:
        if topic == allowedTopic:
            return true
        if topic.startsWith(allowedTopic + "/"):
            return true

    return false


function findScopeGrant(scopeBundle, intent):
    """Find the scope grant for a specific intent"""
    if scopeBundle is null or scopeBundle.intents is null:
        return null

    for grant in scopeBundle.intents:
        if grant.intent == intent:
            return grant

    return null
```

**Complexity:**
- **Peer lookup**: O(1) hash map lookup
- **Intent matching**: O(k) where k = number of granted intents
- **Topic matching**: O(t) where t = number of allowed topics in grant
- **Rate limit**: O(w) where w = number of requests in sliding window (see Algorithm 4)

---

## Algorithm 3: Sliding Window Rate Limiting with Precise Retry-After

**Purpose**: Track request timestamps per peer+intent and enforce rate limits with precise retry calculation.

**Location**: `src/daemon/doorman.ts::checkRateLimit()`

**Novel Aspect**: Precise retry-after calculation tells the peer exactly when they can retry (not a fixed delay).

```python
# Global state: in-memory store
rateLimitStore = Map<string, RateLimitEntry>()
# RateLimitEntry = {timestamps: array<int>, windowStart: int}

function checkRateLimit(peerId, intent, limit):
    """
    Sliding window rate limiter with precise retry-after

    Input:
        peerId: Peer identifier
        intent: Intent being invoked
        limit: {requests: int, windowSeconds: int}

    Output:
        {allowed: boolean, retryAfter?: int}
    """

    key = peerId + ":" + intent
    now = currentTimeMillis()
    windowMs = limit.windowSeconds * 1000

    entry = rateLimitStore.get(key)

    if entry is null:
        # First request - create entry
        entry = {timestamps: [now], windowStart: now}
        rateLimitStore.set(key, entry)
        return {allowed: true}

    # Filter out timestamps outside the sliding window
    windowStart = now - windowMs
    entry.timestamps = [ts for ts in entry.timestamps if ts > windowStart]
    entry.windowStart = windowStart

    # Check if we're at the limit
    if len(entry.timestamps) >= limit.requests:
        # Calculate when the oldest request will expire
        oldestInWindow = min(entry.timestamps)
        retryAfterMs = (oldestInWindow + windowMs) - now
        retryAfterSec = ceil(retryAfterMs / 1000)

        return {
            allowed: false,
            retryAfter: max(1, retryAfterSec)  # At least 1 second
        }

    # Record this request
    entry.timestamps.append(now)
    return {allowed: true}


function cleanupExpiredEntries():
    """
    Periodic cleanup of expired rate limit entries (runs every 5 minutes)
    """
    now = currentTimeMillis()

    for key in rateLimitStore.keys():
        entry = rateLimitStore.get(key)

        # Remove entries with no timestamps in the last 24 hours
        maxAge = 24 * 3600 * 1000  # 24 hours
        if len(entry.timestamps) == 0 or (now - max(entry.timestamps)) > maxAge:
            rateLimitStore.delete(key)
```

**Key Points:**
- Sliding window is more accurate than fixed window (no "burst at window boundary" problem)
- Precise retry-after calculation: `retryAfter = (oldestTimestamp + windowMs) - now`
- Memory cleanup prevents unbounded growth for inactive peers

---

## Algorithm 4: Ed25519 Signature Verification (Standard)

**Purpose**: Verify incoming messages are signed by the peer's registered public key using Ed25519 signatures.

**Location**: `src/shared/signing.ts::verify()`

**Note**: This is a standard Ed25519 implementation using Node.js crypto module. Included for completeness, not novel.

```python
function verifyEd25519(message, signatureHex, publicKeyHex):
    """
    Verify Ed25519 signature

    Input:
        message: String (JSON-serialized message)
        signatureHex: String (hex-encoded signature, 128 hex chars = 64 bytes)
        publicKeyHex: String (hex-encoded public key in DER format)

    Output:
        boolean (true if signature is valid)
    """

    try:
        # Decode public key from hex to DER format
        publicKeyDer = hexToBytes(publicKeyHex)
        publicKey = importPublicKey(publicKeyDer, format="der", type="spki")

        # Decode signature from hex
        signature = hexToBytes(signatureHex)

        # Verify signature
        # Ed25519 uses built-in hashing (no external hash function needed)
        isValid = crypto.verify(
            algorithm=null,  # Ed25519 has built-in hashing
            message=stringToBytes(message),
            publicKey=publicKey,
            signature=signature
        )

        return isValid

    except error:
        return false


function signEd25519(message, privateKeyHex):
    """
    Generate Ed25519 signature

    Input:
        message: String (JSON-serialized message)
        privateKeyHex: String (hex-encoded private key in DER format)

    Output:
        String (hex-encoded signature, 128 hex chars = 64 bytes)
    """

    privateKeyDer = hexToBytes(privateKeyHex)
    privateKey = importPrivateKey(privateKeyDer, format="der", type="pkcs8")

    # Sign the message
    # Ed25519 automatically hashes the message internally
    signature = crypto.sign(
        algorithm=null,  # Ed25519 has built-in hashing
        message=stringToBytes(message),
        privateKey=privateKey
    )

    return bytesToHex(signature)
```

**Key Details:**
- **Ed25519**: 128-bit security, 32-byte public keys, 64-byte signatures
- **DER encoding**: Keys stored in DER format (distinguished encoding rules)
- **Hex transport**: Keys and signatures hex-encoded for JSON compatibility
- **Built-in hashing**: Ed25519 has built-in SHA-512 hashing, so algorithm parameter is `null`

**Complexity**: O(log n) for Ed25519 signature verification where n = 256 bits (elliptic curve operations)

---

## Algorithm 5: Peer Approval with Symmetric Scope Mirroring [NOVEL]

**Purpose**: Handle federation approval request and automatically mirror scopes back to requester.

**Location**: `src/daemon/server.ts::approvePeer()`

**Novel Aspect**: Symmetric scope mirroring emerged from UX testing - the 90% use case is symmetric bilateral trust. Making this the default eliminates configuration burden.

```python
function approvePeer(peerId, options={}):
    """
    Approve a federation request and mirror scopes back to requester

    Input:
        peerId: Peer identifier from federation request
        options: {
            intents?: array<string>,  # Custom intents (overrides default)
            rateLimit?: {requests: int, windowSeconds: int},
            asymmetric?: boolean  # If true, skip scope mirroring
        }

    Output:
        Success or error
    """

    # Step 1: Retrieve pending request
    peer = getPeer(peerId)
    if peer is null or peer.status != "pending":
        throw Error("No pending request from peer " + peerId)

    # Step 2: Create scope bundle to grant to peer
    intents = options.intents if options.intents else DEFAULT_INTENTS
    # DEFAULT_INTENTS = ["message", "agent-comms", "project.join",
    #                    "project.contribute", "project.query", "project.status"]

    rateLimit = options.rateLimit if options.rateLimit else DEFAULT_RATE_LIMIT
    # DEFAULT_RATE_LIMIT = {requests: 100, windowSeconds: 3600}

    scopes = []
    for intent in intents:
        grant = createScopeGrant(intent, {rateLimit: rateLimit})
        scopes.append(grant)

    scopeBundle = createScopeBundle(scopes)

    # Step 3: Update peer record with granted scopes
    updatePeerGrantedScopes(peer.id, scopeBundle)
    updatePeerStatus(peer.id, "approved")

    # Step 4: Send approval message back to peer
    # Unless asymmetric flag is set, mirror the same scopes back
    if not options.asymmetric:
        # Symmetric mirroring: send the same scope bundle back to peer
        approvalMessage = {
            fromGatewayId: myGatewayId,
            fromDisplayName: myDisplayName,
            fromGatewayUrl: myGatewayUrl,
            fromPublicKey: myPublicKey,
            fromEmail: myEmail,
            timestamp: currentTimeMillis(),
            protocolVersion: "0.2.0",
            scopeGrants: scopeBundle  # Mirror the same scopes
        }
    else:
        # Asymmetric: send minimal approval without scope grants
        approvalMessage = {
            fromGatewayId: myGatewayId,
            fromDisplayName: myDisplayName,
            fromGatewayUrl: myGatewayUrl,
            fromPublicKey: myPublicKey,
            timestamp: currentTimeMillis(),
            protocolVersion: "0.2.0"
        }

    # Send approval via HTTPS POST
    response = httpPost(peer.gatewayUrl + "/federation/approve", approvalMessage)

    if response.statusCode != 200:
        throw Error("Failed to send approval: " + response.statusText)

    return {success: true}


function createScopeGrant(intent, options):
    """Create a single scope grant"""
    return {
        intent: intent,
        topics: options.topics if "topics" in options else null,
        rateLimit: options.rateLimit if "rateLimit" in options else DEFAULT_RATE_LIMIT
    }


function createScopeBundle(grants):
    """Bundle multiple scope grants"""
    return {
        intents: grants,
        version: "0.2.0"
    }
```

**Key Points:**
- Default behavior is symmetric mirroring (90% use case)
- Asymmetric flag available for 10% edge cases (e.g., public API gateway that accepts requests but doesn't send)
- Scopes are created and persisted BEFORE sending approval (crash recovery: approval can be re-sent)
- Approval message includes full scope bundle, enabling stateless peer processing

---

## Algorithm 6: Hierarchical Topic Policy Resolution [NOVEL]

**Purpose**: Determine which agent policy applies to a given topic using prefix matching with hierarchical fallthrough.

**Location**: `src/daemon/agent-comms.ts::resolveTopicPolicy()`

**Novel Aspect**: Four-level fallthrough (peer-topic → global-topic → peer-default → global-default) enables fine-grained control without complex ACL syntax. Emerged from real-world testing.

```python
function resolveTopicPolicy(peer, topic, topicPolicies):
    """
    Resolve which policy applies to a topic using hierarchical fallthrough

    Input:
        peer: Peer object {id, ...}
        topic: String (e.g., "project-validation/legal")
        topicPolicies: Array of TopicPolicy objects {
            topic: string,
            level: "off" | "notifications-only" | "interactive",
            peer?: string  # If present, policy is peer-specific
        }

    Output:
        TopicPolicy object or null

    Fallthrough hierarchy:
        1. peer-topic: Exact or prefix match for this peer + topic
        2. global-topic: Exact or prefix match for this topic (any peer)
        3. peer-default: Wildcard (*) policy for this peer
        4. global-default: Wildcard (*) policy (any peer)
    """

    # Level 1: Peer-specific topic match (most specific)
    peerPolicies = [p for p in topicPolicies if p.peer == peer.id]

    # 1a: Exact match
    exactMatch = find(peerPolicies, lambda p: p.topic == topic)
    if exactMatch:
        return exactMatch

    # 1b: Prefix match (longest prefix wins)
    prefixMatches = [p for p in peerPolicies if topic.startsWith(p.topic + "/")]
    if len(prefixMatches) > 0:
        # Sort by topic length descending (longer = more specific)
        prefixMatches.sort(key=lambda p: len(p.topic), reverse=true)
        return prefixMatches[0]

    # Level 2: Global topic match (any peer)
    globalPolicies = [p for p in topicPolicies if p.peer is null]

    # 2a: Exact match
    exactMatch = find(globalPolicies, lambda p: p.topic == topic)
    if exactMatch:
        return exactMatch

    # 2b: Prefix match
    prefixMatches = [p for p in globalPolicies if topic.startsWith(p.topic + "/")]
    if len(prefixMatches) > 0:
        prefixMatches.sort(key=lambda p: len(p.topic), reverse=true)
        return prefixMatches[0]

    # Level 3: Peer-specific wildcard
    peerWildcard = find(peerPolicies, lambda p: p.topic == "*")
    if peerWildcard:
        return peerWildcard

    # Level 4: Global wildcard (default)
    globalWildcard = find(globalPolicies, lambda p: p.topic == "*")
    if globalWildcard:
        return globalWildcard

    # No policy found - deny by default
    return null


function getEffectivePolicy(peer, topic):
    """
    Get the effective policy for a peer+topic, with fallthrough

    Returns: {level: string, wittyMessage?: string}
    """

    topicPolicies = loadTopicPolicies()  # From ~/.ogp/config.json
    policy = resolveTopicPolicy(peer, topic, topicPolicies)

    if policy is null:
        # No policy found - default deny
        return {level: "off", wittyMessage: randomWittyRejection()}

    if policy.level == "off":
        # Explicit deny with witty message
        return {level: "off", wittyMessage: randomWittyRejection()}

    return {level: policy.level}


function randomWittyRejection():
    """
    Return a witty, vague rejection message that does NOT confirm topic existence

    Novel aspect: Prevents topic enumeration attacks
    """
    messages = [
        "I'm afraid I can't help with that right now.",
        "That's outside my current scope.",
        "Not something I'm equipped to handle at the moment.",
        "I'll have to pass on that one.",
        "That's not in my wheelhouse right now."
    ]
    return randomChoice(messages)
```

**Example:**
- Topic: `"project-validation/legal"`
- Policies:
  ```
  [{topic: "project-validation", level: "notifications-only"},
   {topic: "project-validation/legal", level: "interactive"},
   {topic: "*", level: "off"}]
  ```
- Winner: `"project-validation/legal"` (exact match beats prefix, prefix beats wildcard)

**Complexity**: O(p) where p = number of policies (linear scan for matching)

---

## Summary of Algorithms

| Algorithm | Novel? | Key Innovation |
|-----------|--------|----------------|
| 1. Federation Message Handler | No | Standard request routing |
| 2. Doorman Access Check | **YES** | Three-layer scope enforcement with exact intent + prefix topic matching |
| 3. Sliding Window Rate Limiting | Partially | Standard sliding window + novel precise retry-after calculation |
| 4. Ed25519 Verification | No | Standard Ed25519 implementation |
| 5. Peer Approval with Mirroring | **YES** | Symmetric scope mirroring as UX default with asymmetric override |
| 6. Hierarchical Topic Resolution | **YES** | Four-level fallthrough for fine-grained agent control |

Novel algorithms (2, 5, 6) form the core inventive contribution. Standard algorithms (1, 3, 4) are included for completeness but use well-established techniques.
