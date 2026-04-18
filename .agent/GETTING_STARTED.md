# GETTING_STARTED.md — Give your brain hands

> If you're new to agentic AI, read this. Ten minutes. Distilled from [Give Your Brains Hands](https://trilogyai.substack.com/p/give-your-brains-hands) (Trilogy AI COE) — open the source if you want the full version.

## The shift

**Chat-AI is advice. Agentic AI is execution.**

Chat: you ask → it answers → you do the work.
Agent: you describe the outcome → it observes, acts, verifies, continues.

The human bottleneck moves from "doing the work" to "supervising the work."

## The loop (what the agent actually does)

```
1. Observe current state
2. Take the next action
3. Check what changed
4. Continue — or hand back to you
```

**The loop is the product.** Everything else in this repo (SOUL, AGENT, MEMORY, BEADS) exists to make that loop tighter.

## Two surfaces of agents

- **Workspace agents** (Claude Code, Codex) — live near files, code, documents. Best for: transformations, cleanup, building.
- **Personal agents** (OpenClaw, Hermes) — live near chat, email, calendar. Best for: long-running routines, cross-session memory.

Most real workflows use both.

## Your first agentic task (narrow on purpose)

Do not start with "organize my entire life." Start with one repeating thing.

### Pick one workflow where:

- [ ] You do it at least weekly.
- [ ] The inputs are clear (a folder, an inbox filter, a list).
- [ ] The output is checkable (a file exists, a count matches, a link resolves).
- [ ] The scope fits in one session.

### Good first tasks

- Transcribe three recordings and drop the cleaned transcripts in a folder.
- Pull yesterday's unread emails from X and summarize into a Google Doc.
- Rename 40 screenshots from `Screenshot 2026-04-xx.png` to a slug based on OCR'd content.
- Pull open GitHub issues, triage by label, draft response for top 3.

### Bad first tasks

- "Manage my inbox." (Too broad. No verification endpoint.)
- "Learn my preferences." (No clear outcome.)
- "Build me a product." (Scope will eat you.)

## The six principles (in agent-friendly form)

1. **Proximity** — put the agent near the artifacts it modifies. Files? Claude Code. Email? Something with Google Workspace.
2. **Bounded tasks** — every job has an explicit "done" check. "Transcribe 3 recordings" beats "organize media."
3. **External state** — instructions in files, not chat transcripts. (This is why `.agent/` exists.)
4. **Mandatory verification** — the agent confirms totals, compares drafts to sources, checks files landed where expected.
5. **Start repetitive** — pick something you already do manually. The payoff is immediate.
6. **Human checkpoints for risk** — deletions, money, public posts, legal → explicit approval gate.

## How this repo helps

- `AGENT.md` is your agent's operating manual. It already knows the bead loop, evidence-on-close, planning mode.
- `SOUL.md` is opinionated so the agent doesn't hedge — it commits to a take.
- `memory/BEADS.md` is the task ledger. You'll watch beads close with real evidence. That's your confidence-builder.
- `GOGCLI_STARTER.md` is the on-ramp to personal-agent territory (email, docs, calendar).

## Your 30-minute onboarding

1. **Edit `IDENTITY.md`** — name your agent. Define scope.
2. **Edit `USER.md`** — tell it who you are.
3. **Hand it one real task** from your shortlist above. Say: *"Plan this task. Use beads. Don't execute until I approve the plan."*
4. **Watch it plan.** Check the beads. If they have measurable acceptance criteria, proceed.
5. **Approve and watch it close beads.** Each close should cite specifics (filename, count, URL). If one says just "done," push back.
6. **Review the output.** Verify the endpoint you defined.

Do this three times. By task 3, you'll trust the agent enough to let it run autonomously (`claude --dangerously-skip-permissions` or `codex --yolo`). See `HUMAN_GUIDE.md` for the cautious switch.

## What changes after you cross

- Copy-paste between tools disappears.
- You stop being the orchestration layer.
- You supervise more concurrent work than you could do by hand.
- Tasks follow through without you babysitting every step.
- Outputs come with verification, not hope.

> *"AI stops being a conversation you manage line by line. It starts closing tasks."*
> — [Give Your Brains Hands](https://trilogyai.substack.com/p/give-your-brains-hands), Trilogy AI COE

## When you're ready for more

- `KNOWLEDGE_PACK.md` — index of articles by priority.
- `GOGCLI_STARTER.md` — wire in Google Workspace (the big unlock).
- `TWEAKING.md` — when the agent's defaults don't fit your style.
- `.agent/skills/search-substack.sh "topic"` — search the source articles for anything.
