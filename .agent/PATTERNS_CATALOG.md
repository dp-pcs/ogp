# PATTERNS_CATALOG.md — The COE methodology, extracted

> Every pattern, heuristic, rule, and constant extracted from the source articles. Grouped by article, each with a one-sentence description and attribution. This is the agent's reading list and its working memory.
>
> **How to use this:** the bead graph (`memory/BEADS.md`) is seeded with pattern-absorption tasks that reference patterns below by ID. The agent reads the source article, internalizes the pattern, applies it, and closes the bead with evidence. On first session the agent surfaces unabsorbed patterns as new beads.
>
> **Attribution is mandatory.** When the agent uses a pattern in a response, it cites the source. *"Applying P-PLAN-03 from 'How to Build a Perfect Plan' (Trilogy AI COE)..."*

---

## How to read this file

Pattern IDs: `P-<ARTICLE>-<NN>`. First section prefix = article:

- `P-PLAN-*` — How to Build a Perfect Plan
- `P-CUT-*` — How to Fix Your AI Agents Skipping Steps (anti-shortcut)
- `P-CC-*` — How to Use Claude Code like a Claude Code Engineer
- `P-WWVCD-*` — What Would Vin Claudel Do
- `P-POST-*` — Postmortem: When Your AI Tools OpenClaw
- `P-MEM-*` — How to Manage Your OpenClaw Memory
- `P-OC-*` — Deep Dive: OpenClaw
- `P-OCPRIMER-*` — How to OpenClaw (Stan)
- `P-OCCC-*` — Managing OpenClaw with Claude Code
- `P-COWORK-*` — How-To: Claude Cowork
- `P-KIMI-*` — Power OpenClaw for Pennies
- `P-FACTORY-*` — How-To: Agent Factory
- `P-HERMES-*` — Hermes vs. OpenClaw
- `P-HANDS-*` — Give Your Brains Hands

---

## How to Build a Perfect Plan · [source](https://trilogyai.substack.com/p/how-to-build-a-perfect-plan)

- **P-PLAN-01** — Declare planning mode explicitly before any non-trivial work ("do not execute, we are only planning").
- **P-PLAN-02** — Feed the planner primary sources (articles, repos, documentation), not your own summaries.
- **P-PLAN-03** — Maintain a verbatim prompt log (`memory/PROMPTS.md`); audit for drift before finalizing any plan.
- **P-PLAN-04** — Build a bead graph; every bead has priority (P0/P1/P2), blocked_by, measurable acceptance criteria, failure pointer.
- **P-PLAN-05** — Differentiate good vs bad beads: "Prepare training data" is bad; "Generate JSONL with 80% pass rate on held-out eval" is good.
- **P-PLAN-06** — Insert decision gates between phases: Pass / Adjust / Abort tables with concrete thresholds ("p95 < 4096").
- **P-PLAN-07** — Name failure scenarios F1..Fn: ID + detection mechanism + numbered recovery cascade ordered by cost.
- **P-PLAN-08** — Tier-rank all insights: T1 (plan fails without) / T2 (quality impact) / T3 (incremental) / N/A (out of scope).
- **P-PLAN-09** — Use tiered ranking to resolve conflicts when two options collide.
- **P-PLAN-10** — Send the completed plan to an adversarial reviewer (another instance or colleague) before executing.
- **P-PLAN-11** — Design for session survival: plan lives in files, not chat; state current bead explicitly at every action.
- **P-PLAN-12** — Use subagents for heavy processing rather than keeping large datasets in main context.
- **P-PLAN-13** — Bad plans jump to execution without requirements clarification — refuse.
- **P-PLAN-14** — Vague acceptance criteria ("looks good") are not acceptance criteria.
- **P-PLAN-15** — Linear task lists without dependencies enable premature step-skipping; enforce the graph.
- **P-PLAN-16** — Monolithic beads obscure which sub-step broke; split.

## How to Fix Your AI Agents Skipping Steps · [source](https://trilogyai.substack.com/p/how-to-fix-your-ai-agents-keep-cutting)

