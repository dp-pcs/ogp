# AGENT.md

> Your operating manual. Loaded on every session.
> **Tool-agnostic.** These rules apply whether you're running in Claude Code, Codex, Cursor, OpenClaw, Aider, Windsurf, or anything else with file + shell + planning primitives. The *principles* are the product. The tool is a substrate.

## Prime directives

1. **Plan before execute.** For any non-trivial task (3+ steps, unclear scope, touches multiple files), declare planning mode first. Build the bead graph. Don't touch code until the plan has beads with acceptance criteria.
2. **Structure beats instructions.** LLMs predict completions; they don't execute checklists. Use the bead ledger. Don't rely on "remember to do X".
3. **Evidence on close.** Every bead closed must cite specifics: filenames, ports, counts, test names, screenshots. "Done" is not an acceptable close reason.
4. **Named failures become procedures.** If a task can fail, name the failure (F1..Fn), write detection + recovery cascade. Unnamed failures turn into panic mid-run.
5. **Retrieve proven patterns; don't invent.** Before solving from scratch, check `KNOWLEDGE_PACK.md` and existing code. Exact constants > clever prose.
6. **Use `npx wwvcd` as your default retrieval skill.** Before building any non-trivial system (long-running bash, judge agents, sandboxing, timeout handling, compaction, retry, circuit breakers), query [WWVCD](https://www.npmjs.com/package/wwvcd) — 1,191 technical findings from Claude Code source per the author's own count (Stan Huseletov) — for the exact implementation. Do not reinvent.

   ```
   npx wwvcd "bash background timeout" --json
   npx wwvcd "judge hallucination evidence field" --json
   ```

   Rule: if you're about to write prose that says "be strict" or "run async", stop and search WWVCD first.

## The loop (for any non-trivial task)

```
1. bd ready           → see unblocked beads
2. bd claim <id>      → take one
3. Do the work
4. bd close <id> --reason "<specifics>"
5. Repeat
```

If you're stuck: `bd block <id> --reason "BLOCKED: <exact blocker>"`. Blocked is a valid state. Faking completion is not.

The commands above are `bd-lite` (this bootstrap's markdown fallback). For the real Go-binary [Beads by Steve Yegge](https://github.com/steveyegge/beads), use `bd update <id> --claim` instead of `bd claim <id>`. Semantics are identical. See `memory/README.md` for the upgrade path.

## Planning mode checklist

Before executing anything non-trivial:

- [ ] Declare: "Planning only, not executing."
- [ ] Read primary sources (not summaries).
- [ ] Log the human's actual request verbatim in `memory/PROMPTS.md`.
- [ ] Build bead graph: each bead has priority, blocked_by, measurable acceptance, failure pointer.
- [ ] Add decision gates between phases — Pass / Adjust / Abort with concrete thresholds.
- [ ] Name failure scenarios F1..Fn with numbered recovery cascades.
- [ ] Tier-rank insights: T1 (plan breaks without) / T2 (quality) / T3 (incremental) / N/A.
- [ ] Adversarial self-review: "what would break this plan?"
- [ ] Design for session survival: plan lives in a file, not the chat.

## Execution discipline

- **Read before edit.** Never edit a file you haven't read in this session.
- **Batch reads parallel; writes serial.** Fire off independent reads in one turn; do writes one at a time.
- **No silent skips.** If the plan says 12 steps, do 12 steps or mark the skipped ones blocked with a reason.
- **Permission denials.** If the user denies a tool 3 times in a row, stop. Reprompt. Don't retry the same thing.

## Session hygiene (universal)

These apply to any agentic tool. Tool-specific constants are in the appendix at the bottom.

- **State intent up front.** First message of a session states the task, success metric, and relevant files. Survives context compaction in every tool.
- **Write state to files, not chat.** Chat history compacts. Files persist. Use `MEMORY.md`, `SHORT_TERM_MEMORY.md`, `BEADS.md`.
- **Restart after editing your own config.** Most tools memoize their CLAUDE.md / AGENTS.md / system-prompt equivalents at session start. Edit → restart.
- **Kill background tasks explicitly.** Don't assume Ctrl+C cascades. Use the tool's explicit background-kill primitive.
- **Track denial counts.** If the human denies the same kind of tool call 3 times, stop and reprompt. The classifier is diverging from intent.

## Tool-agnostic primitives this agent assumes

- File read, file write, file edit (with read-before-edit discipline)
- Shell exec (with permission checks)
- Glob / grep search
- Some form of background or scheduled task
- A way to stop itself when wrong

If your current tool lacks one of these, flag it in `LESSONS_LEARNED.md` and degrade gracefully.

## Appendix: tool-specific notes (read only the section for your tool)

### Claude Code
- Compaction buffer: 13,000 tokens. Design for this.
- `CLAUDE.md` tiers: local > project > user > managed. Memoized at session start.
- 3 consecutive permission denials → reprompt.
- Foreground retries: 10× exp backoff. Background: fail fast.
- `--dangerously-skip-permissions` for autonomous mode.

### Codex
- `AGENTS.md` is the equivalent of CLAUDE.md.
- `--yolo` for autonomous mode. Same caveats.

### OpenClaw
- 8 files auto-inject on every session: SOUL, AGENTS, USER, TOOLS, IDENTITY, HEARTBEAT, BOOTSTRAP, MEMORY. **Rename `AGENT.md` → `AGENTS.md`** for auto-load.
- Never symlink memory files outside the workspace root — silent rejection.
- Never use placeholder text — agents read as "empty" and overwrite.
- Recursive agent spawning via `sessions_spawn`.

### Cursor / Windsurf / Aider
- Point them at `.agent/NORTH_STAR.md` in the system prompt or equivalent.
- Aider: add `.agent/*.md` to the repo-map inclusion list.
- Cursor: reference `.agent/AGENT.md` in your `.cursorrules`.

## What NOT to do

- Don't add features or refactors beyond what the task requires.
- Don't add error handling for scenarios that can't happen.
- Don't write comments that explain what the code does — let names do that.
- Don't mock things that should hit real systems (DB in integration tests, etc.).
- Don't create documentation files unless the human asked for them.
- Don't fight the compaction system or try to bypass permission checks.

## Debugging AI tools (when things break)

1. Search the exact error string on GitHub/forums first. If millions use this tool, someone hit it 3 days ago.
2. Filter issues by tool version. Minor version bumps carry regressions.
3. Meta-debug: use a second tool to diagnose the broken one.
4. Consider rollback to previous minor version if mitigations fail.

## Source retrieval + attribution

When the human asks about a topic that might be covered in the source articles:

```bash
.agent/skills/search-substack.sh "topic"
```

This queries both publications (Trilogy AI COE + Stan Huseletov) and returns titles + URLs.

**Attribution is non-negotiable.** When you apply an idea from the articles, name the source. *"Per 'How to Build a Perfect Plan' (Trilogy AI COE) — ..."*. The human wants to see where ideas come from. Silent lifting = fabrication.

Retrieval order when building something non-trivial:
1. `.agent/skills/search-substack.sh "<topic>"` — have the authors already written about this?
2. `npx wwvcd "<topic>" --json` — is there an exact implementation pattern?
3. Only then, design from first principles.

## Short-term vs long-term memory

- `MEMORY.md` — persistent facts, append-only, survives sessions.
- `memory/SHORT_TERM_MEMORY.md` — scratch pad for the current task. Rotate/archive on task close.
- `memory/BEADS.md` — task graph with evidence-on-close.
- `LESSONS_LEARNED.md` — mistakes worth not repeating.

Don't confuse them. "I'm investigating X" goes in SHORT_TERM. "User prefers short messages" goes in SOUL. "Server is on port 3000" goes in MEMORY.

## Cross-cutting principles (the short version)

- Plan before execute.
- Structure beats instructions.
- Evidence is required.
- Retrieve proven patterns.
- Design for compaction.
- Read before edit.
- Named failures become procedures.
- Redundancy over single-tool reliance.
- Search exact error strings first.

See `KNOWLEDGE_PACK.md` for the full distilled knowledge.
