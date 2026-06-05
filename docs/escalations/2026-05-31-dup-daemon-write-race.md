# Escalation: Duplicate OGP daemon write-race (frozen aicoe-expert-network mirror slice)

- **Date:** 2026-05-31
- **Source:** agent.signal-a-dp-agent heartbeat escalation (escalate-don't-fork)
- **Beads:** bd-8t0 (bug), bd-ffl (pidfile/stateDir lock fix), bd-53c (durable reconciliation)
- **Severity:** P1 — affects signal's consumer half (aicoe-expert-network slice frozen)

## Symptom
`~/.ogp-openclaw/projects.json` whole-file rewrites fine (mtime May 30 15:18), but the
`aicoe-expert-network` slice is frozen: `updatedAt=2026-05-20T13:30:36Z`, contribs=6, latest
contribution timestamp `2026-04-22`. Staleness is project-slice-specific, not file-wide.

## Live diagnosis (2026-05-31)
TWO `ogp start` daemons on the same stateDir `~/.ogp-openclaw/`:

| PID   | Started     | Port  | cwd               | Role |
|-------|-------------|-------|-------------------|------|
| 1206  | 22 May 2026 | 18790 | `/`               | **CANONICAL** — pidfile (`daemon.pid`) owner; port 18790 is the ogp.sarcastek.com tunnel backend |
| 17668 | 29 May 2026 | 18793 | `~/clawd-ogp`     | **ROGUE DUP** — hit `EADDRINUSE` trying to bind 18790, fell back to 18793 |

**Key correction to signal's hypothesis:** the duplicate does NOT share the bind port (18790 vs
18793) — `EADDRINUSE` in `daemon.log` proves the second instance failed the port bind. BUT both
processes share the same **stateDir** and both hold write handles to
`~/.ogp-openclaw/daemon.log` (verified via `lsof`), so both mutate `projects.json` / `peers.json`.
That is the bd-ffl write-race: a port lock alone would NOT have caught this (dup got a different
port yet still raced the files). **The lock must key on stateDir, not (only) port.**

## Actions taken
1. **Killed rogue dup pid 17668** (canonical 1206 left running). Immediate fix for the frozen slice.

## Asks → status
1. Resolve duplicate daemon — **DONE** (killed 17668).
2. Ship bd-ffl pidfile/stateDir lock so `ogp start` refuses a second instance on the same
   stateDir — **OPEN**, design note added: lock on stateDir, not port.
3. bd-53c pull-on-join backfill — **OPEN**, durable reconciliation fix (escalate-before-merge,
   crypto-adjacent signed-message backfill).

## Verification owed
signal to re-verify the aicoe-expert-network slice refreshes after the dup is cleared (may also
need bd-53c backfill since the slice's missing contributions live in a disjoint peer stateDir per
bd-53c proof — clearing the dup stops further fragmentation but may not retroactively heal the
already-frozen subset).
