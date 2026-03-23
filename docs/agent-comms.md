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

## Security Best Practices

1. **Use topic restrictions**: Grant only necessary topics
2. **Set appropriate rate limits**: Prevent abuse
3. **Verify sender context**: Check peer identity in notifications
4. **Monitor high-priority**: Track high-priority message patterns
5. **Review conversation threads**: Watch for suspicious threading

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
