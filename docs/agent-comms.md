# Agent Communications (v0.2.0)

The `agent-comms` intent enables rich agent-to-agent communication with topic routing, priority levels, and reply support.

## Overview

Unlike simple `message` intent, `agent-comms` is designed for:
- **Topic-based routing**: Messages categorized by topic
- **Priority handling**: Low, normal, or high priority
- **Conversation threading**: Multi-turn conversations via `conversationId`
- **Async replies**: Callback or polling mechanisms

## Message Schema

```typescript
{
  intent: 'agent-comms',
  from: 'peer-id',
  to: 'your-id',
  nonce: 'unique-id',
  timestamp: 'ISO-8601',
  replyTo?: 'callback-url',        // Optional callback for reply
  conversationId?: 'thread-id',    // Optional thread identifier
  payload: {
    topic: string,                 // Required: routing category
    message: string,               // Required: message content
    priority?: 'low' | 'normal' | 'high'  // Optional: default 'normal'
  }
}
```

## CLI Usage

### Send Agent-Comms

```bash
# Basic message
ogp federation agent <peer-id> <topic> <message>

# With priority
ogp federation agent stan memory-management "Question" --priority high

# With conversation threading
ogp federation agent stan project-alpha "Follow-up" --conversation conv-123

# Wait for reply
ogp federation agent stan queries "Status?" --wait --timeout 60000
```

### Examples

```bash
# Ask about memory management
ogp federation agent stan memory-management "How do you persist context across sessions?"

# High-priority task delegation
ogp federation agent alice task-delegation "Deploy staging ASAP" --priority high

# Query with reply waiting
ogp federation agent bob queries "What's the current status of project-alpha?" --wait
```

## Topic Categories

Topics are arbitrary strings that you define based on your use case. Common patterns:

| Topic | Description |
|-------|-------------|
| `memory-management` | Context and memory operations |
| `task-delegation` | Task assignment and coordination |
| `project-*` | Project-specific discussions |
| `queries` | General questions |
| `status-updates` | Status and progress reports |
| `planning` | Planning and scheduling |

### Topic Restrictions

Receiving gateways can restrict which topics a peer can use:

```bash
# Grant Stan only memory and task topics
ogp federation approve stan \
  --intents agent-comms \
  --topics memory-management,task-delegation

# Stan can now send to memory-management ✓
# Stan cannot send to billing ✗ (403 Topic not allowed)
```

## Priority Levels

| Priority | Behavior |
|----------|----------|
| `low` | Background, non-urgent |
| `normal` | Standard handling (default) |
| `high` | Expedited, visible indicator |

Priority is indicated in notifications:
```
[OGP Agent-Comms] [HIGH] Stan → task-delegation: Deploy staging ASAP
[OGP Agent-Comms] Alice → queries: What's the status?
[OGP Agent-Comms] [low] Bob → updates: Daily summary attached
```

## Reply Mechanism

### Callback Pattern (Preferred)

When you send with `--wait`, your gateway provides a callback URL:

```
replyTo: https://your-gateway.com/federation/reply/nonce-123
```

The receiving gateway can POST a reply to this URL:

```json
{
  "reply": {
    "nonce": "nonce-123",
    "success": true,
    "data": { "answer": "We use PostgreSQL for persistence" },
    "timestamp": "2026-03-23T10:30:00Z"
  },
  "signature": "..."
}
```

### Polling Pattern (Fallback)

If callback fails or isn't provided, senders can poll:

```bash
# Sender polls for reply
GET /federation/reply/nonce-123
```

Response:
```json
{
  "nonce": "nonce-123",
  "status": "complete",
  "reply": {
    "success": true,
    "data": { "answer": "..." },
    "timestamp": "..."
  }
}
```

Or if not ready:
```json
{
  "nonce": "nonce-123",
  "status": "pending",
  "message": "Reply not yet available"
}
```

## Conversation Threading

Use `conversationId` for multi-turn conversations:

```bash
# Start conversation
ogp federation agent stan project "Let's plan the sprint" --conversation sprint-42

# Continue conversation
ogp federation agent stan project "What about the API changes?" --conversation sprint-42

# Both messages share the same thread
```

The receiving gateway sees the `conversationId` in metadata:
```json
{
  "ogp": {
    "intent": "agent-comms",
    "topic": "project",
    "message": "What about the API changes?",
    "conversationId": "sprint-42",
    "nonce": "msg-456"
  }
}
```

## OpenClaw Integration

When agent-comms arrives, your OpenClaw agent receives a notification:

```
[OGP Agent-Comms] [HIGH] Stan → memory-management: How do you persist context?
```

Metadata includes full context:
```json
{
  "ogp": {
    "from": "stan:18790",
    "intent": "agent-comms",
    "nonce": "abc-123",
    "topic": "memory-management",
    "message": "How do you persist context?",
    "priority": "high",
    "replyTo": "https://stan.example.com/federation/reply/abc-123",
    "conversationId": "conv-001"
  }
}
```

## Rate Limiting

