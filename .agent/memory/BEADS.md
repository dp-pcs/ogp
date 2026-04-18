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
| B0005 | P1 | pending | B0003 | Absorb P-PLAN-01 to P-PLAN-05: planning-mode declaration + bead contract + good vs bad beads | — | — |
| B0006 | P1 | pending | B0003 | Absorb P-PLAN-06 to P-PLAN-11: decision gates, named failure scenarios, tier-ranked insights, session-survival | — | — |
| B0007 | P1 | pending | B0003 | Absorb P-CUT-01 to P-CUT-06: why instructions fail (5 mechanisms) | — | — |
| B0008 | P1 | pending | B0003 | Absorb P-CUT-07 to P-CUT-11: 5 failure patterns (shortcut agent / rubber stamp / invisible dep / polling tax / lost handoff) | — | — |
| B0009 | P1 | pending | B0003 | Absorb P-CUT-12 to P-CUT-17: 6 operational patterns (decompose before spawn, evidence close, graph queries, templates, blocked-valid) | — | — |
| B0010 | P1 | pending | B0003 | Absorb P-WWVCD-01 to P-WWVCD-04: retrieve before inventing; use npx wwvcd not prose-prompting | — | — |
| B0011 | P1 | pending | B0003 | Absorb P-HANDS-01 to P-HANDS-05: chat-AI is advice, agentic is execution; the loop is the product | — | — |
| B0012 | P1 | pending | B0003 | Absorb P-HANDS-06 to P-HANDS-12: 6 operational principles + good-first-task criteria | — | — |
| B0013 | P1 | pending | B0003 | Absorb P-MEM-01 to P-MEM-05: memory protection is multi-layer; routing facts vs behavior | — | — |
| B0014 | P1 | pending | B0003 | Absorb P-MEM-06 to P-MEM-12: first-line identity, no placeholder text, no symlink escape, protection stack | — | — |
| B0015 | P2 | pending | B0003 | Absorb P-CC-01 to P-CC-10: Claude Code constants + 9-section compaction + permission modes + concurrency matrix | — | — |
| B0016 | P2 | pending | B0003 | Absorb P-CC-11 to P-CC-20: CLAUDE.md tiers, headless mode, retry asymmetry, MCP naming | — | — |
| B0017 | P2 | pending | B0003 | Absorb P-OC-01 to P-OC-10: OpenClaw's 5 pillars + situated agency | — | — |
| B0018 | P2 | pending | B0003 | Absorb P-OCCC-01 to P-OCCC-13: cc-openclaw Skills + naming conventions + reserve-LLM-for-intent | — | — |
| B0019 | P2 | pending | B0003 | Absorb P-FACTORY-01 to P-FACTORY-10: agent factory seams + separate-agent-from-sandbox + durable workflows | — | — |
| B0020 | P2 | pending | B0003 | Absorb P-POST-01 to P-POST-08: redundancy + search-error-strings + version regressions | — | — |
| B0021 | P2 | pending | B0003 | Absorb P-HERMES-01 to P-HERMES-04: routing/control vs memory/self-improvement; OGP convergence | — | — |
| B0022 | P2 | pending | B0003 | Absorb P-COWORK-01 to P-COWORK-09: concurrent sessions, directive files, verification loops | — | — |
| B0023 | P2 | pending | B0003 | Absorb P-KIMI-01 to P-KIMI-07: provider switching + OAuth flat-rate + fallback discipline | — | — |
| B0024 | P2 | pending | B0003 | Absorb P-OCPRIMER-01 to P-OCPRIMER-07: OpenClaw priority-ordered learning path | — | — |
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
| B0028 | P1 | pending | — | Patent Disclosures: OGP - Document novel inventions in OGP codebase for patent filing | — | — |
| B0029 | P2 | in_progress | B0028 | Gateway-Mediated Agent Federation with Containment Preservation - Document gateway-mediated agent federation preserving containment security model. BGP trust-at-boundary principle applied to AI agents. Intents replace routes. Bilateral scope negotiation with symmetric mirroring. | davidproctor | — |

## Bead Notes

### B0029 - Gateway-Mediated Agent Federation Patent Disclosure

**Status**: Phase 2 complete. Novelty validated.

**Key Insight**: Gateway-mediated agent federation preserving containment security model. BGP trust-at-boundary principle applied to AI agents. Intents replace routes. Bilateral scope negotiation with symmetric mirroring.

**Prior Art**: No known prior art.

**Public Disclosure**: ~March 25, 2026
**Filing Deadline**: March 2027

**Migrated from**: Global bead `clawd-0gw.1` (2026-04-15)
| B0030 | P1 | done | — | Review repo state and identify new, pending, and next actions | davidproctor | Reviewed git state and bead queue; HEAD=ae74cea on main, ready queue contains B0028 only, local pending changes in src/cli/federation.ts and src/daemon/server.ts with matching dist output, found docs/package mismatch for test:project-intents (docs/project-intent-testing.md:6,38,44,53 vs package.json:12-19), verified npm run build and npm test -- --run (14 files, 103 tests). |
