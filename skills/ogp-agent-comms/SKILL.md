---
skill_name: ogp-agent-comms
version: 0.1.0
description: Interactive wizard to configure agent-to-agent communication policies
trigger: Use when the user wants to configure how their agent responds to incoming agent-comms messages from federated peers
---
## Prerequisites

The OGP daemon must be installed. If you see errors like 'ogp: command not found', install it first:

```bash
npm install -g github:dp-pcs/ogp --ignore-scripts
ogp-install-skills
ogp setup
```

Full documentation: https://github.com/dp-pcs/ogp



# OGP Agent-Comms Configuration

This skill is an interactive wizard for configuring how your agent handles incoming agent-comms messages from federated peers.

## When to Use

Use this skill when:
- User wants to set up agent-to-agent communication policies
- User wants to configure what topics their agent can discuss with peers
- User wants different policies for different peers
- User says things like "configure agent comms", "set up agent communication", "how should my agent respond to X"

## Overview

Agent-comms policies control HOW your agent responds to incoming messages (separate from scope grants which control WHETHER messages are allowed).

**Two layers:**
1. **Scope grants** (doorman) - Controls which intents/topics are ALLOWED
2. **Response policies** (this skill) - Controls HOW your agent RESPONDS

## Interactive Flow

When invoked, guide the user through this flow:

### Step 1: Check Prerequisites

```bash
# Verify OGP is running and has peers
ogp status
ogp federation list --status approved
```

If no approved peers, inform the user they need to federate first.

### Step 2: Show Current Configuration

```bash
# Show current policies
ogp agent-comms policies
```

### Step 3: Ask What to Configure

Present options:
1. **Global defaults** - Apply to all peers (current and future)
2. **Specific peer(s)** - Configure individual peers
3. **View current policies** - Just show what's configured

### Step 4: For Specific Peers - Multi-Select

If configuring specific peers, show the list and allow multi-select:

```bash
# List peers for selection
ogp federation list --status approved --json
```

Example interaction:
```
Select peers to configure:
  [x] Stanislav (peer-gateway.trycloudflare.com)
  [ ] Leonardo (leo-gateway.example.com)
  [x] Alice (alice.ngrok-free.app)

Selected: Stanislav, Alice
```

### Step 5: Configure Topics

Ask which topics the agent should engage on:

```
Which topics should your agent discuss with these peers?
  [x] memory-management
  [x] testing
  [x] general
  [ ] calendar (add custom)
  [ ] personal (add custom)

Add custom topic: _______
```

### Step 6: Configure Response Level

For each topic (or all topics), set the response level:

| Level | Behavior |
|-------|----------|
| `full` | Respond openly, share details |
| `summary` | High-level responses only, no specifics |
| `escalate` | Ask human before responding |
| `deny` | Politely decline to discuss |

### Step 7: Save Configuration

```bash
# Save policies for selected peers
ogp agent-comms configure <peer-id> \
  --topics "memory-management,testing,general" \
  --level full

# Or set global defaults
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level summary
```

### Step 8: Confirm and Show Result

```bash
# Show the updated configuration
ogp agent-comms policies <peer-id>
```

## CLI Commands

### View All Policies

```bash
ogp agent-comms policies
```

Shows global defaults and per-peer overrides.

### View Peer Policy

```bash
ogp agent-comms policies <peer-id>
```

Shows effective policy for a specific peer (global + overrides).

### Configure Global Defaults

```bash
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level summary \
  --notes "Default: be helpful but don't overshare"
```

### Configure Specific Peer

```bash
ogp agent-comms configure <peer-id> \
  --topics "memory-management,testing,general" \
  --level full \
  --notes "Stan is a trusted collaborator"
```

### Configure Multiple Peers at Once

```bash
ogp agent-comms configure stan,leonardo,alice \
  --topics "testing" \
  --level full
```

### Add Topic to Existing Policy

```bash
ogp agent-comms add-topic <peer-id> calendar --level escalate
```

### Remove Topic

```bash
ogp agent-comms remove-topic <peer-id> personal
```

### Reset to Global Defaults

```bash
ogp agent-comms reset <peer-id>
```

## Policy Inheritance

1. **Global defaults** apply to all peers
2. **Per-peer policies** override globals for that peer
3. **Topic-level settings** are the most specific

Example:
```
Global: { "general": "summary", "testing": "full" }
Stan:   { "memory-management": "full" }

Effective for Stan:
  - general: summary (from global)
  - testing: full (from global)
  - memory-management: full (from Stan-specific)
```

## Response Policy Schema

Stored in `~/.ogp/peers.json` under each peer:

```json
{
  "id": "stan:18790",
  "displayName": "Stanislav",
  "responsePolicy": {
    "memory-management": {
      "level": "full",
      "notes": "Stan is working on similar architecture"
    },
    "testing": {
      "level": "full"
    },
    "calendar": {
      "level": "escalate",
      "notes": "Ask me before sharing schedule"
    }
  }
}
```

Global defaults in `~/.ogp/config.json`:

```json
{
  "agentComms": {
    "globalPolicy": {
      "general": { "level": "summary" },
      "testing": { "level": "full" }
    },
    "defaultLevel": "summary",
    "activityLog": true
  }
}
```

## How Your Agent Uses These Policies

When an agent-comms message arrives:

1. **Doorman** checks if the intent/topic is allowed (scope grants)
2. **Your agent** receives the message via notification
3. **Your agent** looks up the response policy:
   - Check peer-specific policy for this topic
   - Fall back to global policy for this topic
   - Fall back to defaultLevel
4. **Your agent** responds according to the level:
   - `full`: Engage openly
   - `summary`: Brief, high-level response
   - `escalate`: "Let me check with my human and get back to you"
   - `deny`: "I'm not able to discuss that topic"

## Activity Logging

When enabled, all agent-comms interactions are logged:

```bash
# View activity log
ogp agent-comms activity

# View for specific peer
ogp agent-comms activity <peer-id>

# View last N entries
ogp agent-comms activity --last 20
```

Log format:
```
2026-03-23 11:52:14 [IN]  Stanislav → testing: Hello from Stan!
2026-03-23 11:52:15 [OUT] → Stanislav: Hi Stan! Test received successfully.
2026-03-23 11:55:22 [IN]  Leonardo → calendar: What's David's availability?
2026-03-23 11:55:23 [OUT] → Leonardo: [ESCALATED] Checking with David...
```

## Example Configurations

### Trusted Collaborator (Full Access)

```bash
ogp agent-comms configure stan \
  --topics "memory-management,testing,general,code-review" \
  --level full \
  --notes "Trusted peer, full collaboration"
```

### Business Contact (Limited)

```bash
ogp agent-comms configure leonardo \
  --topics "general,status-updates" \
  --level summary \
  --notes "Professional contact, keep it high-level"
```

### New Federation (Cautious)

```bash
ogp agent-comms configure --global \
  --topics "general,testing" \
  --level escalate \
  --notes "Default: check with human for new peers"
```

## Troubleshooting

### Agent not following policies

1. Verify the policy is saved:
   ```bash
   ogp agent-comms policies <peer-id>
   ```

2. Check if the topic is in scope grants (doorman):
   ```bash
   ogp federation scopes <peer-id>
   ```

3. Restart daemon to reload config:
   ```bash
   ogp stop && ogp start
   ```

### Policy not taking effect for new peer

New peers inherit global defaults. Configure them specifically:
```bash
ogp agent-comms configure <new-peer-id> --topics "..." --level "..."
```