*Note: the "Beads" tool cited throughout this article is [Steve Yegge's Beads](https://github.com/steveyegge/beads) — a Go CLI built on Dolt. This bootstrap's `bd-lite.sh` is a markdown-file fallback that preserves Yegge's claim-execute-close-with-evidence semantics.*


- **P-CUT-01** — Internalize: LLMs predict completions, they don't execute checklists. Solution is architectural, not prompting.
- **P-CUT-02** — Completion-prediction failure: plausible stopping point feels like valid completion.
- **P-CUT-03** — Attention-decay failure: later steps in long prompts compete for attention and lose.
- **P-CUT-04** — Plausibility-heuristic failure: "installed, built, verified — complete!" feels coherent even if incomplete.
- **P-CUT-05** — Satisficing failure: a 3-step solution is cheaper and plausible than a 12-step one.
- **P-CUT-06** — Cognitive-load failure: complex tasks exhaust reasoning capacity on the immediate problem.
- **P-CUT-07** — Shortcut-agent pattern: execute subset, declare complete. Defend against with atomic beads.
- **P-CUT-08** — Rubber-stamp-reviewer pattern: surface-level PASS. Defend with required evidence fields.
- **P-CUT-09** — Invisible-dependency pattern: spawn implementation before design done. Defend with `blocked_by`.
- **P-CUT-10** — Polling-tax pattern: status polling burns context. Replace with graph queries.
- **P-CUT-11** — Lost-handoff pattern: free-text completion messages leak interpretation. Use structured close reasons.
- **P-CUT-12** — Decompose before spawning: define graph, then delegate.
- **P-CUT-13** — Evidence in close reasons: "Dev server on :3000, screenshot at artifacts/01.png" — never "done".
- **P-CUT-14** — Replace polling with zero-cost graph queries on heartbeat cycles.
- **P-CUT-15** — One graph per tier, not per repo — cross-repo visibility.
- **P-CUT-16** — Template the decomposition: reuse Setup / Feature / Bugfix graphs.
- **P-CUT-17** — Blocked is a valid state. Mark with specific blocker. Never fake completion.
- **P-CUT-18** — Setup template: 12 subtasks (recon → env → services → migrations → dev server → browser → login → navigation → tests → runbook → manifest → results).
- **P-CUT-19** — Feature template: 5 (design → implement → self-review → QA evidence → PR).
- **P-CUT-20** — Bug-fix template: 4 (reproduce → fix → verify → PR).

## How to Use Claude Code like a Claude Code Engineer · [source](https://trilogyai.substack.com/p/how-to-use-claude-code-like-a-claude)

- **P-CC-01** — Every Claude Code constraint is a response to a production failure. Anticipate, name, circuit-break.
- **P-CC-02** — Respect `AUTOCOMPACT_BUFFER_TOKENS = 13,000`. Design sessions around the cycle.
- **P-CC-03** — After 3 consecutive autocompact failures the system halts retries. Don't fight it.
- **P-CC-04** — Structure first message of every session to fill the 9 preserved sections (intent/concepts/files/errors/progress/pending/current/user-msgs/next).
- **P-CC-05** — 23 bash injection checks catch specific patterns. Don't attempt to bypass.
- **P-CC-06** — Auto-background triggers on timeout; output in `CircularBuffer` auto-evicting oldest.
- **P-CC-07** — Permission modes ordered by trust: default → acceptEdits → auto → bypassPermissions → planMode.
- **P-CC-08** — Three consecutive denials OR twenty total → reprompt, don't retry.
- **P-CC-09** — Read-before-edit mandatory (`FileEditTool` enforces).
- **P-CC-10** — Batch reads parallel (via `isConcurrencySafe`); writes run serial.
- **P-CC-11** — CLAUDE.md tier order high-to-low: local > project > user > managed. Memoized at session start.
- **P-CC-12** — CLAUDE.md size caps: 200 lines, 25,000 bytes.
- **P-CC-13** — Edit to CLAUDE.md → restart session (no mid-session effect).
- **P-CC-14** — Use `TaskStopTool` for backgrounded children. Parent Ctrl+C does not cascade.
- **P-CC-15** — Foreground queries retry on 529 up to 10× with exp backoff; background fails fast (no retry).
- **P-CC-16** — Headless mode (`--print`, `--p`, SDK): strict JSONL to stdout, no trust dialogs.
- **P-CC-17** — Agents don't share memory; pass typed messages via discriminated union bus.
- **P-CC-18** — Mirror foreground/background retry asymmetry in any external tooling.
- **P-CC-19** — Place highest-priority rules in `CLAUDE.local.md` (gitignored, wins).
- **P-CC-20** — MCP tool naming: `mcp__serverName__toolName` prevents collisions.

## What Would Vin Claudel Do · [source](https://trilogyai.substack.com/p/what-would-vin-claudel-do)

- **P-WWVCD-01** — Before designing from scratch, search existing proven implementations for exact constants.
- **P-WWVCD-02** — Default retrieval: `npx wwvcd "topic" --json` — 1,191 technical findings from Claude Code source per the author (Stan Huseletov).
- **P-WWVCD-03** — For long-running bash, reuse the blueprint: `ASSISTANT_BLOCKING_BUDGET_MS` + CircularBuffer + platform sandboxing. Never "run async" in a prompt.
- **P-WWVCD-04** — For judge hallucination, require `evidence_quote` output field + strip write perms from evaluator. Never "BE STRICT" in a prompt.
- **P-WWVCD-05** — Claims without evidence blocks = automatic fabrication.
- **P-WWVCD-06** — Output schemas enforce evidence fields; empty quotes fail the run.
- **P-WWVCD-07** — Evaluation agents have zero `FILE_WRITE` / `FILE_EDIT` capabilities — architecturally adversarial.
- **P-WWVCD-08** — Reliable agents depend on architecture, not rhetoric.

## Postmortem: When Your AI Tools OpenClaw · [source](https://trilogyai.substack.com/p/postmortem-when-your-ai-tools-openclaw)

- **P-POST-01** — No single AI tool solves all problems; maintain deliberate redundancy.
- **P-POST-02** — Meta-debugging (one AI tool diagnosing another) is a valid resilience pattern.
- **P-POST-03** — Search the exact error string BEFORE extended log analysis. If millions use the tool, someone hit it first.
- **P-POST-04** — Filter issues by tool version. Minor version bumps carry breaking changes.
- **P-POST-05** — Exec lifecycle crash: background processes emit after run completes — handle buffering.
- **P-POST-06** — V8 heap default (~4GB) is insufficient for long browser sessions — wrapper-script with increased heap.
- **P-POST-07** — Shell expansion in non-shell environments (plist, launchd) silently fails — validate early.
- **P-POST-08** — `KeepAlive` + auto-restart beats manual intervention for known-flaky daemons.

## How to Manage Your OpenClaw Memory · [source](https://trilogyai.substack.com/p/how-to-manage-your-openclaw-memory)

- **P-MEM-01** — Memory protection is multi-layer; single interventions fail.
- **P-MEM-02** — OpenClaw auto-injects exactly these 8 files: `SOUL.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `MEMORY.md`. Custom names = zero injection.
- **P-MEM-03** — Facts/events/people route to `MEMORY.md` only.
- **P-MEM-04** — Behavior changes ("be shorter") route to `SOUL.md` or `AGENTS.md` — must shape next-session conduct.
- **P-MEM-05** — Complex preferences route to BOTH memory and operating files.
- **P-MEM-06** — Memory-file first line: identity + write-protection rule.
- **P-MEM-07** — Never use placeholder text ("(to be populated)") — agents interpret as empty and overwrite.
- **P-MEM-08** — Never symlink memory files to paths outside workspace root — OpenClaw silently rejects.
- **P-MEM-09** — Never overwrite `MEMORY.md` from scratch. Append or edit specific sections.
- **P-MEM-10** — Protection stack: in-file rules + SOUL rules + AGENTS rules + daily backups + size-check cron + QMD index + no-symlink.
- **P-MEM-11** — QMD config: top-level `memory.backend = qmd`, not nested under `agents.defaults`.
- **P-MEM-12** — Identity drift fix: make identity absolute first line of `SOUL.md`, reinforce in `AGENTS.md`.

## Deep Dive: OpenClaw · [source](https://trilogyai.substack.com/p/deep-dive-openclaw)

- **P-OC-01** — OpenClaw excels at long-horizon autonomous tasks without context collapse.
- **P-OC-02** — Pillar 1: situated identity via runtime-injected files (SOUL/IDENTITY/MEMORY/HEARTBEAT).
- **P-OC-03** — Pillar 2: skills-over-tools — dependency validation, OS compatibility, auto-install metadata.
- **P-OC-04** — Pillar 3: 7-layer policy stack (profile/provider/global/agent/channel/sandbox/inheritance).
- **P-OC-05** — Pillar 4: recursive agent spawning via `sessions_spawn` for parallel sub-agents.
- **P-OC-06** — Pillar 5: mandatory graceful degradation (auth rotation, model fallback, context compaction).
- **P-OC-07** — Pre-populate `SOUL.md` and `IDENTITY.md` before deployment.
- **P-OC-08** — Define Skills with explicit dependencies — never assume availability.
- **P-OC-09** — Use recursive spawning for architectural tasks, not as single agent.
- **P-OC-10** — Situated agency = agent knows who/where/what-it-can-do/what-policies-permit.

## How to OpenClaw (primer) · [source](https://www.huseletov.com/posts/how-to-openclaw)

- **P-OCPRIMER-01** — OpenClaw is an operating environment, not a tool suite.
- **P-OCPRIMER-02** — Priority 1 reading: memory & setup (makes everything else coherent).
- **P-OCPRIMER-03** — Priority 2: architecture (differentiate from Hermes).
- **P-OCPRIMER-04** — Priority 3: operator behavior (Shadow is a way to run the system).
- **P-OCPRIMER-05** — Priority 4: daily operations via Claude Code.
- **P-OCPRIMER-06** — Priority 5: scaling (gateway design at operational load).
- **P-OCPRIMER-07** — Priority 6: failure literacy (postmortems calibrate risk).

## Managing OpenClaw with Claude Code · [source](https://trilogyai.substack.com/p/managing-openclaw-with-claude-code)

- **P-OCCC-01** — Non-deterministic systems need deterministic configuration management.
- **P-OCCC-02** — Flat-file self-modification creates silent drift (naming inconsistencies, missing fields).
- **P-OCCC-03** — Skills in `.claude/skills/` encode standardized procedures — model-independent playbooks.
- **P-OCCC-04** — `/openclaw-new-agent` standardizes multi-file agent creation (6 markdown files).
- **P-OCCC-05** — `/openclaw-add-channel` routes secrets keychain → 3 files → binding → stow → restart.
- **P-OCCC-06** — `/openclaw-add-cron` enforces UUID, isolated sessions, token budgets.
- **P-OCCC-07** — `/openclaw-dream-setup` configures memory distillation (2,500 tokens daily / 7,500 rolling).
- **P-OCCC-08** — `/openclaw-add-script` enforces ceremony: `set -euo pipefail`, stdout-JSON, stderr-logs.
- **P-OCCC-09** — `/openclaw-add-secret` atomically updates 3 secret files — never partial.
- **P-OCCC-10** — Keychain naming: `openclaw.<name>` (lowercase, hyphens).
- **P-OCCC-11** — Env var naming: `OPENCLAW_<NAME>` (uppercase, underscores).
- **P-OCCC-12** — Reserve LLM capacity for interpreting intent; use deterministic scripts for mechanics.
- **P-OCCC-13** — Six markdown files per agent are structural requirements: SOUL/IDENTITY/USER/AGENTS/TOOLS/SECURITY.

## How-To: Claude Cowork · [source](https://trilogyai.substack.com/p/how-to-claude-cowork)

- **P-COWORK-01** — Concurrent sessions with `handover.md` between them cut task time ~50%.
- **P-COWORK-02** — Built-in verification: `validate.txt` pattern for self-correction.
- **P-COWORK-03** — Directive files: `CLAUDE.md` in folder, auto-referenced across sessions.
- **P-COWORK-04** — Pre-task duplicate folder to `backup/` before experimental work.
- **P-COWORK-05** — Plan in web (Opus), execute in Desktop (Cowork) for complex reasoning.
- **P-COWORK-06** — Service connectors (Gmail, calendar) expand scope — prioritize drafts by deadline.
- **P-COWORK-07** — Request `plan.md` before major changes.
- **P-COWORK-08** — Include specific examples in prompts for accuracy.
- **P-COWORK-09** — Operate on non-sensitive data only.

## Power OpenClaw for Pennies · [source](https://trilogyai.substack.com/p/power-openclaw-for-pennies-with-kimi)

- **P-KIMI-01** — Free Claude credits drain during agentic workflows; cheaper providers save $40–$180/mo.
- **P-KIMI-02** — Kimi K2 setup: provider=moonshotai, model=kimi-k2.5. $0.60/1M in, $3/1M out, $0.10 cache-hit.
- **P-KIMI-03** — GPT-5.4-mini as starting point; escalate to full GPT-5.4 only when needed.
- **P-KIMI-04** — OAuth mode for flat-rate subscription tokens bypasses metered API.
- **P-KIMI-05** — Maintain Anthropic as fallback — don't delete old configs.
- **P-KIMI-06** — Test switch with single agent task (e.g. inbox triage); cost <$1.
- **P-KIMI-07** — Alternatives: Fireworks.ai / Together.ai / OpenRouter / MiniMax for specific needs.

## How-To: Agent Factory · [source](https://trilogyai.substack.com/p/how-to-agent-factory)

- **P-FACTORY-01** — An agent factory is the scaffolding around the agent, not the agent itself.
- **P-FACTORY-02** — Focus on the seams: where agent meets sandbox, request becomes workflow, bot identity becomes user identity.
- **P-FACTORY-03** — Separate agent from execution environment — agent outside sandbox.
- **P-FACTORY-04** — Model chat turns as durable workflows, not inline execution.
- **P-FACTORY-05** — Snapshot semantics: creating a snapshot shuts down the source sandbox — handle in durable workflows.
- **P-FACTORY-06** — Subagents for parallelism: Explorer (read-only, grep/glob/read) + Executor (write access).
- **P-FACTORY-07** — Maintain living docs from day one: `AGENTS.md` + `LESSONS_LEARNED.md`.
- **P-FACTORY-08** — Use user OAuth, not app installation tokens (attribution + permission surface).
- **P-FACTORY-09** — Validate OAuth state values before linking accounts.
- **P-FACTORY-10** — Graceful degradation for PR-creation failures: redirect to prefilled compare URL.

## Hermes vs. OpenClaw · [source](https://trilogyai.substack.com/p/technical-deep-dive-hermes-vs-openclaw)

- **P-HERMES-01** — OpenClaw bet: routing + control. Hermes bet: memory + self-improvement.
- **P-HERMES-02** — Choose OpenClaw for: multi-agent teams, granular execution control, auditable markdown memory, TS ecosystem.
- **P-HERMES-03** — Choose Hermes for: autonomous skill building, bounded user profiling, Python, heavy compute offload.
- **P-HERMES-04** — Both converge on SKILL.md format + OGP compatibility — less "which framework", more "federation".

## Give Your Brains Hands · [source](https://trilogyai.substack.com/p/give-your-brains-hands)

- **P-HANDS-01** — Chat-AI is advice; agentic AI is execution.
- **P-HANDS-02** — The agentic loop: observe state → take action → check change → continue or hand back.
- **P-HANDS-03** — The loop is the product, not the individual response.
- **P-HANDS-04** — Workspace agents (Claude Code, Codex) stay near files; personal agents (OpenClaw, Hermes) stay near context.
- **P-HANDS-05** — Most workflows benefit from both surfaces simultaneously.
- **P-HANDS-06** — Proximity: put agents near the artifacts they modify.
- **P-HANDS-07** — Bounded tasks with explicit verification endpoints ("transcribe 3 recordings" beats "organize media").
- **P-HANDS-08** — External state in files, not chat transcripts.
- **P-HANDS-09** — Mandatory verification — agent checks totals, compares draft to source, confirms files landed.
- **P-HANDS-10** — Start with repetitive work you already do manually.
- **P-HANDS-11** — Human checkpoints for risk: deletions, financial transfers, external publishing, legal.
- **P-HANDS-12** — Good first tasks have weekly cadence, clear inputs, checkable outputs, single-session scope.

---

## Totals

- 14 articles
- ~130 distinct patterns
- Every pattern has an ID and a source URL
- The bead graph in `memory/BEADS.md` is seeded with P0/P1 absorption beads referencing these IDs

When the agent finds it's applying a pattern that's NOT catalogued here, it:
1. Adds it to this file at the end of the relevant article section with a new ID.
2. Creates a bead in `memory/BEADS.md` to verify the pattern with the source.
3. Cites it in the response.

---

*Authored and curated by the **Trilogy AI Center of Excellence** — [trilogyai.substack.com](https://trilogyai.substack.com/). Individual pattern sources linked per-section above.*
