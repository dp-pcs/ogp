# OGP escalation: opt-in at-least-once delivery

- **Date:** 2026-05-29
- **Raised by:** `agent.signal-a-dp-agent` (Signal — OGP's first real-world consumer) via inter-session message to the ogp agent.
- **Endorsed by:** David Proctor (direction reviewed/approved; not a directive — OGP owns the design).
- **Bead:** `bd-8rd.3` (labels: `ogp`, `signal`; parent epic `bd-8rd`).
- **Cross-silo Synapse learning:** `2643c887-66e1-4bda-960c-c2e734ae1592` (applies_to `project.ogp`, `project.signal`).
- **Status:** OPEN — captured for radar, NOT started. Awaiting real hub-offline drop traces from Signal as prioritization evidence.

> **Provenance note (resolved).** Signal originally cited a spec/decision record under
> `~/Documents/GitHub/signal/docs/` that weren't on disk — they existed only on a feature
> branch. Signal has since committed both to **signal main at `a7e30b6`**:
> `signal/docs/decisions/2026-05-29-durability-option-b.md` +
> `signal/docs/escalations/2026-05-29-ogp-at-least-once-delivery.md`. Signal diffed their
> version against this OGP-repo reconstruction: **wording differs, substance identical, no
> semantic drift.** This OGP-repo doc remains the OGP-side source of truth.

## Problem

OGP contribution push is **best-effort / fire-once**. If the receiving peer
(Signal's hub "Cosmo") is offline at send time, `POST /federation/message` fails
and the contribution is **silently dropped** — no retry, no queue, no backfill.
Signal is the first consumer to hit this; any future intent shipping data
peer→peer will hit it too.

## Hard constraints (set by David — preserve OGP's peer-to-peer founding purpose)

1. **Opt-in.** Best-effort stays the DEFAULT.
2. **Zero change to the both-peers-online happy path.** Durability engages only on send failure.
3. **Enhancement, not redesign.** No mandatory layer, no central relay, no new handshake.

## Suggested components (OGP's design call, not prescriptive)

- Outbound **queue + retry/backoff** on the sender.
- **Anti-entropy / backfill reconcile** on reconnect.
- **Replay-dedup** on `/federation/message`.
- **Collision-safe contribution IDs** — current scheme `projectId-entryType-millis`
  has no entropy (collision risk under concurrency / clock coincidence).

## Agreed design shape (in principle, with Signal — 2026-05-29)

**Sizing intel from Signal (the consumer):** contribution volume is **low + bursty,
human-initiated** (not a machine firehose). v1 = ~5 CoE leaders, **tens of
contributions/week peak**, arriving in small bursts. → Size the outbound queue to
*survive a multi-hour Cosmo outage across a few contributors*, NOT for throughput.
This tilts the design to **simple-and-correct**: durable local persist + bounded retry
+ generous TTL. A redis/heavy-queue answer would be overengineering for this load; a
local persistent queue on the sender is the right primitive.

**Two slices:**

1. **Quick-win (independent, no crypto path): collision-safe contribution IDs.**
   Current `src/daemon/projects.ts:226` builds `${projectId}-${entryTypeName}-${Date.now()}`
   — no entropy; two contributions to the same project+entryType in the same millisecond
   collide. Move to **ULID** (preferred over a random suffix): ULID's lexicographic
   time-sortability lets the **backfill cursor reuse the ID as the since-token** — one
   primitive instead of carrying id + separate timestamp. Additive, testable, touches no
   federation/crypto path. **HOLD even this until contributions flow**, so the ID change
   and the dedup design land as ONE reviewed story (avoid churning the format twice).

2. **Durability core (escalate-before-merge): durable local persist + bounded retry +
   generous TTL**, anti-entropy backfill reconcile on reconnect (cursor per peer+intent),
   replay-dedup on `/federation/message`. Touches the signed federation-message path →
   crypto/trust-model adjacent → propose, do not auto-merge.

## Status & trigger

**OPEN / unclaimed / evidence-gated.** Blocker: Signal's projector
(`feat/bus-to-site-projector`, 109/109 green) is **unmerged**, pending David's public-site
review — so no real federated contributions are flowing yet and there are no hub-offline
drops to capture. **Signal will not fabricate synthetic traces.** Trigger to un-park:
projector merged + first real federated contributor → real drops appear. Signal will then
supply traces shaped as: timestamp, contribution ID, payload size, Cosmo-offline window
(the right fields for sizing retry/backoff + TTL). When evidence arrives, attach it here and
to `bd-8rd.3`.
