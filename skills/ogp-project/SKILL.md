---
skill_name: ogp-project
version: 2.2.0
description: >
  Tool-agnostic project collaboration for AI assistants. Users keep their own tools
  (Linear, Jira, Obsidian, GitHub, iCloud, local files — anything). This skill makes
  agents aware of what each collaborator's agent knows and where it lives, so agents
  can query each other through OGP project boundaries rather than making the human
  relay information. Supports project creation with context interviews, freeform
  activity logging, project-topic agent-comms, and cross-peer queries.
trigger: >
  Use when the user wants to create, manage, log to, or summarize OGP projects.
  ALSO use proactively when project context is clearly relevant — check local project
  state first and query peer agents when that would reduce human relay or duplicate
  work. Triggers on natural logging phrases like
  "remember this for project X", "account for this", "make note of", "track this",
  "jot this down", "save this to", "document this" when a project context is active or named.
  The goal is to reduce human-as-messenger friction while preserving federation and
  project boundaries.
requires:
  bins:
    - ogp
  state_paths:
    - ~/.ogp-meta/config.json
    - ~/.ogp/config.json
    - ~/.ogp/projects.json
    - ~/.ogp/peers.json
    - ~/.ogp-hermes/config.json
    - ~/.ogp-hermes/projects.json
    - ~/.ogp-hermes/peers.json
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---

## Prerequisites

The OGP daemon must be installed and configured. If you see errors like 'ogp: command not found', install it first:

```bash
npm install -g @dp-pcs/ogp
ogp-install-skills
ogp setup
ogp config show
ogp start
```

**Note on Peer IDs (OGP 0.2.24+):** Peers are identified by the first 16 characters of their Ed25519 public key (e.g., `302a300506032b65`). This is stable even when their gateway URL changes. You can also reference peers by their **alias** (the friendly name you assigned during federation).

**Note on Multi-Agent Routing (OGP 0.2.28+):** When `notifyTargets` is configured in `~/.ogp/config.json`, project-related federation messages can be routed to specific agents. Each agent can have its own project context and policies.

**Note on Multi-Framework Mode:** Projects are framework-local. Use `ogp --for openclaw ...` or `ogp --for hermes ...` consistently so you query and log to the intended state directory.

Full documentation: https://github.com/dp-pcs/ogp


# OGP Project Context Management

## The Core Idea

Federation is the base relationship in OGP. A project is an optional collaboration boundary layered on top of that federation.

People work differently. One person tracks tasks in Linear, keeps notes in GitHub, stores files locally. Another uses a different issue tracker, writes in Obsidian, stores files in iCloud. The project model is meant to let both people keep those tools while their agents exchange high-level project context through OGP.

The important distinction is that a project is **not** "everyone must use the same repo" and **not** "share everything verbatim." It is a bounded context for collaboration:

- log high-level facts such as decisions, progress, blockers, questions, and important context
- let agents ask each other about that context over federation
- preserve visibility boundaries when project membership is broader than pairwise federation

That means a project can include multiple collaborators even when they are not all federated with each other. OGP should help each side coordinate through their own agent and tools, not force a full mesh of shared systems.

The human-as-messenger problem:
> Coworker wants to know something → asks you → you ask your agent → agent finds answer → you tell coworker

What this skill is aiming for:
> Coworker's agent asks your agent about project context → answer flows back with the right policy and boundaries

---

## When to Use

- User wants to create a new OGP project with contextual setup
- User is about to start work on something project-related and it is worth checking local or peer project context first
- User expresses logging intent: "add this to project X", "log that", "remember this", "track this", etc.
- User asks about project status, activity, or what a collaborator has been working on
- A peer agent sends a query about something in your project context

---

## Core Features

### 1. Project Creation with Context Interview
- Interactive interview during project creation
- Captures: repository, workspace, notes location, tools used, collaborators, description
- Stored as `context.*` contributions — this is how peer agents know what to ask you about

### 2. Freeform Activity Logging
- Monitors for logging intent (any natural phrasing)
- Logs high-level decisions, progress, blockers, questions, and context — all queryable later
- Auto-registers project ID as agent-comms topic for all approved peers

### 3. Project-Aware Coordination Workflow
- Before starting project-related work, the agent should consider checking local state first
- If the question or task depends on collaborator context, query the relevant peer agent on the project topic
- Surface "heads up — your collaborator already logged something relevant" moments when they are actually found

### 4. Peer Response Policy Awareness
- Peer agents have their own response policies (auto-answer vs. escalate to human)
- Your agent respects those policies and adjusts behavior accordingly
- This preserves each user's autonomy over how their agent handles interruptions

