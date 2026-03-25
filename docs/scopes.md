# OGP Scope Negotiation (v0.2.0)

OGP v0.2.0 introduces a three-layer scope model for per-peer access control, inspired by BGP route filtering.

## The Three-Layer Model

```
Layer 1: Gateway Capabilities  → What I CAN support (advertised globally)
Layer 2: Peer Negotiation      → What I WILL grant YOU (per-peer, during approval)
Layer 3: Runtime Enforcement   → Is THIS request within YOUR granted scope (doorman)
```

### Layer 1: Gateway Capabilities

Your gateway advertises its capabilities in the federation card at `/.well-known/ogp`:

```json
{
  "version": "0.2.3",
  "displayName": "David's Gateway",
  "capabilities": {
    "intents": ["message", "task-request", "status-update", "agent-comms", "project"],
    "features": ["scope-negotiation", "reply-callback", "project-intent"]
  }
}
```

This tells other gateways what you **can** support, not what you **will** grant.

Capabilities are automatically populated from:
- **Built-in intents**: `message`, `task-request`, `status-update`, `agent-comms`, `project`
- **Custom intents**: Registered via `ogp intent register`
- **Features**: Protocol features your gateway supports

### Layer 2: Peer Negotiation

When you approve a federation request, you decide what to grant **this specific peer**:

```bash
# Grant Stan only agent-comms with specific topics
ogp federation approve stan \
  --intents agent-comms \
  --topics memory-management,task-delegation \
  --rate 10/60

# Grant Alice full access to message and task-request
ogp federation approve alice \
  --intents message,task-request,status-update \
  --rate 100/3600
```

Scope grants are stored with the peer record and sent to the remote gateway during approval.

### Layer 3: Runtime Enforcement (Doorman)

The doorman validates every incoming request:

1. **Peer verification** - Is the sender approved?
2. **Scope check** - Is this intent in their granted scopes?
3. **Topic check** - For agent-comms, is this topic allowed?
4. **Rate limit** - Is the peer within their request quota?

Requests that fail any check receive appropriate error codes:
- `403 Forbidden` - Scope or topic not allowed
- `429 Too Many Requests` - Rate limit exceeded (includes `Retry-After`)

## Scope Grant Structure

```typescript
interface ScopeGrant {
  intent: string;                    // e.g., "agent-comms"
  enabled: boolean;                  // Can disable without removing
  rateLimit?: {
    requests: number;                // Max requests allowed
    windowSeconds: number;           // Time window
  };
  topics?: string[];                 // For agent-comms only
  expiresAt?: string;                // Optional expiration (ISO timestamp)
}

interface ScopeBundle {
  version: "0.2.0";
  grantedAt: string;                 // When this grant was created
  scopes: ScopeGrant[];
}
```

## CLI Commands

### View Scopes

```bash
ogp federation scopes <peer-id>
```

Shows both:
- **Granted to peer**: What they can request from you
- **Received from peer**: What you can request from them

### Approve with Scopes

```bash
ogp federation approve <peer-id> \
  --intents <comma-separated-list> \
  --rate <requests>/<seconds> \
  --topics <comma-separated-list>
```

### Update Grants

```bash
ogp federation grant <peer-id> \
  --intents <comma-separated-list> \
  --rate <requests>/<seconds> \
  --topics <comma-separated-list>
```

## Rate Limiting

Rate limits are enforced per-peer, per-intent using a sliding window algorithm:

```bash
# 10 requests per minute for agent-comms
ogp federation approve stan --intents agent-comms --rate 10/60

# 100 requests per hour for all intents
ogp federation approve stan --intents message,task-request --rate 100/3600
```

When a peer exceeds their rate limit:
- Response: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`
- Message: Rate limit exceeded for intent 'agent-comms'

## Topic Restrictions (agent-comms)

Topics provide fine-grained control over agent communication categories:

```bash
# Allow only memory-related topics
ogp federation approve stan --intents agent-comms --topics memory-management,context-persistence

# Peer can send:
ogp federation agent me memory-management "Question"  # ✓

# Peer cannot send:
ogp federation agent me billing "Question"  # ✗ 403 Topic not allowed
```

Topics support prefix matching:
- Allowing `memory` matches `memory`, `memory/contexts`, `memory/persistence`
- Use specific topics for tighter control

## Backward Compatibility

OGP v0.2.0 is fully backward compatible with v0.1 peers:

| Scenario | Behavior |
|----------|----------|
| v0.2 approves v0.1 peer | No scopes sent, default rate limits apply |
| v0.1 peer sends message | Allowed with default limit (100/hour) |
| v0.2 sends to v0.1 peer | Works normally, no scope enforcement on their end |

Protocol version is detected automatically from:
1. `protocolVersion` field in approval
2. Presence of `scopeGrants` field
3. Federation card version

## Security Considerations

- **Principle of least privilege**: Grant only what's needed
- **Review grants periodically**: Use `ogp federation scopes` to audit
- **Monitor rate limits**: Watch for peers hitting limits frequently
- **Use topic restrictions**: Especially for agent-comms
- **Set expiration**: For temporary access, use `expiresAt` in code

## Custom Intents

Register custom intent handlers for specialized workflows:

```bash
# Register a deployment intent
ogp intent register deployment \
  --session-key "agent:main:main" \
  --description "Deployment notifications"

# Register a monitoring intent
ogp intent register monitoring \
  --session-key "agent:ops:alerts" \
  --description "System monitoring and alerts"

# List all registered intents
ogp intent list

# Remove an intent
ogp intent remove deployment
```

Custom intents appear in your gateway capabilities and can be granted to peers:

```bash
# Grant peer access to custom intent
ogp federation approve alice \
  --intents message,deployment \
  --rate 50/3600
```

## Project Intent

The `project` intent enables collaborative project management across federated peers.

### Project Actions

| Action | Description | Rate Limit Recommended |
|--------|-------------|------------------------|
| `contribute` | Send contribution to peer's project | 100/hour |
| `query` | Query peer's project contributions | 50/hour |
| `request-join` | Request to join peer's project | 10/hour |
| `status` | Get project status from peer | 20/hour |

### Grant Project Access

```bash
# Grant project collaboration access
ogp federation approve alice \
  --intents project \
  --rate 100/3600
```

Project scope grants don't require topic restrictions - access is controlled at the project membership level. Peers can only contribute to projects they're members of.

## Examples

### Minimal Access

```bash
# Grant only message intent
ogp federation approve stan --intents message --rate 10/3600
```

### Full Agent Access

```bash
# Grant full agent-comms with generous limits
ogp federation approve alice \
  --intents agent-comms \
  --rate 1000/3600
```

### Scoped Agent Access

```bash
# Grant agent-comms for specific topics
ogp federation approve bob \
  --intents agent-comms \
  --topics memory-management,planning \
  --rate 50/3600
```

### Project Collaboration

```bash
# Grant project and agent-comms for team collaboration
ogp federation approve charlie \
  --intents agent-comms,project \
  --topics project-updates,planning \
  --rate 200/3600
```

### Custom Intent Access

```bash
# Grant custom deployment intent
ogp federation approve deploy-bot \
  --intents deployment,monitoring \
  --rate 500/3600
```
