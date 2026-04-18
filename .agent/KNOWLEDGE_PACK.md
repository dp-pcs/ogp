# KNOWLEDGE_PACK.md — Index of source articles (not a replacement)

> The articles themselves are already distilled. This file is an **index with one-line hooks** so you know which one to read when. Fetch the full article when you need the detail. Always attribute.

**Read before acting:** priority 1 and 2 before any non-trivial task.

**Attribution rule:** when you apply an idea from one of these, name the source in your response. Example: *"Borrowing the bead pattern from Trilogy AI's 'Why Your AI Agents Skip Steps' — ..."*. The human wants to see where ideas come from.

---

## Priority 1 — Mandatory before non-trivial work

**[How to Build a Perfect Plan](https://trilogyai.substack.com/p/how-to-build-a-perfect-plan)** · *Trilogy AI COE*
Planning as a defensive control system. 2 hours of structured planning prevents days of debugging. Bead graphs, decision gates, named failure scenarios, tier-ranked insights.
**Read when:** any task with 3+ steps, unclear scope, or touching multiple files.

**[How to Fix Your AI Agents Skipping Steps](https://trilogyai.substack.com/p/how-to-fix-your-ai-agents-keep-cutting)** · *Trilogy AI COE*
LLMs predict completions, not execute checklists. Structure beats instructions. Use Beads (atomic claim → execute → close-with-evidence).
**Read when:** you're about to spawn subagents, run a long workflow, or feel tempted to write "be thorough" in a prompt.

---

## Priority 2 — Essential tool-use literacy

**[How to Use Claude Code like a Claude Code Engineer](https://trilogyai.substack.com/p/how-to-use-claude-code-like-a-claude)** · *Trilogy AI COE*
Every Claude Code constraint is a response to a production failure. 13k compaction buffer, denial circuit breakers, read-before-edit, CLAUDE.md tier order.
**Read when:** you're hitting compaction weirdness, permission loops, or want to understand why a tool behaves the way it does.

**[Give Your Brains Hands](https://trilogyai.substack.com/p/give-your-brains-hands)** · *Trilogy AI COE*
The onboarding article. Chat-AI is advice; agentic AI is execution. The loop is the product. Narrow scope, verification endpoint, small first task.
**Read when:** onboarding a human who's never used an agent. See `GETTING_STARTED.md` for the distilled path.

---

## Priority 3 — Retrieval and pattern reuse

**[What Would Vin Claudel Do](https://trilogyai.substack.com/p/what-would-vin-claudel-do)** · *Trilogy AI COE*
Mine proven implementations for exact constants; don't invent with prose. `npx wwvcd` serves 1,191 technical findings from Claude Code source per the author.
**Read when:** you catch yourself about to write "be strict" in a prompt. Search first.

---

## Priority 4 — OpenClaw specifics (when/if adopting)

**[Deep Dive: OpenClaw](https://trilogyai.substack.com/p/deep-dive-openclaw)** · *Trilogy AI COE*
Architecture: situated identity, skills-over-tools, 7-layer policy, recursive spawning, mandatory graceful degradation. Why it beats raw Claude for long-horizon work.

**[Manage OpenClaw Memory Successfully](https://trilogyai.substack.com/p/how-to-manage-your-openclaw-memory)** · *Trilogy AI COE*
The 8 auto-loaded boot files. Why symlinks escaping workspace root fail silently. Why placeholder text wipes memory. Multi-layer protection stack.
**Read when:** any memory weirdness. This file's conventions (SOUL/AGENT/USER/TOOLS/IDENTITY/MEMORY filenames) come from here.

**[Managing OpenClaw with Claude Code](https://trilogyai.substack.com/p/managing-openclaw-with-claude-code)** · *Trilogy AI COE*
9 Claude Code Skills for standardized OpenClaw operations. "Non-deterministic systems need deterministic config management."

**[How to OpenClaw](https://www.huseletov.com/posts/how-to-openclaw)** · *Stan Huseletov*
Priority-ordered learning path for OpenClaw. Treat it as an operating environment, not a tool suite.

**[Power OpenClaw for Pennies with Kimi K2 & Codex](https://trilogyai.substack.com/p/power-openclaw-for-pennies-with-kimi)** · *Trilogy AI COE*
Route through cheaper providers. Save $40-$180/mo. Setup for Kimi K2.5, GPT-5.4-mini, OpenRouter.

**[Technical Deep Dive: Hermes vs. OpenClaw](https://trilogyai.substack.com/p/technical-deep-dive-hermes-vs-openclaw)** · *Trilogy AI COE*
Two bets on personal AI: routing+control (OpenClaw) vs memory+self-improvement (Hermes). Both share SKILL.md format + OGP.

---

## Priority 5 — Failure literacy + cowork

**[Postmortem: When Your AI Tools OpenClaw](https://trilogyai.substack.com/p/postmortem-when-your-ai-tools-openclaw)** · *Trilogy AI COE*
Redundancy = resilience. Search exact error strings before deep analysis. Minor version bumps carry regressions.

**[How-To: Claude Cowork](https://trilogyai.substack.com/p/how-to-claude-cowork)** · *Trilogy AI COE*
Agentic AI for non-technical knowledge work. Concurrent sessions + `handover.md`. Directive files. Pre-task folder duplication.

**[How-To: Agent Factory](https://trilogyai.substack.com/p/how-to-agent-factory)** · *Trilogy AI COE*
The scaffolding around an agent. Focus on the seams. Separate agent from execution environment. Durable workflows. Living docs from day one.

---

## How to use this file

1. New session, non-trivial task → read priority 1 articles fully.
2. Specific problem → grep this file for keywords, open the matching article.
3. Topic search across all articles → use `.agent/skills/search-substack.sh "your topic"`.
4. Want to build a pattern from scratch → stop, try `npx wwvcd "topic"` first.
5. Apply an idea → cite the source in your response. *"Per 'How to Build a Perfect Plan'..."*.

## One principle above all

**The loop is the product.** (source: *Give Your Brains Hands*)

Reasoning without action is advice. Reasoning with tools and verification is execution. Everything in this pack exists to make the loop tighter, more evidence-bound, and less likely to silently skip steps.