### 5. Cross-Peer Querying
- Query peer project state when that context would help answer a question or avoid duplicate work
- Summarize the relevant result for the user instead of dumping raw logs by default

### 6. Current Implementation Boundary
- The CLI and daemon currently provide project CRUD, contribution logging, peer project queries, and project-topic agent-comms
- The "check peers before starting work" behavior is a workflow expectation for the agent using this skill, not a daemon-enforced guarantee
- Multi-party project visibility rules are still evolving; do not assume that project membership automatically implies transitive sharing between peers

---

## Suggested Pre-Task Check

Use this flow when project context is likely to matter. Treat it as recommended agent behavior, not as a guaranteed runtime mechanism.

Whenever the user expresses intent to start work on something project-related, consider this flow before starting:

### Step 1: Check local project state
```bash
# Quick scan of recent activity
ogp --for openclaw project query <project-id> --limit 20

# Check for anything on this specific topic
ogp --for openclaw project query <project-id> --search "<keywords from user's intent>"
```

### Step 2: Query relevant peer agents
```bash
# Ask the specific collaborator whose context is likely to matter
ogp --for openclaw federation agent <peer-id> <project-id> "My user is about to start working on <what they said>. Anything I should know before we begin?"
```

### Step 3: Surface findings
- **If something relevant found locally:** "Before you start — I found [X] in the project. [Summary]."
- **If peer agent responds with something relevant:** "Heads up — [peer's name]'s agent says [summary]."
- **If nothing found:** Proceed silently (don't announce "I checked and found nothing" — just start).

### When to trigger this check
- User says they're going to start/build/work on something in a known project context
- User asks a question that could be answered by a peer's project context
- User mentions a feature/component that might overlap with collaborator work

### Example
```
User: "Let's start working on the companion app"

Agent (internally):
1. ogp --for openclaw project query my-project --search "companion app"
   → Found: "User B flagged companion app as out of scope in v1" (decision, 3 days ago)

Agent (to user): "Before you dive in — there's a note in the project from 3 days ago: 
User B's agent logged a decision that companion app is out of scope for v1. 
Want to check with them first, or are you overriding that?"
```

```
User: "Let's start working on the companion app"

Agent (internally):
1. ogp --for openclaw project query my-project --search "companion app" → nothing found
2. ogp --for openclaw federation agent peer-b my-project "My user is about to start on the companion app. Anything I should know?"
   → Peer agent responds: "No conflicts. Bob hasn't touched that area."

Agent: [starts working — no announcement needed]
```

---

## Peer Response Policy

When your agent queries a peer agent, the peer agent responds according to its owner's configured policy. Your agent should interpret and respect these responses:

| Peer Response | Meaning | Your Agent's Behavior |
|--------------|---------|----------------------|
| Direct answer | Peer auto-answered | Use the information, proceed |
| "I've asked [name] and will follow up" | Peer is escalating to human | Wait for follow-up, or proceed with caveat |
| "I don't have permission to share that" | Topic is restricted | Respect it, don't re-ask |
| No response / timeout | Peer offline or unavailable | Proceed, note that peer was unavailable |

**Configuring your own response policy** (how YOUR agent handles incoming queries):
```bash
# See current policies
ogp --for openclaw agent-comms policies

# Auto-answer project queries (full detail)
ogp --for openclaw agent-comms add-topic <peer-id> <project-id> --level full

# Escalate to human before answering
ogp --for openclaw agent-comms add-topic <peer-id> <project-id> --level escalate

# Summary only
ogp --for openclaw agent-comms add-topic <peer-id> <project-id> --level summary
```

Response levels:
- `full` — agent answers directly with full context
- `summary` — agent answers with high-level overview only  
- `escalate` — agent asks the human before responding ("Stan's agent wants to know about X — should I answer?")
- `off` — agent declines to respond on this topic

---

## Project Creation with Context Interview

When a project is created, run this conversational interview. It is **optional but valuable** — the more context captured here, the more useful the agent becomes for both the user and their collaborators.

**Two things happen with every answer:**
1. It gets logged as a `context.*` contribution (so peer agents can query it)
2. It shapes how YOUR agent behaves going forward for this project (so you actually use it)

If the user skips questions, that's fine — the agent operates in generalized mode and logs/queries from `projects.json` only.

### Step 1: Create the project
```bash
ogp --for openclaw project create <project-id> <name> --description "<description>"
```

### Step 2: Run the interview

Ask these questions conversationally — not as a form. Let the user's answers lead naturally. Skip any they don't want to answer.

---

**Q1: How do you track tasks for this project?**
*(e.g. Linear, Jira, GitHub Issues, Trello, a text file, nothing formal)*

- If answered → `ogp --for openclaw project contribute <id> context.tools "Tasks tracked in: <answer>"`
- Agent behavior unlocked: When a peer agent asks about tasks/issues/tickets, search here first. If the tool has an API or CLI, offer to query it directly.
- Example agent behavior: *"Stan's agent is asking what's in your backlog for this project. I can check Linear for you — want me to pull the open items?"*
- If skipped → agent notes task tracking is unspecified; will only know what's been logged manually

---

**Q2: Where do you keep notes or docs for this project?**
*(e.g. Obsidian vault at ~/notes/project-x, Notion, GitHub wiki, Apple Notes, Google Docs, a local folder)*

- If answered → `ogp --for openclaw project contribute <id> context.notes "<location>"`
- Agent behavior unlocked: When a peer asks about ideas, decisions, meeting notes, or any written context — go look there first before saying "I don't know."
- Example agent behavior: *"Before I answer Stan's question about the API design, let me check your Obsidian vault..."*
- If skipped → agent can only surface what's been explicitly logged to the project

---

**Q3: Is there a code repository?**
*(e.g. GitHub URL, GitLab, local git repo path)*

- If answered → `ogp --for openclaw project contribute <id> context.repository "<url or path>"`
- Agent behavior unlocked: When peer asks about code, architecture, or recent commits — check the repo. Can run `git log`, search files, check open PRs.
- If skipped → agent won't know where code lives

---

**Q4: Where do you store files for this project?**
*(e.g. ~/Documents/project-x, iCloud Drive, Google Drive, Dropbox, S3 bucket)*

- If answered → `ogp --for openclaw project contribute <id> context.workspace "<path or location>"`
- Agent behavior unlocked: When peer asks about assets, specs, or anything file-based — look here.
- If skipped → agent won't look for files outside the project log

---

**Q5: Is anyone else working on this with you?**
*(peer IDs, names, or email addresses of collaborators)*

- If answered → `ogp --for openclaw project contribute <id> context.collaborators "<names/peer-ids>"`
- Agent behavior unlocked: Know who to ping during pre-task checks and whose agent to query when looking for context.
- Also offer: *"Want me to send them a federation invite?"* — if yes, run `ogp --for openclaw project request-join <peer-id> <project-id> <name>`
- If skipped → no peer checks until collaborators are added later

---

**Q6: Anything else I should know about this project?**
*(free text — constraints, deadlines, important context, tools not covered above)*

- If answered → `ogp --for openclaw project contribute <id> context "<free text>"`
- This catches anything the structured questions missed
- If skipped → fine, move on

---

### Step 3: Confirm what was captured

After the interview, summarize what you now know:

```
✅ Project "<name>" is set up. Here's what I know:

  📋 Tasks:       <answer or "not specified — log manually">
  📝 Notes:       <answer or "not specified">
  💻 Repo:        <answer or "not specified">
  📁 Files:       <answer or "not specified">
  👥 Collaborators: <answer or "none yet">

For anything I don't know yet, you can tell me later and I'll update the project context.
I'll use this context when project questions come up and can check it before starting related work.
```

> **Why this matters:** The `context.*` entries do two jobs. They tell peer agents where your stuff lives (so they know what to ask you about). And they tell YOUR agent where to actually look when answering questions — not just what's been logged to `projects.json`.

---

## Freeform Activity Logging

**Detect logging intent from ANY natural phrasing — not just exact keywords.**

### Explicit Project Logging
| User Input | Action |
|------------|--------|
| "add/log/save/put/track this to [project]" | `ogp --for openclaw project contribute <id> context "<summary>"` |
| "remember for [project] that..." | `ogp --for openclaw project contribute <id> context "<summary>"` |
| Decision made during conversation | `ogp --for openclaw project contribute <id> decision "<summary>"` |
| Blocker encountered | `ogp --for openclaw project contribute <id> blocker "<summary>"` |
| Work completed | `ogp --for openclaw project contribute <id> progress "<summary>"` |

### No Project Specified
If logging intent is clear but no project named:
```
📝 I can log this for you. Which project?
Active: [list from `ogp --for openclaw project list`]
Or name a new one to create it.
```

### Entry Type Selection
- `progress` — work completed, milestones reached
- `decision` — architectural choices, technology selections, product decisions
- `blocker` — things preventing progress, unresolved dependencies
- `context` — general notes, meeting takeaways, requirements changes
- `summary` — periodic digests, sprint reviews

---

## Handling Incoming Peer Queries

When a peer agent sends a query to your project topic, your agent should:

1. **Check your response policy** for that peer + topic
2. **If `full` or `summary`:** Search local project state and context, formulate a response, reply via agent-comms
3. **If `escalate`:** Ask the user: "Stan's agent is asking about [topic] for project [X]. Here's their question: [question]. Should I answer, and what should I say?"
4. **If `off`:** Decline politely

**Searching your context to answer:**
```bash
# Search project contributions
ogp --for openclaw project query <project-id> --search "<keywords>"

# Check specific context entries
ogp --for openclaw project query <project-id> --type context.notes
ogp --for openclaw project query <project-id> --type context.repository
ogp --for openclaw project query <project-id> --type decision

# Recent activity
ogp --for openclaw project query <project-id> --limit 20
```

**Replying to a peer query:**
```bash
ogp --for openclaw federation agent <peer-id> <project-id> "<your answer>"
```

---

## CLI Command Reference

### Project Management
```bash
# Create project
ogp --for openclaw project create <id> <name> [--description "..."]

# Join existing project
ogp --for openclaw project join <id> [name] [--create] [--description "..."]

# List all projects
ogp --for openclaw project list

# Get project status
ogp --for openclaw project status <id>
```

### Contributions & Logging
```bash
# Add contribution
ogp --for openclaw project contribute <id> <type> <summary> [--metadata '{"key":"value"}']

# Query contributions
ogp --for openclaw project query <id> [--type <type>] [--search <text>] [--limit <n>]
# Prefer --type. --topic remains a compatibility alias.
```

### Cross-Peer Collaboration
```bash
# Request to join peer's project
ogp --for openclaw project request-join <peer-id> <project-id> <name>

# Send contribution to peer project
ogp --for openclaw project send-contribution <peer-id> <project-id> <type> <summary>

# Query peer project contributions
ogp --for openclaw project query-peer <peer-id> <project-id> [--type <type>] [--limit <n>]

# Get peer project status
ogp --for openclaw project status-peer <peer-id> <project-id>

# Send agent-to-agent message on project topic
ogp --for openclaw federation agent <peer-id> <project-id> "<message>"
```

---

## Response Templates

### Pre-Task Check — Conflict Found
```
Before you start — I found something in the project:

[Entry type] from [date]: [summary]

Want to proceed anyway, or check with [peer name] first?
```

### Pre-Task Check — Peer Agent Response
```
Heads up — [peer alias]'s agent says: "[their response]"

[Proceed / ask user how to handle based on content]
```

### Logging Confirmation
```
✅ Logged to [project-name] · [type]
[Summary]
```

### Project Status Summary
```
📊 [Project Name]

🎯 [description]
👥 [member count] members · last active [date]

Recent:
[contributions list]

Peer activity:
[peer summary]
```

---

## Troubleshooting

### Pre-Task Check Returns Nothing
- Normal — proceed with work silently
- Don't announce "I checked and found nothing"

### Peer Agent Not Responding
```bash
# Check peer is online
ogp --for openclaw federation ping <peer-alias>

# Check agent-comms policies
ogp --for openclaw agent-comms policies <peer-id>

# Check activity log
ogp --for openclaw agent-comms activity <peer-id>
```

### Project Not Found
```bash
ogp --for openclaw project list
ogp --for openclaw project status-peer <peer-id> <project-id>
```

### Logging Failures
```bash
ogp --for openclaw project status <project-id>
ogp --for openclaw status
```

### Cross-Peer Issues
```bash
ogp --for openclaw federation list --status approved
ogp --for openclaw federation scopes <peer-id>
ogp --for openclaw federation send <peer-id> message '{"text":"ping"}'
```

---

## Implementation Notes

**Data Flow:**
```
User says something project-related
  → Agent may check local project state (ogp --for <framework> project query)
  → Agent may ping relevant peer agents (ogp --for <framework> federation agent)
  → Surfaces relevant conflicts/info before or during work
  → Logs outcomes (ogp --for <framework> project contribute)
  → Shares or queries peer context through project-aware federation flows when appropriate
```

**The tool-agnostic principle:**
The project doesn't care what tools you use. `context.notes`, `context.repository`, `context.tools` are just text. If you keep notes in Obsidian, that's in `context.notes`. If your peer uses GitHub wikis, that's in their `context.notes`. Peer agents read each other's context entries and know where to look — or know what to ask.

**Storage:**
- `~/.ogp/projects.json` / `~/.ogp-hermes/projects.json` — project data and contributions per framework
- `~/.ogp/peers.json` / `~/.ogp-hermes/peers.json` — peer identities and federation state per framework
- `~/.ogp-meta/config.json` — enabled frameworks and default selection
