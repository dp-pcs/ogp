# Contribution Acceptance Feedback (producer-visible unmapped/dropped signal)

**Status:** PROPOSED — design-first, not implemented. Propose-don't-deploy.
**Bead:** bd-y9ok (OGP transport-owned) — escalated from signal (bd-0bbw, agent.signal-a-dp-agent, 2026-06-07).
**Verified against source:** branch `agent/heartbeat`, `src/cli/project.ts`, `src/daemon/message-handler.ts` (2026-06-15).
**Trust-model note:** does NOT touch signed-contribution canonical fields → not escalate-before-merge,
BUT adds a new field to the ack envelope (Open Question 3) — keep it diagnostic/unsigned.

---

## Problem

A producer calls `ogp project contribute <project> <entryType> <summary>`. The contribution is
signed once and auto-pushed to every approved peer who is a project member
(`projectContribute`, `src/cli/project.ts:380-414`). Each peer's daemon verifies the signature,
checks membership, and `upsertContribution`s the record (`handleProjectContribute`,
`src/daemon/message-handler.ts`). On success it returns:

```
{ success: true, nonce, contributionId, ... }
```

The producer's auto-push loop classifies this into **acked / unconfirmed / rejected** purely on the
transport result (`success === false` → rejected, truthy → acked, null → unconfirmed).

**The gap:** `success: true` means *"the signed record landed in this peer's bus."* It does **not**
mean *"this peer's projector pack will render it."* Rendering happens **downstream of OGP** — in a
consumer-owned projector (e.g. signal's `scripts/project-to-site.mjs` + `docs/examples/pack.aicoe.json`),
which maps a fixed set of `entryType`s to render sections and **silently drops** any unmapped type
(no `note` section in the aicoe pack → `note` contributions become a no-op for that consumer).

So a producer pushing an `entryType` that a given consumer's pack does not map gets:
`success: true`, ID returned, **zero render, zero warning.** It cannot learn its contribution was a
no-op for that consumer. Concrete trigger: 2 `bd-hjoh` federation-test `note` items silently dropped
by signal's pack (bd-0bbw; those were QA junk handled via denylist, but the structural silent-no-op
remains).

This is a **transport / producer-feedback** concern owned by OGP, not by any one consumer
(escalate-don't-fork). The fix must NOT couple OGP transport to a specific consumer's pack.

---

## Design principle

OGP transport must stay **pack-agnostic** — the daemon does not own, parse, or validate any
consumer's projector pack. The fix is to give producers a **discovery path** and an **honest,
layered ack** that distinguishes *transport acceptance* from *consumer renderability*, while keeping
pack ownership entirely on the consumer side.

---

## Proposed directions (additive, pick by Open Question outcomes)

### A. Layered ack — `accepted` vs `mapped` (recommended)

Extend the `project.contribute` ack so it reports **two** booleans instead of one:

```jsonc
{
  "success": true,            // transport: signed record stored in bus (UNCHANGED meaning)
  "contributionId": "01K…",
  "acceptance": {
    "stored": true,           // == success today; record is in the consumer's bus
    "renderable": "unknown"   // "yes" | "no" | "unknown"  (consumer's best-effort pack check)
  }
}
```

- `renderable` is **best-effort, advisory, unsigned, consumer-self-reported**. A consumer that runs
  a projector pack MAY answer `yes`/`no` by checking the incoming `entryType` against its pack's
  known sections at receive time. A consumer with no pack (pure relay/store) answers `"unknown"`.
- The OGP daemon does NOT compute `renderable` — it surfaces a value the **consumer's local hook**
  optionally provides (see Direction C). Default `"unknown"` keeps transport pack-agnostic.
- Producer-side: the auto-push loop gains a 4th tally — **`unmapped`** (`stored:true` +
  `renderable:"no"`) — and prints e.g.
  `✓ 2 acked · 1 unmapped (stored but not renderable by peer X's pack) · 0 rejected`.

**Why recommended:** smallest contract change, fully backward-compatible (old peers omit
`acceptance` → producer treats as `stored:true, renderable:"unknown"`, i.e. today's behavior), and
keeps pack logic out of OGP core.

### B. Producer-queryable supported-types discovery

Add `project.supported-types` (or fold into existing `project.status`) so a producer can ask a peer
*before* contributing: *"which entryTypes does your pack render for this project?"* Consumer answers
from its pack (or `"*"` / `null` if it has no pack and stores everything). Producers then prefer
mapped types and learn the contract is **consumer-pack-dependent**.

- Pairs well with A: B is the *pre-flight* discovery, A is the *post-write* truth.
- Still pack-agnostic in OGP: the daemon just relays whatever the consumer's hook reports.

### C. Consumer-hook contract for renderability (enables A & B)

OGP already shells out to a consumer-owned intent handler with `OGP_PAYLOAD` etc.
(`executeIntentHandler`, `message-handler.ts:553+`). Define an **optional** hook contract:

- On `project.contribute`, if the consumer's handler emits a structured stdout line
  `OGP_ACCEPTANCE={"renderable":"no","reason":"unmapped entryType 'note'"}`, the daemon threads it
  into the `acceptance` block of the ack.
- On `project.supported-types`, the handler emits the pack's known types.
- Absent the hook (or no pack), OGP defaults `renderable:"unknown"` — **never blocks the store**.

### D. Documentation contract (do regardless)

Document in `docs/PROTOCOL.md` + `docs/scopes.md` that **`entryType` is consumer-pack-dependent**:
the bus accepts any signed type, but rendering is a downstream consumer-pack decision. Producers
SHOULD use a consumer's advertised types (Direction B) and treat `renderable:"unknown"` as
"may or may not render." This closes the *expectation* gap even before A/B/C ship.

---

## Backward compatibility

- Old peers omit `acceptance` → producer maps to `{stored: success, renderable: "unknown"}` → byte-for-byte
  today's UX. No flag day.
- `renderable` is advisory only; it never changes whether the record is stored or signed.
- No change to the signed canonical contribution (id/payloadStr/signature). The `acceptance` block
  rides the **unsigned diagnostic** layer of the ack.

## Non-goals

- OGP daemon does NOT parse/validate/own any projector pack.
- No mapping of `note` → a render section (that's a consumer decision — bd-0bbw resolved it via
  denylist, the right call for QA junk).
- No at-least-once / queue semantics (separate concern, bd-8rd.3).

---

## Open questions for David

1. **Scope of A:** ship just the layered ack (A) now, or A+B together so producers can pre-flight?
   A alone closes the silent-no-op; B is the nicer ergonomics but a second intent.
2. **`renderable` source of truth:** consumer-hook-reported (Direction C) keeps OGP pack-agnostic but
   relies on each consumer implementing the hook. Acceptable, or do you want a lighter "the consumer
   declares its pack types once at join time" registration instead?
3. **Trust surface:** `acceptance` is proposed as **unsigned/diagnostic** (advisory, not part of the
   signed record). Confirm that's the right call — making it signed would pull this into
   escalate-before-merge and add canonical-field churn for a non-authoritative hint.

---

*Authored by agent.ogp-a-dp-agent (heartbeat 2026-06-15). Design-first per AUTONOMY propose-don't-deploy;
no code changed. Crypto/canonical fields untouched. signal is OGP's first consumer → its friction
(bd-0bbw) is Loop-3 highest-leverage feedback.*
