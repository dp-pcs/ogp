# Escalation — 502 storm: bd-ydjk fix is NOT shipped (restart alone won't help)

**Date:** 2026-06-29 ~04:20 MDT
**Author:** agent.ogp-a-dp-agent (heartbeat Loop 1)
**Beads:** bd-ydjk (down-peer backfill skip), bd-w6jm (outbound-failures counter wrong)
**Status:** ESCALATE — needs David's call (deploy + federation/crypto-adjacent path = escalate-before-merge)

## Live symptom (confirmed)
- Daemon PID 31911, started **Wed Jun 24 14:21**, still running.
- `~/.ogp-openclaw/daemon.log`: **518× "Send failed: 502" per last 1000 lines**, still growing.
- Peer "AI CoE Team - Cosmo" (302a...75ffa868) flapping `established → degraded-inbound`.
- Own infra GREEN: `/federation/ping` 200, rendezvous `{ok:true,peers:3}`. The 502 origin is the *peer's* endpoint.

## Correction to prior heartbeat assumption
Prior heartbeat said: *"a daemon restart should pick up the shipped fix."* **That is wrong.**

The bd-ydjk fix (commit `9307598`, Jun 26) exists **only on branch `agent/heartbeat`**, which is
**38 commits ahead of `main`**. Verified:
- Primary checkout `~/Documents/GitHub/ogp` is on `main` @ `f265d2b`.
- `git merge-base --is-ancestor 9307598 main` → **NO** (fix not in main history).
- `src/daemon/heartbeat.ts` on main: **0** occurrences of the down-skip filter.
- `dist/daemon/heartbeat.js` + `dist/cli.js` dated **Jun 24 09:01** (pre-fix build).
- npm `@dp-pcs/ogp@0.11.4` symlinks to the primary checkout's `dist/cli.js`.

So the *running daemon AND the installed package AND the build artifact are all pre-fix.*
**A restart of PID 31911 re-runs the same stale main code → 502 storm continues.**

To actually deliver the fix, the chain is:
1. Land 9307598 onto `main` (merge `agent/heartbeat` work, or cherry-pick the targeted commits).
2. `npm run build` (tsc) to refresh `dist/`.
3. Restart the daemon (and/or `npm publish` a patch release for the fleet).

## Coverage gap (still real after the fix)
The shipped filter is `listPeers('approved').filter((p) => p.healthState !== 'down')`.
Cosmo flaps to **`degraded-inbound`**, not `down` — so it stays in the backfill fan-out set and
keeps getting `project.query` → 502 even after the fix lands. The fix addresses steady-`down`
peers (Apollo-style), not flapping degraded peers. A follow-up should decide whether
`degraded-inbound`/`degraded-outbound` peers should also be skipped from backfill.

## bd-w6jm confirmed live
Logs print `outbound failures: 0` while 502s fire — the outbound-failure counter is not
incrementing on these failures. Counter logic still wrong.

## What I did NOT do (per escalate-before-merge)
No merge, no rebuild, no `npm publish`, no daemon restart. Federation/backfill path; deploy action
is David's call.

## Recommended decision
- **Don't bother restarting yet** — it won't help against stale main.
- Decide: merge `agent/heartbeat`→`main` (38 commits, includes much more than this fix) vs.
  cherry-pick `9307598` (+ test commit) onto a clean main → rebuild → restart.
- Separately address the `degraded-inbound` coverage gap before assuming Cosmo's 502s clear.

## Update — clean unblock vehicle is PR #86
PR **#86** (`fix/backfill-down-skip-bd-ydjk` → `main`, OPEN + MERGEABLE) isolates exactly the
bd-ydjk fix as a **single commit** (`f2c70e8`, the fix + `test/backfill-down-skip.test.ts`). So the
unblock does NOT require merging the 38-commit `agent/heartbeat` branch — just merge #86.

Recommended chain: merge #86 → `npm run build` → restart daemon (and/or `npm publish` patch).
Coverage gap unchanged: #86 only skips `healthState==='down'`, so Cosmo's `degraded-inbound`
flapping still 502s until degraded peers are also handled.
