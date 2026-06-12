# bd-8t0 root cause: aicoe-expert-network membership bound to a rotated-out identity key

**Date:** 2026-06-12
**Author:** agent.ogp-a-dp-agent
**Bug:** bd-8t0 (P1) — "OGP daemon mirror stale", remaining transport/sync half
**Class:** crypto/identity-trust path → **escalate-before-merge, propose-don't-deploy**
**Status:** ROOT CAUSE FOUND. Awaiting David's go on the membership-reconcile fix.

## Refreshed premise (signal heartbeat 2026-06-12, re-verified by ogp agent)

1. Title pid 1206 is DEAD. Live daemon is **pid 33285** (`/opt/homebrew/bin/ogp start`,
   started Tue 1:55 PM). Single instance, sole listener on 18790 — no dup-daemon write-race
   active. So bd-ffl (dup lock) is NOT the cause of the *current* freeze.
2. `~/.ogp-openclaw/projects.json` mtime **Jun 5 15:28** — stale despite a live daemon.
   Symptom (mirror not refreshing the aicoe slice) is real and current.
3. Mirror's aicoe slice frozen: `updatedAt=2026-05-20T13:30:36Z`, 2 topics
   (tool-preference=4, model-preference=2), latest contrib `2026-04-22T01:52:31Z`. No new
   aicoe-expert-network contributions landing.

## Root cause — orphaned membership under a rotated-out key

The aicoe-expert-network project's `members` array is:

```
"302a300506032b6570032100738064be…"   <- ROTATED-OUT identity key (short: 738064be)
"david@theproctors.cloud"
```

The **current** daemon identity (`~/.ogp-openclaw/keypair.json`) is:

```
302a300506032b657003210093297a1af89f8987e67b04fdc3fc2def7ca81c876df99244511fa1afd037b7ac
short: 93297a1a
```

`93297a1a` is **NOT** a member of aicoe-expert-network. The membership is pinned to the
old `738064be` key David no longer signs with.

### Why this silently drops writes (the exact mechanism)

`contributeToProject()` in `src/daemon/projects.ts:307`:

```ts
if (!project.members.includes(authorId)) {
  return null;   // <- silent drop: no error, no mirror write
}
```

This is an **exact** `members.includes(authorId)` string match on the FULL key (not the
canonicalized 32-char form used by ownership). New aicoe contributions arrive authored under
the current full key `302a…93297a1a`; the member list only contains `302a…738064be`. No
match → `return null` → no `saveProjects()` → **mirror never refreshes**. No log, no throw —
which is precisely the "daemon-driven mirror write isn't firing" symptom with a healthy daemon.

This is the **same orphaned-rotated-key membership class** signal's agent already diagnosed
and fixed for THEIR slice on 2026-06-02 (local 'signal' project was orphaned under rotated-out
`…738064be`; current identity `…93297a1a`; fixed via `project join signal`). The `signal`
slice now updates fine (Jun 5). The aicoe slice was never reconciled — same key, same bug,
unfixed half.

## Proposed fix (NOT executed — crypto/trust path, awaiting David)

Membership reconciliation, mirroring the signal fix:

```
ogp project join aicoe-expert-network      # under the current identity (93297a1a)
```

This adds `…93297a1a` (or `david@theproctors.cloud`, whichever the contribute path uses as
authorId) as a member so subsequent aicoe contributions pass the membership gate and write.

**Open questions for David before running:**
- Which authorId does the live aicoe contribute path send — the full current key, or the
  `david@theproctors.cloud` email handle? The email IS already a member, so if contributions
  are authored as the email, the gate should pass and something else blocks the write — needs
  a live contribute trace to disambiguate. If contributions are authored as the raw key, the
  `project join` is the fix.
- Should the stale `…738064be` member entry be pruned, or left for historical attribution?

## Healing already-missing contribs

Reconciling membership stops further drops but does NOT retroactively restore aicoe contribs
authored during the frozen window. That retroactive heal is **bd-53c** (pull-on-join backfill
via signed `project.query` + idempotent union-merge by contribution id) — still the PRIMARY
structural fix; this membership reconcile is the *forward* fix that stops new drops.

## Code hardening candidate (separate, propose-don't-deploy)

The silent `return null` on membership-miss is a footgun: a rotated key turns every
contribution into a no-op with zero operator signal. Candidate hardening (NOT in scope for the
bug fix, file as follow-up): have the daemon LOG a warning when an inbound contribution is
dropped for non-membership (`authorId not in members for <projectId>`), so the next rotated-key
freeze surfaces in `daemon.log` instead of going silent for weeks.

## Evidence
- `jq` over `~/.ogp-openclaw/projects.json`: aicoe members = `[738064be…, david@theproctors.cloud]`, updatedAt 2026-05-20.
- `~/.ogp-openclaw/keypair.json` publicKey = `…93297a1a` (current identity).
- `src/daemon/projects.ts:307` — `if (!project.members.includes(authorId)) return null;`
- signal bd-8t0 comment 2026-06-02 — identical rotated-key (`738064be` → `93297a1a`) orphaned-membership pattern, fixed via `project join`.
