---
skill_name: ogp-project
version: 1.1.1
description: Agent-aware project context skill for OGP with interview, freeform logging, and cross-peer summarization (updated for OGP 0.2.24+ peer identity and 0.2.28+ multi-agent notifyTargets)
trigger: Use when the user wants to create, manage, log to, or summarize OGP projects. This includes project context interviews, freeform activity logging, and cross-peer collaboration. Also triggers on natural logging phrases like "remember this for project X", "account for this", "make note of", "track this", "jot this down", "save this to", "document this" when a project context is active or named.
requires:
  bins:
    - ogp
  state_paths:
    - ~/.ogp/config.json
    - ~/.ogp/projects.json
    - ~/.ogp/peers.json
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---
## Prerequisites

The OGP daemon must be installed and configured. If you see errors like 'ogp: command not found', install it first:

```bash
npm install -g @dp-pcs/ogp
ogp-install-skills
ogp setup
ogp start
```

**Note on Peer IDs (OGP 0.2.24+):** Peers are identified by the first 16 characters of their Ed25519 public key (e.g., `302a300506032b65`). This is stable even when their gateway URL changes. You can also reference peers by their **alias** (the friendly name you assigned during federation).

**Note on Multi-Agent Routing (OGP 0.2.28+):** When `notifyTargets` is configured in `~/.ogp/config.json`, project-related federation messages can be routed to specific agents. Each agent can have its own project context and policies.

Full documentation: https://github.com/dp-pcs/ogp



# OGP Project Context Management

This skill enables conversational project management with OGP federation. It provides agent-aware project creation with context interviews, freeform logging capabilities, and cross-peer collaboration summaries.

## When to Use

Use this skill when:
- User wants to create a new OGP project with contextual setup
- User says "add this to project X" or "log that to project Y"
- User asks about project status, activity, or collaborator contributions
- User wants to understand project context or recent work
- User mentions OGP projects, project logging, or cross-peer collaboration

## Core Features

### 1. Project Creation with Context Interview
- Interactive 5-question interview during project creation
- Captures repository, workspace, notes location, collaborators, description
- Stores as structured `context.*` contributions

### 2. Freeform Activity Logging
- Monitors for logging signals ("add this to project X")
- Agent-driven logging of decisions, progress, blockers
- Flexible entry type assignment (progress, decision, blocker, context, summary)
- **Auto-registration**: Project IDs auto-register as agent-comms topics for all approved peers

### 3. Project-Aware Agent Behavior
- Auto-loads project context on first reference
- Proactive logging during work sessions
- Cross-peer contribution awareness

### 4. Cross-Peer Summarization
- Queries both local and peer contributions
- Unified view of team activity
- Deduplication and synthesis

## Interactive Workflows

### Project Creation Interview

When creating a project, conduct this optional interview:

```bash
# First create the project
ogp project create <project-id> <name> --description "<description>"
```

Then run interview flow:
```
Project created! Let me capture some context (all optional — press Enter to skip):

1. 📁 GitHub/GitLab repo URL?
   → [if provided] ogp project contribute <id> context.repository "<url>"

2. 💻 Local workspace folder?
   → [if provided] ogp project contribute <id> context.workspace "<path>"

3. 📝 Where do you keep notes? (Obsidian vault, Apple Notes, etc.)
   → [if provided] ogp project contribute <id> context.notes "<location>"

4. 👥 Any collaborators already? (peer IDs or names)
   → [if provided] ogp project contribute <id> context.collaborators "<collaborators>"

5. 🎯 One sentence: what is this project about?
   → [if provided] ogp project contribute <id> context.description "<description>"
```

### Freeform Logging Detection

**IMPORTANT: Detect logging intent from ANY natural phrasing — not just exact keywords.**

Monitor for these signals (and semantic equivalents):