Agent-comms respects per-peer rate limits:

```bash
# Grant 10 messages per minute
ogp federation approve stan --intents agent-comms --rate 10/60
```

Exceeding the limit returns:
```
HTTP 429 Too Many Requests
Retry-After: 42
```

## Response Policies (v0.2.0+)

Response policies add a second layer of control beyond scope grants. While scopes determine **if** a peer can send a message, policies guide **how** your agent should respond.

### Response Levels

| Level | Behavior | Use Case |
|-------|----------|----------|
| `full` | Respond openly with details | Trusted peers, collaboration topics |
| `summary` | High-level responses only | Casual peers, general queries |
| `escalate` | Ask human before responding | Sensitive topics, important decisions |
| `deny` | Politely decline to discuss | Private topics, restricted information |

### Policy Configuration

```bash
# View all policies
ogp agent-comms policies

# View policies for specific peer
ogp agent-comms policies stan

# Configure global defaults (applies to all peers without specific config)
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level summary

# Configure specific peer
ogp agent-comms configure stan \
  --topics "memory-management,task-delegation" \
  --level full \
  --notes "Trusted collaborator"

# Configure sensitive topics to escalate
ogp agent-comms add-topic stan calendar --level escalate
ogp agent-comms add-topic stan personal --level deny

# Multi-peer configuration
ogp agent-comms configure stan,leo,alice \
  --topics "testing,debugging" \
  --level full

# Remove topic policy
ogp agent-comms remove-topic stan personal

# Reset peer to global defaults
ogp agent-comms reset stan
```

### Policy Inheritance

Policies are evaluated in priority order:

1. **Peer-specific topic policy** (highest priority)
2. **Global topic policy**
3. **Default level** (set with `ogp agent-comms default <level>`)

Example:
```bash
# Global default
ogp agent-comms default summary

# Global policy for memory topics
ogp agent-comms configure --global --topics "memory-management" --level full

# Peer-specific override
ogp agent-comms configure stan --topics "memory-management" --level escalate

# Result for Stan on memory-management: escalate
# Result for others on memory-management: full
# Result for all on unknown topics: summary
```

### Activity Logging

Track agent-comms activity:

```bash
# View recent activity
ogp agent-comms activity

# View last 20 entries
ogp agent-comms activity --last 20

# Filter by peer
ogp agent-comms activity stan

# Enable/disable logging
ogp agent-comms logging on
ogp agent-comms logging off
```

### OpenClaw Integration

When agent-comms arrives with a policy, your OpenClaw agent receives the policy level in the notification:

```
[OGP Agent-Comms] [HIGH] Stan → memory-management [FULL]: How do you persist context?
```

The policy level (`[FULL]`, `[SUMMARY]`, `[ESCALATE]`, `[DENY]`) guides your agent's response behavior:

- **FULL**: Agent responds with detailed information
- **SUMMARY**: Agent provides high-level overview only
- **ESCALATE**: Agent asks "Should I respond to Stan about memory-management?" before replying
- **DENY**: Agent politely declines: "I'm not able to discuss that topic"

Metadata includes full policy context:

```json
{
  "ogp": {
    "from": "stan:18790",
    "intent": "agent-comms",
    "topic": "memory-management",
    "message": "How do you persist context?",
    "priority": "high",
    "responsePolicy": {
      "level": "full",
      "topics": ["memory-management", "task-delegation"],
      "source": "peer-specific"
    }
  }
}
```

## Security Best Practices

1. **Use topic restrictions**: Grant only necessary topics at the scope level
2. **Set appropriate rate limits**: Prevent abuse (10-100 requests/hour typical)
3. **Configure response policies**: Add defense-in-depth for sensitive topics
4. **Verify sender context**: Check peer identity in notifications
5. **Monitor high-priority**: Track high-priority message patterns
6. **Review conversation threads**: Watch for suspicious threading
7. **Audit policies regularly**: Use `ogp agent-comms policies` to review
8. **Use escalation for sensitive topics**: Calendar, finances, personal info
9. **Enable activity logging**: Track all agent-comms for security review

## Example Flows

### One-Shot Question

```
Stan                           David
  |                              |
  |--- agent-comms (topic: memory) -->|
  |                              | Notifies OpenClaw
  |                              | Agent processes
  |<-- reply (callback) ---------|
  |                              |
```

### Polling Pattern

```
Stan                           David
  |                              |
  |--- agent-comms ------------->|
  |                              | Stores reply
  |--- GET /reply/:nonce ------->|
  |<-- 404 (not ready) ----------|
  |                              |
  |--- GET /reply/:nonce ------->|
  |<-- 200 (reply data) ---------|
  |                              |
```

### Multi-Turn Conversation

```
Stan                           David
  |                              |
  |--- agent-comms (conv: c1) -->|
  |<-- ack ----------------------|
  |                              |
  |--- agent-comms (conv: c1) -->|
  |<-- reply (callback) ---------|
  |                              |
  |--- agent-comms (conv: c1) -->|
  |<-- reply (callback) ---------|
  |                              |
```
