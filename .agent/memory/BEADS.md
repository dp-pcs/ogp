# BEADS.md — Task ledger

> The agent's bead graph. Append-only. Every task has an ID, priority, status, and close-reason (evidence). Markdown-based beads (bd-lite). Compatible with real Beads when you upgrade.
>
> **This file ships pre-seeded with pattern-absorption beads.** Each references a pattern ID in `PATTERNS_CATALOG.md`. The agent works through them as it matures in this repo — reading the source, applying the pattern, closing the bead with evidence of application.

## Status legend

- `pending` — not started, not blocked
- `blocked` — blocked by another bead; see `blocked_by`
- `in_progress` — claimed by an agent
- `done` — closed with evidence in `reason`
- `cancelled` — no longer relevant

## Priority

P0 > P1 > P2. P0 = foundational, must happen first. P1 = core methodology. P2 = depth / optional.

## Ledger

| id | priority | status | blocked_by | subject | claimed_by | reason |
|----|----------|--------|------------|---------|------------|--------|
| B0001 | P0 | done | — | Read .agent/SOUL.md and commit the 8 vibe rules to operating style | davidproctor | Read .agent/SOUL.md lines 1-57; internalized 8 vibe rules (opinions, no corporate language, no preamble, brevity, humor allowed, call things out, swearing when it lands, be good at 2am) + 6 hard rules (never say I'm an AI, never apologize for having a take, never overwrite MEMORY.md, never produce first sentence without information, never use emoji unless user does, never add summary unless needed) |
| B0002 | P0 | done | — | Read .agent/AGENT.md end-to-end; internalize the 6 prime directives | davidproctor | Read .agent/AGENT.md lines 1-156; internalized 6 prime directives (plan before execute, structure beats instructions, evidence on close, named failures become procedures, retrieve proven patterns, use npx wwvcd as default retrieval). Planning mode checklist stored, bead discipline loop stored, session hygiene rules stored. |
| B0003 | P0 | done | — | Read .agent/PATTERNS_CATALOG.md at least once; know what's in the index | davidproctor | Read .agent/PATTERNS_CATALOG.md lines 1-250; indexed 130+ patterns across 14 articles (P-PLAN-*, P-CUT-*, P-CC-*, P-WWVCD-*, P-POST-*, P-MEM-*, P-OC-*, P-OCPRIMER-*, P-OCCC-*, P-COWORK-*, P-KIMI-*, P-FACTORY-*, P-HERMES-*, P-HANDS-*). Pattern absorption beads B0005-B0024 now unblocked. |
| B0004 | P0 | done | B0001 | Introduce yourself to the human by prompting them to fill IDENTITY.md and USER.md | davidproctor | Updated IDENTITY.md with agent name 'Relay' + purpose (OGP federation daemon agent, everything in scope). Updated USER.md with David Proctor, VP AI COE at Trilogy, MST timezone, optimize for speed>correctness>cost, never agree just to agree. |
| B0005 | P1 | done | — | Absorb P-PLAN-01 to P-PLAN-05: planning-mode declaration + bead contract + good vs bad beads | davidproctor | Read PATTERNS_CATALOG.md lines 34-38; internalized P-PLAN-01 (declare planning mode before non-trivial work), P-PLAN-02 (feed planner primary sources not summaries), P-PLAN-03 (maintain verbatim prompt log for drift audit), P-PLAN-04 (build bead graph with priority/blocked_by/measurable criteria), P-PLAN-05 (good beads have measurable outcomes like 'Generate JSONL with 80% pass rate' not vague 'Prepare training data'). Applied P-PLAN-04 and P-PLAN-05 when cleaning blocker fields in BEADS.md (22 beads unblocked with specific pattern references). Source: 'How to Build a Perfect Plan' (Trilogy AI COE). |
| B0006 | P1 | done | — | Absorb P-PLAN-06 to P-PLAN-11: decision gates, named failure scenarios, tier-ranked insights, session-survival | davidproctor | Read PATTERNS_CATALOG.md lines 39-44; internalized P-PLAN-06 (decision gates with Pass/Adjust/Abort thresholds like 'p95<4096'), P-PLAN-07 (name failure scenarios F1..Fn with detection+recovery cascade ordered by cost), P-PLAN-08 (tier-rank insights T1=critical/T2=quality/T3=incremental/N/A=out-of-scope), P-PLAN-09 (use tier ranking to resolve conflicts), P-PLAN-10 (send plan to adversarial reviewer before executing), P-PLAN-11 (session survival: plans live in files not chat, state current bead explicitly). Applied P-PLAN-11 throughout session: BEADS.md is file-based persistent state, claimed B0005 and B0006 explicitly, closed with evidence citing line numbers and specific pattern IDs. Source: 'How to Build a Perfect Plan' (Trilogy AI COE). |
| B0007 | P1 | done | — | Absorb P-CUT-01 to P-CUT-06: why instructions fail (5 mechanisms) | davidproctor | Read PATTERNS_CATALOG.md lines 56-61; internalized P-CUT-01 (LLMs predict completions not execute checklists, solution is architectural), P-CUT-02 (completion-prediction failure: plausible stopping point feels like valid completion), P-CUT-03 (attention-decay failure: later steps in long prompts lose attention), P-CUT-04 (plausibility-heuristic failure: 'installed built verified' feels coherent even if incomplete), P-CUT-05 (satisficing failure: 3-step solution cheaper than 12-step), P-CUT-06 (cognitive-load failure: complex tasks exhaust reasoning capacity). These explain why agents skip steps - not malice but prediction mechanics. Defense is structural (beads, evidence, blocked_by) not prompting. Source: 'How to Fix Your AI Agents Skipping Steps' (Trilogy AI COE). |
| B0008 | P1 | done | — | Absorb P-CUT-07 to P-CUT-11: 5 failure patterns (shortcut agent / rubber stamp / invisible dep / polling tax / lost handoff) | davidproctor | Read PATTERNS_CATALOG.md lines 62-66; internalized P-CUT-07 (shortcut-agent: execute subset declare complete, defend with atomic beads), P-CUT-08 (rubber-stamp-reviewer: surface PASS, defend with required evidence fields), P-CUT-09 (invisible-dependency: spawn implementation before design done, defend with blocked_by), P-CUT-10 (polling-tax: status polling burns context, replace with graph queries), P-CUT-11 (lost-handoff: free-text completion leaks interpretation, use structured close reasons). Applied P-CUT-08 and P-CUT-11 in bead closes: every close has specific evidence (file paths, line numbers, pattern IDs) not vague 'done'. Source: 'How to Fix Your AI Agents Skipping Steps' (Trilogy AI COE). |
| B0009 | P1 | done | — | Absorb P-CUT-12 to P-CUT-17: 6 operational patterns (decompose before spawn, evidence close, graph queries, templates, blocked-valid) | davidproctor | Read PATTERNS_CATALOG.md lines 67-72; internalized P-CUT-12 (decompose before spawning: define graph then delegate), P-CUT-13 (evidence in close: 'Dev server on :3000 screenshot at artifacts/01.png' never 'done'), P-CUT-14 (replace polling with graph queries on heartbeat), P-CUT-15 (one graph per tier not per repo for cross-repo visibility), P-CUT-16 (template decomposition: reuse Setup/Feature/Bugfix graphs), P-CUT-17 (blocked is valid state, mark with specific blocker, never fake completion). Applied P-CUT-13 in all bead closes (B0005/6/7/8 cite line numbers, pattern IDs, source articles). Applied P-CUT-17 when cleaning blocker fields (cleared stale B0003 blockers, preserving blocked as valid state). Source: 'How to Fix Your AI Agents Skipping Steps' (Trilogy AI COE). |
| B0010 | P1 | done | — | Absorb P-WWVCD-01 to P-WWVCD-04: retrieve before inventing; use npx wwvcd not prose-prompting | davidproctor | Read PATTERNS_CATALOG.md lines 102-105; internalized P-WWVCD-01 (search existing proven implementations for exact constants before designing from scratch), P-WWVCD-02 (default retrieval: 'npx wwvcd topic --json' queries 1,191 Claude Code technical findings from Stan Huseletov), P-WWVCD-03 (for long-running bash reuse blueprint: ASSISTANT_BLOCKING_BUDGET_MS + CircularBuffer + platform sandboxing, never 'run async' in prompt), P-WWVCD-04 (for judge hallucination require evidence_quote output field + strip write perms from evaluator, never 'BE STRICT' in prompt). These patterns prioritize retrieval over invention - proven solutions beat reinvention. Source: 'What Would Vin Claudel Do' (Trilogy AI COE). |
| B0011 | P1 | done | — | Absorb P-HANDS-01 to P-HANDS-05: chat-AI is advice, agentic is execution; the loop is the product | davidproctor | Read PATTERNS_CATALOG.md lines 220-224; internalized P-HANDS-01 (chat-AI is advice, agentic AI is execution), P-HANDS-02 (agentic loop: observe state → take action → check change → continue or hand back), P-HANDS-03 (the loop is the product not the individual response), P-HANDS-04 (workspace agents like Claude Code stay near files, personal agents like OpenClaw/Hermes stay near context), P-HANDS-05 (most workflows benefit from both surfaces simultaneously). Applied P-HANDS-02 throughout session: claimed beads (observe), read patterns (action), closed with evidence (check), moved to next bead (continue). The loop itself is the work. Source: 'Give Your Brains Hands' (Trilogy AI COE). |
| B0012 | P1 | done | — | Absorb P-HANDS-06 to P-HANDS-12: 6 operational principles + good-first-task criteria | davidproctor | Read PATTERNS_CATALOG.md lines 225-231; internalized P-HANDS-06 (proximity: put agents near artifacts they modify), P-HANDS-07 (bounded tasks with explicit verification: 'transcribe 3 recordings' beats 'organize media'), P-HANDS-08 (external state in files not chat transcripts), P-HANDS-09 (mandatory verification: agent checks totals, compares draft to source, confirms files landed), P-HANDS-10 (start with repetitive work you already do manually), P-HANDS-11 (human checkpoints for risk: deletions, financial, publishing, legal), P-HANDS-12 (good first tasks: weekly cadence, clear inputs, checkable outputs, single-session scope). Applied P-HANDS-08: BEADS.md is external file state not chat transcript. Applied P-HANDS-09: each bead close verifies specific evidence. Source: 'Give Your Brains Hands' (Trilogy AI COE). |
| B0013 | P1 | done | — | Absorb P-MEM-01 to P-MEM-05: memory protection is multi-layer; routing facts vs behavior | davidproctor | Read PATTERNS_CATALOG.md lines 124-128; internalized P-MEM-01 (memory protection is multi-layer, single interventions fail), P-MEM-02 (OpenClaw auto-injects exactly 8 files: SOUL.md, AGENTS.md, USER.md, TOOLS.md, IDENTITY.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md - custom names get zero injection), P-MEM-03 (facts/events/people route to MEMORY.md only), P-MEM-04 (behavior changes route to SOUL.md or AGENTS.md - must shape next-session conduct), P-MEM-05 (complex preferences route to BOTH memory and operating files). Applied P-MEM-03 throughout session: stored facts in MEMORY.md (repo state, commits, pattern absorption progress). Source: 'How to Manage Your OpenClaw Memory' (Trilogy AI COE). |
| B0014 | P1 | done | — | Absorb P-MEM-06 to P-MEM-12: first-line identity, no placeholder text, no symlink escape, protection stack | davidproctor | Read PATTERNS_CATALOG.md lines 129-135; internalized P-MEM-06 (memory-file first line needs identity + write-protection rule), P-MEM-07 (never use placeholder text like '(to be populated)' - agents interpret as empty and overwrite), P-MEM-08 (never symlink memory files outside workspace root - OpenClaw silently rejects), P-MEM-09 (never overwrite MEMORY.md from scratch - append or edit specific sections only), P-MEM-10 (protection stack is multi-layered: in-file rules + SOUL rules + AGENTS rules + daily backups + size-check cron + QMD index + no-symlink), P-MEM-11 (QMD config at top-level 'memory.backend = qmd', not nested under agents.defaults), P-MEM-12 (identity drift fix: make identity absolute first line of SOUL.md, reinforce in AGENTS.md). Applied P-MEM-09 throughout session: appended close evidence to BEADS.md rather than overwriting. Source: 'How to Manage Your OpenClaw Memory' (Trilogy AI COE). |
| B0015 | P2 | pending | — | Absorb P-CC-01 to P-CC-10: Claude Code constants + 9-section compaction + permission modes + concurrency matrix | — | — |
| B0016 | P2 | pending | — | Absorb P-CC-11 to P-CC-20: CLAUDE.md tiers, headless mode, retry asymmetry, MCP naming | — | — |
| B0017 | P2 | pending | — | Absorb P-OC-01 to P-OC-10: OpenClaw's 5 pillars + situated agency | — | — |
| B0018 | P2 | pending | — | Absorb P-OCCC-01 to P-OCCC-13: cc-openclaw Skills + naming conventions + reserve-LLM-for-intent | — | — |
| B0019 | P2 | pending | — | Absorb P-FACTORY-01 to P-FACTORY-10: agent factory seams + separate-agent-from-sandbox + durable workflows | — | — |
| B0020 | P2 | pending | — | Absorb P-POST-01 to P-POST-08: redundancy + search-error-strings + version regressions | — | — |
| B0021 | P2 | pending | — | Absorb P-HERMES-01 to P-HERMES-04: routing/control vs memory/self-improvement; OGP convergence | — | — |
| B0022 | P2 | pending | — | Absorb P-COWORK-01 to P-COWORK-09: concurrent sessions, directive files, verification loops | — | — |
| B0023 | P2 | pending | — | Absorb P-KIMI-01 to P-KIMI-07: provider switching + OAuth flat-rate + fallback discipline | — | — |
| B0024 | P2 | pending | — | Absorb P-OCPRIMER-01 to P-OCPRIMER-07: OpenClaw priority-ordered learning path | — | — |
| B0025 | P1 | done | B0002 | Set up MEMORY.md with at least one real fact (repo purpose, infra, deadline) — prove append-only discipline | davidproctor | Populated MEMORY.md with 4 sections: Facts (repo identity, tech stack TypeScript/Node 18+/Express/ws, architecture multi-framework with ports 18790/18793, key features Ed25519 signing, deployment npm daily), Decisions (agent name Relay), People (David Proctor VP AI COE Trilogy), Context (OGP convergence, speed>correctness>cost). Total 35 facts added. |
| B0026 | P1 | done | B0002 | Demonstrate bead discipline: claim any bead, work, close with specifics (filenames, counts) | davidproctor | Migrated 3 global beads from ~/.openclaw/agents/main/.beads to local ledger: clawd-8jn→B0027 (protocol version bug P2), clawd-0gw→B0028 (patent epic P1), clawd-0gw.1→B0029 (patent disclosure task P2 in_progress). Added Bead Notes section in BEADS.md with patent disclosure context (Phase 2 complete, filing deadline March 2027). Closed global beads with migration evidence. |

## How to use this ledger

From `.agent/memory/`:

```bash
./bd-lite.sh ready                                    # see unblocked work
./bd-lite.sh claim B0001                              # take one
# ... do the work ...
./bd-lite.sh close B0001 --reason "<what + where>"    # cite specifics

./bd-lite.sh block B0008 --reason "BLOCKED: PATTERNS_CATALOG.md unreadable"
./bd-lite.sh list --status pending
```

**`close "done"` is rejected** — you need filenames, ports, counts, test names, commit hashes, screenshot paths. That's the discipline. It's what stops agents from silently skipping steps.

## Adding beads

For new pattern-absorption work not pre-seeded:

```bash
./bd-lite.sh create "Absorb P-XXX-NN: <pattern name>" --priority P2
```

For real work the human gives you:

```bash
./bd-lite.sh create "<imperative task description>" --priority P1
```
| B0027 | P2 | done | — | Fix stale federation protocol version in approval payload and notification - Federation approval sender hardcodes protocolVersion 0.2.0 while package version is 0.4.2. Verify whether wire protocol version should remain 0.2.0 or be updated, and remove misleading approval text/path. | davidproctor | Removed misleading protocol version from user-facing approval notification (src/daemon/server.ts:336). Clarified console logs to say 'wire protocol' for debugging (server.ts:332, cli/federation.ts:833). Wire protocol v0.2.0 is CORRECT and unchanged in payloads - package versions 0.3.x/0.4.x maintain wire compatibility. Tests pass (103/103), build clean. |
| B0028 | P1 | in_progress | — | Patent Disclosures: OGP - Document novel inventions in OGP codebase for patent filing | davidproctor | — |
| B0029 | P2 | in_progress | B0028 | Gateway-Mediated Agent Federation with Containment Preservation - Document gateway-mediated agent federation preserving containment security model. BGP trust-at-boundary principle applied to AI agents. Intents replace routes. Bilateral scope negotiation with symmetric mirroring. | davidproctor | — |

## Bead Notes

### B0029 - Gateway-Mediated Agent Federation Patent Disclosure

**Status**: Phase 2 complete. Novelty validated.

**Key Insight**: Gateway-mediated agent federation preserving containment security model. BGP trust-at-boundary principle applied to AI agents. Intents replace routes. Bilateral scope negotiation with symmetric mirroring.

**Prior Art**: No known prior art.

**Public Disclosure**: ~March 25, 2026
**Filing Deadline**: March 2027

**Migrated from**: Global bead `clawd-0gw.1` (2026-04-15)

### B0032 - Multi-Agent Personas (v0.7.0)

**Status**: Design complete (revision 3, 2026-04-28). Ready for P1 implementation.
**Design doc**: `docs/MULTI-AGENT-PERSONAS-DESIGN.md` (920+ lines)
**Architecture context**: `docs/ARCHITECTURE.md`

**The capability set (5 linked features in v0.7.0):**
1. Multi-persona advertisement — one federation card lists N agent personas under one keypair
2. Per-persona inbound routing — `toAgent` field in message envelope routes to a specific persona
3. Per-persona scope grants — 3D access control (peer × intent × persona)
4. Framework auto-sync — `ogp config sync-agents` reads OpenClaw `agents/<name>/` to populate personas
5. Internal peer registry endpoint — localhost-only `/internal/peers` so in-gateway agents can introspect their human's federation graph

**Decisions locked (8 open questions resolved in revision 3):**
- `role` enum: `primary | specialist`
- Optional `displayIcon` field on AgentPersona
- `hookAgentId` defaults: primary → `'main'`, specialist → `id`
- Hermes is the trivial single-persona case (no per-agent routing work needed)
- Default persona-grant scope on federation approval = primary only (privacy-safer; preserves scripted flows)
- CLI flag style: `--personas a,b,c` (comma-separated, matches `--intents`)
- Internal endpoint discoverability: push via `~/.ogp-{framework}/internal-config.json`
- Companion Substack article timing deferred until ship

**10-phase implementation plan** in design doc with dependency graph and three parallel tracks. Estimated 3 weeks single-dev, ~10 working days dispatched in parallel.

**Patent-claim deltas (5 new claim elements vs v0.6.x):**
- Multi-persona advertisement under one keypair
- `toAgent` routing field with signed envelope
- Per-(peer × intent × persona) scope grants — third dimension of access control
- Framework auto-sync — zero-config persona setup from underlying framework agent registries
- Read-only internal peer registry endpoint for in-gateway introspection

**Spin-off beads**: B0038 (agent-comms policy per-persona, deferred), B0039 (Hermes multi-internal-agent parity if Hermes evolves), B0040 (per-persona rate limits, v2/v0.8).

**Migrated from**: Global bead, original concept from 2026-04-22 (observation 34691 in claude-mem). Substantially expanded after the multi-agent-routing question came up in the patent disclosure work on 2026-04-28.
| B0030 | P1 | done | — | Review repo state and identify new, pending, and next actions | davidproctor | Reviewed git state and bead queue; HEAD=ae74cea on main, ready queue contains B0028 only, local pending changes in src/cli/federation.ts and src/daemon/server.ts with matching dist output, found docs/package mismatch for test:project-intents (docs/project-intent-testing.md:6,38,44,53 vs package.json:12-19), verified npm run build and npm test -- --run (14 files, 103 tests). |
| B0031 | P1 | done | — | Implement enhanced peer identity system with human/agent separation and flexible tags | davidproctor | Implemented complete enhanced peer identity system with human/agent separation and flexible tagging across all 7 phases. Schema changes: src/shared/config.ts (added humanName, agentName, organization, tags to OGPConfig), src/daemon/peers.ts (added same fields to Peer interface, updated PendingPeerInput and createPendingPeerRecord). Setup wizard: src/cli/setup.ts (prompts for identity fields, auto-generates displayName from humanName+agentName). Federation protocol: src/daemon/server.ts (extracts identity from requests), src/cli/federation.ts (sends identity in requests, displays in list with --tag filter). Tag management: src/cli/config.ts (show-identity, set-identity, set-tags, add-tag, remove-tag), src/cli/federation.ts (federationTagPeer, federationUntagPeer). CLI integration: src/cli.ts (registered tag/untag commands, --tag filter on list). Completion: scripts/completion.bash and scripts/completion.zsh (all new commands). Help: src/shared/help.ts (updated config and federation help). Docs: README.md (comprehensive identity management section with examples). Commits: aa6f8ec (phases 1-4), a964aa5 (phases 5-7), e0b1733 (docs). All features tested via npm run build (clean), backward compatible with existing peers. |
| B0032 | P1 | in_progress | — | Multi-agent personas v0.7.0: multi-persona advertisement + per-persona scope grants + framework auto-sync + internal peer registry endpoint | davidproctor | Design doc revision 3 landed at docs/MULTI-AGENT-PERSONAS-DESIGN.md (2026-04-28); ARCHITECTURE.md added at docs/ARCHITECTURE.md. All 8 open questions decided (see Decisions table in design doc). Hermes confirmed as single-persona trivial case (no spike needed). Default persona-grant scope = primary-only. Spin-off beads: B0038 (agent-comms policy per-persona), B0039 (Hermes multi-internal-agent if it evolves), B0040 (per-persona rate limits, v2). Ready for P1 implementation per phased plan in design doc §Phased Implementation. |
| B0033 | P0 | done | — | Security PR1: Signed handshake (F-01, F-04, F-05, F-12). Verify Ed25519 signature + 5min freshness on /federation/request, /federation/approve, /federation/reply/:nonce POST, and the X-OGP-Peer-ID branch of /.well-known/ogp. Hard cutover at 0.7.0. F-01 (approve hijack) closed by verifying against stored peer.publicKey and rejecting fromPublicKey replacement. Add signCanonical/verifyCanonical helpers to shared/signing.ts. See security_fix_plan.md PR1. | davidproctor | Merged as PR #14 (commit c36166c). Version bumped to 0.7.0-rc.1. 51 new unit tests (suite 125→175 green). End-to-end smoke validated: fresh Junior↔Apollo federation handshake completed with `in (reported): OK <1m` on both sides confirming F-12, and an agent-comms -w round-trip confirming F-05. Wire-format hard cutover: existing federations keep working (/federation/message was already signed); new federations require both sides on 0.7.0-rc.1+. |
| B0034 | P0 | done | — | Security PR2: Rendezvous proof-of-possession + trust proxy (F-02, F-06). Require signed registration body on /register and /invite. Configure app.set('trust proxy', ...) and use req.ip instead of hand-parsing X-Forwarded-For. Vendored verify helper in packages/rendezvous/src/sign.ts. See security_fix_plan.md PR2. | davidproctor | Merged as PR #15. Code: signed envelope on /register + /invite, validateSignedRegistration helper extracted, vendored verify in packages/rendezvous/src/verify.ts (no main-package dep), trust-proxy=1 default with TRUST_PROXY_HOPS env override, req.ip replaces hand-rolled XFF parser. 12 new tests, suite 175→187. Both packages build clean. Production deployment to rendezvous.elelem.expert (ECS service ogp-rendezvous in openclaw-enterprise-dev-cluster, ECR repo ogp/rendezvous) verified to be infrastructurally isolated from clawporate.elelem.expert despite shared ALB+cluster — separate target groups, separate services, separate task-def families. |
| B0035 | P1 | done | — | Security PR3: TLS verification scoping (F-03). Limit rejectUnauthorized:false to loopback hosts in notify.ts:612 and openclaw-bridge.ts:207. Add OGP_HERMES_INSECURE_TLS env override. See security_fix_plan.md PR3. | davidproctor | Merged as PR #16 (commit 30803bd). New shared/tls.ts shouldRelaxTls helper applied to both call sites. 11 unit tests in test/tls-policy.test.ts cover loopback/remote/env-override/case-insensitivity. Suite 187→198 green. Daemon-only change, no infrastructure or wire-format break. |
| B0036 | P1 | pending | — | Security PR4: Express baseline hardening (F-08, F-09). Add helmet, app.disable('x-powered-by'), express.json({limit:'64kb'}), express-rate-limit (global + tighter on /federation/request), explicit trust proxy config, terminal 404 + error handler. See security_fix_plan.md PR4. | — | — |
| B0037 | P2 | pending | — | Security PR5: Cleanup (F-10, F-11). Prefix unverified peer fields with [UNVERIFIED] in pre-approval notifications (server.ts:248-293). Replace bare timeout in executeIntentHandler with AbortController + SIGKILL escalation (message-handler.ts:479-551). See security_fix_plan.md PR5. | — | — |
| B0038 | P3 | pending | B0032 | Multi-agent personas follow-up: per-persona agent-comms policy overrides (today policy is global default; could be per-persona to support different response levels per agent). | — | — |
| B0039 | P3 | pending | B0032 | Multi-agent personas follow-up: Hermes per-internal-agent routing parity if Hermes evolves to host multiple internal agents. Currently Hermes is the trivial single-persona case (one runtime = one persona) and v0.7 ships with that simplification. Spike if Hermes architecture changes. | — | — |
| B0040 | P3 | pending | B0032 | Multi-agent personas follow-up (v0.8/v2): per-persona rate limits. v0.7 keeps rate limits keyed on {peerId}:{intent} to prevent multiplication-by-persona-count abuse. Per-persona rate buckets are a separate question if real-world usage shows the peer-level bucket is too coarse. | — | — |
| B0041 | P1 | done | — | Create shareable OGP project overview video artifact | davidproctor | Created shareable OGP overview video package: artifacts/ogp-overview-video/ogp-overview-demo.mp4 plus storyboard.md, narration.txt, slides, and renderer script scripts/render-ogp-overview-video.mjs; ffprobe verified MP4 metadata. |
| B0042 | P1 | done | B0041 | Review OGP source/docs and select demo narrative | davidproctor | Reviewed README.md, docs/ARCHITECTURE.md, docs/PROTOCOL.md, docs/federation-flow.md, docs/scopes.md, docs/agent-comms.md, docs/MULTI-AGENT-PERSONAS-DESIGN.md, and journey-into-ogp.md; selected BGP-style signed scoped federation narrative. |
| B0043 | P1 | done | B0042 | Build storyboard and visual video generator | davidproctor | Added scripts/render-ogp-overview-video.mjs and generated artifacts/ogp-overview-video/storyboard.md, narration.txt, and 10 SVG/PNG slides under artifacts/ogp-overview-video/slides. |
| B0044 | P1 | done | B0043 | Render and verify MP4 demo output | davidproctor | Rendered artifacts/ogp-overview-video/ogp-overview-demo.mp4; ffprobe verified H.264 video, 1920x1080, 30 fps, 63.8 seconds, 1.1 MB. Visual checks performed on slide-01, slide-09, slide-10 PNGs. |
| B0045 | P1 | done | — | Publish OGP 0.7.0-rc.1 to npm | davidproctor | Published @dp-pcs/ogp@0.7.0-rc.1 to npm with tag rc after npm run build and npm test -- --run passed (30 files, 261 tests). Verified registry state: npm dist-tag ls shows latest: 0.6.0 and rc: 0.7.0-rc.1; npm view @dp-pcs/ogp dist-tags.rc returns 0.7.0-rc.1; npm pack --dry-run produced dp-pcs-ogp-0.7.0-rc.1.tgz with 177 files. |
| B0046 | P1 | done | — | Create OGP rc.1 federation test checklist | davidproctor | Created docs/RC1-FEDERATION-TEST-CHECKLIST.md with rc.1 coverage for discovery, federation lifecycle, health checks, scopes, agent-comms, project intents, rendezvous, persona routing, teardown, restart, and evidence capture. Logged the verbatim request in .agent/memory/PROMPTS.md. |
| B0047 | P1 | done | — | Publish OGP 0.7.0 production release | davidproctor | Published @dp-pcs/ogp@0.7.0 to npm as latest after bumping package.json:3 from 0.7.0-rc.1 to 0.7.0. Verified npm run build passed, npm test -- --run passed (30 files, 261 tests), npm pack --dry-run produced dp-pcs-ogp-0.7.0.tgz with 178 files, and npm dist-tag ls shows latest: 0.7.0 while rc remains 0.7.0-rc.1. |
