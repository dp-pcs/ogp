# HUMAN_GUIDE.md — Read me first

This repo now has an agent. Not a chat session — an **agent** with persistent memory, a personality, and a task ledger.

## What just got installed

```
.agent/
├── SOUL.md              your agent's personality (opinionated, brief, no corporate fluff)
├── AGENT.md             your agent's operating manual
├── IDENTITY.md          what this agent is for (edit me)
├── USER.md              who you are, how you like to work (edit me)
├── TOOLS.md             which tools are expected
├── MEMORY.md            persistent facts
├── NORTH_STAR.md        the doc every future session reads on open
├── HUMAN_GUIDE.md       this file
├── TWEAKING.md          how to change the agent's behavior
├── KNOWLEDGE_PACK.md    distilled knowledge from 13 articles on agentic dev
├── LESSONS_LEARNED.md   running log of mistakes the agent learned from
├── GOGCLI_STARTER.md    next step: wire in Google Workspace via gogcli.sh
└── memory/
    ├── BEADS.md         the bead graph (your agent's to-do ledger with evidence-required close)
    ├── README.md        how beads work
    ├── PROMPTS.md       verbatim log of your instructions
    ├── HANDOFF.md       written at end of each session for the next one
    └── bd-lite.sh       CLI helpers: ready, claim, close, block
```

## How to use it

**Open your agentic coding tool in this repo** — Claude Code, Codex, Cursor, OpenClaw, Aider, Windsurf, or whatever you use. This bootstrap is tool-agnostic; it works with anything that can read files and run shell commands.

Then point the agent at the north star:

> "Read .agent/NORTH_STAR.md to orient, then ask me what I need."

That's it. The agent now has memory across sessions, opinions, and a working task system.

### Tool-specific hookup (one-time)

- **Claude Code / Codex:** may auto-read AGENT.md or CLAUDE.md/AGENTS.md. If not, paste the line above.
- **Cursor:** reference `.agent/AGENT.md` from your `.cursorrules`.
- **Aider:** add `.agent/**/*.md` to the repo-map inclusion list.
- **OpenClaw:** rename `.agent/AGENT.md` → `.agent/AGENTS.md` (OpenClaw auto-loads that filename).
- **Anything else:** paste the NORTH_STAR line at session start.

## What to do first

1. **Edit `USER.md`** — tell the agent your name, role, and how you like to be communicated with.
2. **Edit `IDENTITY.md`** — give this agent a name and a purpose tied to this repo.
3. **Give it one real task** — let it plan, use beads, and work through it. Watch how it closes beads with evidence.

## The personality is opinionated by default

Your agent won't hedge. It won't say "great question." It will call you out if you're about to do something dumb. It can swear if the moment calls for it. If you hate this, see `TWEAKING.md` — you can dial it back.

## How the memory works

- **Facts and events** → `MEMORY.md` (append, never overwrite)
- **Behavior changes** ("stop doing X", "be shorter") → the agent edits `SOUL.md` or `AGENT.md`
- **Task state** → `memory/BEADS.md` (bead ledger with evidence-required close)
- **Mistakes** → `LESSONS_LEARNED.md`

You can read any of these files directly. Nothing is hidden.

## The bead system (why your agent won't cut corners)

When you give it a real task, the agent:

1. Decomposes into beads (atomic tasks with dependencies).
2. Claims one, works, closes with evidence ("Dev server on :3000, test passes, commit abc123").
3. Repeats until the graph is drained.
4. Can't silently skip — closing requires a reason string with specifics.

This is how good agents avoid the classic failure mode where they say "setup complete" after doing 3 of 12 steps.

## What to do if it goes sideways

- **Agent sounds corporate** → edit `SOUL.md`, re-emphasize the 8 vibe rules.
- **Agent forgets things** → check `MEMORY.md` isn't empty, check no placeholder text, check `BEADS.md` wasn't wiped.
- **Agent fabricates** → require evidence in its responses. The anti-shortcut patterns in `KNOWLEDGE_PACK.md` address this.
- **Agent over-plans** → tell it "trivial task, just do it" for small things.

## Running the agent autonomously (careful)

Once you trust the setup, you can let the agent run without permission prompts:

- **Claude Code:** `claude --dangerously-skip-permissions`
- **Codex:** `codex --yolo`
- **Aider:** `aider --yes`
- **Cursor / Windsurf:** agent mode with auto-approve enabled in settings

All skip per-tool approval. Powerful — the agent can drain a bead graph overnight while you sleep. Also risky — the agent can delete things, push code, send messages. Use this when:

- The repo is under version control (you can `git reset`).
- The task is well-specified with acceptance criteria in the bead graph.
- You've set up backups (`.agent/memory/BACKUPS/`).

Don't use this on the first day. Build trust first — watch the agent drain a few bead graphs with your thumb on the approval button. Once you see it closes with real evidence, not lies, flip to autonomous.

Rule of thumb: autonomous mode + bead graph with acceptance criteria + git = safe. Autonomous mode + vague request = chaos.

## Next step after onboarding

See `GOGCLI_STARTER.md`. That's how you get the agent reading your email, docs, and calendar — which is where it goes from useful to transformative.

## One more thing

This is open to tweaking. `TWEAKING.md` shows exactly how to change personality, rules, and behavior. The agent can modify its own files when you ask. Start conservative, adjust as you learn what you need.
