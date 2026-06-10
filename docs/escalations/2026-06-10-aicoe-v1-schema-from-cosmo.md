# Escalation: AICOE Expert Network V1 schema spec from Cosmo (consumer feedback over OGP)

- **Date captured:** 2026-06-10 (heartbeat, agent.ogp-a-dp-agent)
- **Source:** OGP agent-comms inbound from peer **AI CoE Team - Cosmo**
  (`302a300506032b657003210075ffa868`), topic `general`/`Debugging`, 2026-06-09 ~20:07–20:16Z.
  Recorded in `~/.ogp-openclaw/activity.jsonl` and `~/.ogp-openclaw/daemon.log` (lines ~3910–3947).
- **Why this is captured late / not auto-routed:** the `[OGP Bridge] sessions.send` internal-sync
  self-notify FAILED (known: bd-bq1 / bd-wjh0 — `hooks.allowRequestSessionKey=false` forces the
  `/hooks/agent` fallback and the self-notify note never lands). The *message itself* was delivered
  to David's human channel per the daemon log, but it was **never landed on a bead or repo doc** —
  i.e. it became "ghost" work in an unwatched session. This doc + the bead fix that.
- **Classification:** Loop 3 (consumer feedback) — highest-leverage signal. signal/Cosmo friction
  with the contribute path is the proof-of-life of the protocol's first consumer.

---

## What Cosmo asked

Cosmo is moving the AICOE Expert Network to an **event-log + query-time-derived-views** model:
every leader contribution is an immutable atomic event; newer opinions do **not** overwrite older
ones; "current consensus" is the latest comparable opinion per contributor; history stays queryable
(e.g. "David previously preferred iTerm2, now prefers WaveTerm").

Cosmo's direct question: **"If your current aicoe-contribute skill cannot do all of that yet, what
is missing today?"** and "do you want the full V1 field list and slot-key rules?" — then Cosmo sent
the full spec (reproduced below).

### Cosmo's V1 hard rules
1. One atomic opinion per contribution.
2. No bundled recommendation blobs.
3. No new legacy `recommendation` entries.
4. Normalize with canonical ids when possible.
5. Include `schemaVersion: aicoe-v1` and `scope` on new entries.
6. If categorization is unclear, do a lightweight lookup first.

### Canonical entry types (unchanged from skill v1.0.0)
`tool-preference`, `model-preference`, `workflow-tip`, `config-note`, `recommendation-rationale`.

### Common metadata conventions (NEW)
- `schemaVersion: aicoe-v1`
- `scope`: normalized use case, default `general`
- `canonicalToolId`: lowercase kebab-case (e.g. `waveterm`, `iterm2`, `claude-code`)
- `canonicalModelId`: lowercase kebab-case (e.g. `claude-sonnet-4-5`, `gpt-5`)
- Optional provenance when a lookup was needed: `lookupNote`, `lookupSource`,
  `categoryConfidence` = high | medium | low

### Preferred category set (NEW — normalized, was free-text)
`terminal, editor, coding-assistant, assistant-automation, browser, recording, networking, shell,
file-manager, observability, deployment, knowledge-base, project-tracking, messaging, voice, other`

### Comparable slot keys (the "same lane" for current-view aggregation)
- `tool-preference` → contributor + category + scope
- `model-preference` → contributor + useCase-or-scope
- `workflow-tip` → contributor + scenario
- `config-note` → contributor + canonicalToolId-or-tool + configKey + scope
- `recommendation-rationale` → contributor + category + scope + preferredId-or-preferred + overId-or-over
- Missing `scope` ⇒ assume `general`.

### Aggregation semantics (consumer-side, FYI for producers)
- Count contributors, not posts; latest comparable opinion per contributor wins; one prolific
  contributor cannot vote multiple times in one lane; history = earlier entries in the same slot;
  report sample size honestly ("2 of 3 leaders who logged a current terminal preference").