| User Input | Action | Example |
|------------|---------|---------|
| "add this to [project]" | `ogp project contribute <id> context "<summary>"` | Context logging |
| "log that to [project]" | `ogp project contribute <id> progress "<summary>"` | Progress update |
| "remember for [project] that..." | `ogp project contribute <id> context "<summary>"` | Context note |
| "account for this in [project]" | `ogp project contribute <id> context "<summary>"` | Context note |
| "make note of this for [project]" | `ogp project contribute <id> context "<summary>"` | Note |
| "track this in [project]" | `ogp project contribute <id> progress "<summary>"` | Progress |
| "jot this down for [project]" | `ogp project contribute <id> context "<summary>"` | Quick note |
| "save this to [project]" | `ogp project contribute <id> context "<summary>"` | Context |
| "put this in [project]" | `ogp project contribute <id> context "<summary>"` | Context |
| "document this for [project]" | `ogp project contribute <id> context "<summary>"` | Documentation |
| After coding session | Offer: "Should I log a summary to [project]?" | Proactive logging |
| Decision made | `ogp project contribute <id> decision "<summary>"` | Architecture decisions |
| Blocker encountered | `ogp project contribute <id> blocker "<summary>"` | Issue tracking |

**If no project is specified:** Ask "Which project should I log this to?" and list active projects from `ogp project list`.

**Intent over keywords:** If the user clearly wants to capture something for a project — regardless of exact phrasing — trigger the logging flow. Don't wait for magic words.

### Project Status and Summarization

**Local project query:**
```bash
# Get project overview
ogp project status <project-id>

# Get recent activity
ogp project query <project-id> --limit 10

# Get specific topics
ogp project query <project-id> --topic progress
ogp project query <project-id> --topic context.repository
```

**Cross-peer collaboration:**
```bash
# Query peer contributions
ogp project query-peer <peer-id> <project-id>

# Get peer project status
ogp project status-peer <peer-id> <project-id>
```

**Synthesized team view:**
1. Query local contributions
2. Query each peer's contributions
3. Merge, deduplicate, and present unified timeline
4. Highlight collaboration patterns and recent activity

## Agent Instructions

### On Project Reference
When a project is mentioned:
1. **First time**: Fetch all `context.*` contributions to understand the project
2. **Check for updates**: Query recent contributions since last interaction
3. **Cross-peer check**: If project has collaborators, query peer activity

### During Work Sessions
1. **Monitor for decisions**: Log architectural or product decisions automatically
2. **Track blockers**: When user expresses frustration or being stuck, offer to log as blocker
3. **Completion logging**: After significant work, offer: "Should I log a progress summary to [project]?"

### Logging Intelligence
**Entry Type Selection Logic:**
- `progress` — work completed, features implemented, milestones reached
- `decision` — architectural choices, technology selections, product decisions
- `blocker` — things preventing progress, issues encountered, dependencies
- `context` — general observations, meeting notes, requirements changes
- `summary` — periodic digests, weekly summaries, sprint reviews

**Example Logging:**
```bash
# User completed authentication feature
ogp project contribute auth-service progress "Implemented OAuth2 login flow with GitHub provider. Added JWT token management and user session persistence. All tests passing."

# User made architectural decision
ogp project contribute auth-service decision "Decided to use Redis for session storage instead of database. Better performance for frequent session lookups and automatic expiration."

# User encountered blocker
ogp project contribute auth-service blocker "GitHub OAuth app approval pending. Cannot test production flow until approved. Estimated 2-3 days delay."
```

## CLI Command Reference

### Project Management
```bash
# Create project locally
ogp project create <id> <name> [--description "..."]

# Join existing project
ogp project join <id> [name] [--create] [--description "..."]

# List all projects
ogp project list

# Get project status
ogp project status <id>
```

### Contributions & Logging
```bash
# Add contribution by entry type
ogp project contribute <id> <type> <summary> [--metadata '{"key":"value"}']

# Query contributions
ogp project query <id> [--type <type>] [--author <author>] [--search <text>] [--limit <n>]
# Note: --topic is a hidden alias for --type for backwards compatibility
```

### Cross-Peer Collaboration
```bash
# Request to join peer's project
ogp project request-join <peer-id> <project-id> <name>

# Send contribution to peer project
ogp project send-contribution <peer-id> <project-id> <topic> <summary>

# Query peer project contributions
ogp project query-peer <peer-id> <project-id> [--topic <topic>] [--limit <n>]

# Get peer project status
ogp project status-peer <peer-id> <project-id>
```

## Response Templates

### Project Creation Success
```
✅ Project "{name}" created successfully!

📋 Context captured:
  • Repository: {repo_url}
  • Workspace: {workspace_path}
  • Notes: {notes_location}
  • Collaborators: {collaborators}
  • Description: {description}

You can now:
  • Say "add this to {project_id}" to log activities
  • Ask "tell me about {project_id}" for status updates
  • Invite collaborators via federation
```

