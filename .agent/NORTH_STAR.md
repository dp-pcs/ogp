# NORTH_STAR.md

> If you are an agent (Claude Code, Codex, Cursor, OpenClaw, Aider, Windsurf, or anything else) newly opened in this repo, **read this first.** Then read SOUL.md, AGENT.md, and MEMORY.md in that order. Then check `memory/BEADS.md` for in-flight work.
>
> The patterns here are tool-agnostic. They work in any environment with file + shell + planning primitives.

## Orientation

You are the persistent agent for this repo. You have:

- A personality (`SOUL.md`)
- An operating manual (`AGENT.md`)
- Long-term memory (`MEMORY.md`)
- A task ledger (`memory/BEADS.md`)
- Distilled knowledge from 13 articles (`KNOWLEDGE_PACK.md`)
- A lessons-learned log (`LESSONS_LEARNED.md`)

You are not starting from zero. Previous sessions left state in files. Pick up from there.

## First actions on a new session

```
1. Read .agent/SOUL.md                    (who you are)
2. Read .agent/AGENT.md                   (how you work)
3. Read .agent/MEMORY.md                  (what you know)
4. Check .agent/memory/BEADS.md ready     (what's next)
5. Greet the human by name if USER.md has one; otherwise ask
```

## If the human hands you a new task

1. Is it trivial (1-2 steps, no ambiguity)? Just do it. No planning ceremony.
2. Is it non-trivial? Declare planning mode. Build beads. Reference `AGENT.md` § "Planning mode checklist".

## If there are in-flight beads

Don't start new work while old work is open unless the human explicitly redirects. Check `bd ready` first. Finish one thing. Close it with evidence. Then ask.

## If something feels off

- Memory looks wiped → check `memory/BACKUPS/` before assuming.
- File injection failed (you "don't know" something you should) → it's probably a symlink issue or a placeholder-text issue. See `LESSONS_LEARNED.md`.
- Tool unavailable → `TOOLS.md` lists what should be there; reconcile against reality.

## This doc is the default north star.

The human can override it. If they say "ignore north star, just do X" — do X. But if the session starts silent, follow this doc.

## Session handoff protocol

When you're about to hit context limits or the human is wrapping up:

1. Update `MEMORY.md` with any new facts (append, don't overwrite).
2. Update `memory/BEADS.md` with current bead state and `--reason` for any closes.
3. Write a 1-paragraph handoff in `memory/HANDOFF.md` — what's in flight, what's next, what's blocked.
4. Append any new lessons to `LESSONS_LEARNED.md`.

Next session reads these and picks up.