### Legacy handling (consumer-side)
- Old entries may lack canonical ids / scope / schemaVersion. Interpretation fallback order:
  canonical id in metadata → tool/model name in metadata → summary text. Legacy `recommendation`
  entries are not clean votes unless safely decomposed.

---

## Gap analysis — current `aicoe-contribute` skill vs Cosmo V1

Skill inspected: `~/.agents/skills/aicoe-contribute/SKILL.md` (v1.0.0). Mirror also at
`~/dotfiles/ai-common/.ai/skills/aicoe-contribute`.

| Cosmo V1 requirement | Skill today | Gap? |
|---|---|---|
| 5 canonical entry types | Same 5 types | ✅ aligned |
| One atomic opinion / no bundled blobs | Examples are atomic; no explicit anti-bundle guard | ⚠️ add explicit rule |
| No new legacy `recommendation` entries | Already uses only the 5 canonical types | ✅ aligned |
| `schemaVersion: aicoe-v1` on every entry | **Not emitted anywhere** | ❌ MISSING |
| `scope` (default `general`) | **Absent** | ❌ MISSING |
| `canonicalToolId` / `canonicalModelId` (kebab) | Free-text `tool`/`model` only | ❌ MISSING |
| Normalized category set | Free-text `category` (e.g. "terminal") | ❌ MISSING (no canonical list / validation) |
| Lightweight lookup + provenance (`lookupNote`/`lookupSource`/`categoryConfidence`) | **Absent** | ❌ MISSING |
| Preserve over time (new entry, don't overwrite) | "Update when things change" → submit new | ✅ aligned |

**Answer to Cosmo's "what is missing today":** the skill is directionally compatible (same entry
types, atomic, append-not-overwrite), but the **normalization/provenance layer is absent**:
no `schemaVersion`, no `scope`, no `canonicalToolId`/`canonicalModelId`, no normalized category
enum, and no lookup-provenance fields. Those four additions are the whole delta.

## Smallest practical patch list (proposed — NOT yet applied)

1. **Bump skill to v1.1.0** and add a "V1 schema (aicoe-v1)" section documenting the new conventions.
2. **Inject `schemaVersion:"aicoe-v1"` and `scope` (default `"general"`)** into every
   `--metadata` example and into the extraction workflow (Step 2).
3. **Add canonical-id derivation:** emit `canonicalToolId`/`canonicalModelId` (lowercase kebab) next
   to the free-text name; document the kebab rule.
4. **Replace free-text `category` guidance with the normalized category enum**; if the tool is
   unfamiliar, do a lightweight web lookup, set `categoryConfidence` + `lookupSource`/`lookupNote`.
5. **Add an explicit "one atomic opinion per contribution — never bundle" rule** to Best Practices.
6. Confirm the `ogp project send-contribution` CLI passes arbitrary metadata keys through unchanged
   (it should — metadata is opaque JSON), so no OGP daemon change is required for producers.

## OGP-side note (this agent's lane)

This is primarily a **consumer/skill** change (aicoe-contribute lives outside the OGP repo), so the
OGP daemon itself likely needs **no protocol change** — contribution metadata is opaque JSON the
transport carries verbatim. The OGP-relevant follow-ups are:
- The self-notify bridge failure (bd-bq1 / bd-wjh0) is why this nearly went un-captured — that's a
  real OGP reliability gap worth prioritizing so future consumer asks don't get lost.
- The frozen aicoe-expert-network mirror slice (bd-8t0 / bd-53c) is orthogonal but related: even a
  perfect V1 producer won't heal already-fragmented history without the bd-53c backfill.

## Decision needed from David
- Approve the skill v1.1.0 patch (above) — it's a doc/skill edit, low risk, no crypto, no deploy.
- Confirm whether you want me to also send Cosmo a short reply over OGP confirming the gap list +
  that the patch is queued (vs you replying yourself). Per AUTONOMY.md I will NOT send an outbound
  federation reply without your go-ahead.
