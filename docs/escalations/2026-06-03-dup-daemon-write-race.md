# Escalation: OGP daemon dup-start write-race (recurring)

- **Filed by:** agent.ogp-a-dp-agent
- **First observed:** 2026-05-31 (pid 17668 rogue)
- **Recurred:** 2026-06-03 (pid 2091 rogue) — this doc
- **Related beads:** bd-8t0 (mirror staleness symptom), bd-ffl (the fix), bd-53c (retroactive backfill)
- **Severity:** P1 federation-health (Loop 1). Corrupts the consumer mirror that signal + aicoe-expert-network read.

> Note: a prior comment on bd-8t0 cited `docs/escalations/2026-05-31-dup-daemon-write-race.md`.
> That file was never actually written. This doc is the real authoritative artifact and
> supersedes that phantom citation.

## Symptom

`~/.ogp-openclaw/projects.json` shows project-slice-specific staleness (e.g. the
aicoe-expert-network slice frozen at `updatedAt=2026-05-20`) even though the whole file's
mtime keeps advancing and the daemon appears healthy. Consumer mirrors fragment: a peer holds
N contributions, the local mirror shows only a few.

## Root cause

Two `ogp start` daemon processes run concurrently against the **same stateDir**
(`~/.ogp-openclaw`). They do NOT share a bind port — the second loses `EADDRINUSE` on the
canonical port (18790) and falls back to 18793 — but both hold write file descriptors on
files under the shared stateDir (`daemon.log`, and the `projects.json` rewrite path). The
interleaved writes fragment the mirror.

### 2026-06-03 occurrence specifics (new, important)

Both processes started **the same second** (Jun 2 09:40:53):

| pid  | role     | port  | pidfile owner | stateDir            |
|------|----------|-------|---------------|---------------------|
| 2090 | canonical| 18790 | yes (daemon.pid=2090) | ~/.ogp-openclaw |
| 2091 | rogue    | 18793 (EADDRINUSE fallback) | no | ~/.ogp-openclaw |

This was **not** a human running `ogp start` twice minutes apart (the 2026-05-31 framing).
It was a **concurrent self-race at a single startup** — most likely a supervisor / launchd
double-fire or a fork without a lock. That changes the fix requirement (below).

## Stopgap remediation (applied both times)

Identify canonical pid via `daemon.pid` + the proc listening on 18790 (the
`ogp.sarcastek.com` backend); SIGTERM the rogue (the one on the fallback port). Verify a
single `ogp start` remains, sole listener on 18790, backend still responds.

```
kill <rogue_pid>
ps aux | grep -E "ogp (start|daemon)" | grep -v grep   # expect exactly one
cat ~/.ogp-openclaw/daemon.pid                          # == canonical pid
lsof -nP -iTCP -sTCP:LISTEN | grep 1879                 # only canonical on 18790
```

This is a stopgap. The dup respawns on the next startup race.

## The fix (bd-ffl) — design requirements

A naive "if pidfile exists, refuse" guard has a **TOCTOU window**: two same-instant starts
both read "no pidfile" and both proceed. The fix MUST be:

1. **Atomic acquisition** — create the pidfile with `O_CREAT | O_EXCL` (or hold an `flock`
   on a lockfile) **before** binding the port. Exactly one of two simultaneous starts wins;
   the loser sees EEXIST/EWOULDBLOCK and exits clean.
2. **Key on stateDir, not port** — confirmed across both incidents that dups differ by port
   but share stateDir. The port-based guard (EADDRINUSE) is precisely what fails open today
   (it falls back to 18793 instead of refusing).
3. **No EADDRINUSE fallback to an alternate port** while another daemon owns the stateDir.
   Fail loud and exit, don't silently start a fragmenting shadow daemon.
4. **Stale-lock recovery** — if the pidfile names a dead pid, reclaim it (so a crashed daemon
   doesn't permanently wedge restarts).

## Retroactive heal (bd-53c)

Killing the dup stops *further* fragmentation but does not restore already-missing disjoint
contributions. The frozen aicoe-expert-network slice still needs the bd-53c pull-on-join
backfill (signed `project.query` + idempotent union-merge by contribution id). bd-53c is
currently blocked on the CLI exposing contribution ids + a persist path from `query-peer`.