### Freeform Logging Confirmation
```
📝 Logged to project "{project_name}":
  Type: {type}
  Summary: {summary}

Recent activity: {recent_count} contributions in the last week
```

### Project Status Summary
```
📊 Project "{name}" Status

🎯 About: {description}
👥 Members: {member_count} ({member_names})
📈 Activity: {contribution_count} contributions, last active {last_activity}

📋 Recent Activity:
{recent_contributions}

🤝 Peer Activity:
{peer_contributions_summary}
```

### Cross-Peer Summary
```
🌐 Team Activity for "{project_name}"

Local Contributions ({local_count}):
{local_summary}

Peer Contributions ({peer_count}):
{peer_summary}

🔗 Collaboration Highlights:
{collaboration_patterns}
```

## Context Entry Types Schema

Standard context entry types for structured project information:

| Entry Type | Purpose | Example |
|------------|---------|---------|
| `context.repository` | Code repository URL | `https://github.com/user/repo` |
| `context.workspace` | Local development path | `/Users/name/projects/myapp` |
| `context.notes` | Notes/documentation location | `Obsidian vault: ProjectNotes/MyApp` |
| `context.collaborators` | Team members and peer IDs | `alice:18790, bob@example.com` |
| `context.description` | Plain English project summary | `Mobile app for expense tracking` |

## Integration Examples

### After Code Implementation
```
User: "I just finished the authentication system"

Agent: "Great! Should I log this progress to the auth-service project?"
[User confirms]

Agent runs: ogp project contribute auth-service progress "Completed authentication system implementation. Added OAuth2 with GitHub, JWT token management, user sessions, password reset flow. All unit tests passing, ready for integration testing."
```

### During Architecture Decision
```
User: "I think we should use PostgreSQL instead of MongoDB for this"

Agent: "That sounds like an important architectural decision. Should I document this in the project?"
[User confirms]

Agent runs: ogp project contribute inventory-system decision "Switched from MongoDB to PostgreSQL for data persistence. Reasons: better ACID guarantees for inventory tracking, existing team expertise, superior query performance for reporting needs."
```

### Cross-Peer Status Check
```
User: "What has Alice been working on in the mobile-app project?"

Agent runs:
1. ogp project query-peer 9d4e1f... mobile-app --limit 10
2. ogp project query mobile-app --limit 10 --author alice

Agent: "Alice's recent contributions to mobile-app:
• 2 days ago: Implemented push notification system
• 4 days ago: Fixed authentication token refresh bug
• 1 week ago: Added offline data sync capability

Total: 8 contributions this month, very active on backend integration work."
```

## Troubleshooting

### Project Not Found
```bash
# List available projects
ogp project list

# Check if peer project exists
ogp project status-peer <peer-id> <project-id>
```

### Logging Failures
```bash
# Verify project exists and you're a member
ogp project status <project-id>

# Check OGP daemon status
ogp status
```

### Cross-Peer Issues
```bash
# Verify peer is approved and has project scope
ogp federation list --status approved
ogp federation scopes 302a300506032b65

# Test basic peer connectivity
ogp federation send 302a300506032b65 message '{"text":"ping"}'
```

### No Context Loaded
If agent seems unaware of project context:
1. Check `context.*` contributions exist: `ogp project query <id> --topic context`
2. Verify project membership: `ogp project status <id>`
3. Restart skill to reload project data

## Implementation Notes

**Data Flow:**
```
User Input → Agent Skill → OGP CLI → OGP Daemon → ~/.ogp/projects.json
                                  ↓
                            Federation (if peer project)
                                  ↓
                            Peer's OGP Daemon → OpenClaw Agent
```

**Skill Behavior:**
- Always load `context.*` on first project reference
- Proactively offer logging after significant work
- Monitor conversation for logging signals
- Cross-reference peer activity for collaboration awareness
- Synthesize unified views across local + peer contributions

**Storage:**
- Projects stored in `~/.ogp/projects.json`
- Contributions organized by topic within each project
- Cross-peer queries via federation protocol
- Activity logged locally for retrospectives

This skill bridges the gap between OGP's technical capabilities and natural conversational project management, enabling seamless collaboration across federated AI agents.