# bd-8t0 — OGP daemon "stale mirror" diagnosis (2026-05-30)

**Bead:** bd-8t0 (P1, labels: ogp, signal). Blocks bd-aiz, bd-ffl.
**Reported by:** David Proctor, 2026-05-30.
**Diagnosed by:** agent.ogp-a-dp-agent during heartbeat, 2026-05-30 ~15:30 MT.

## Original symptom (as filed)
> `~/.ogp-openclaw/projects.json` last written 2026-05-20 despite daemon running (pid 1206).
> aicoe-expert-network contributions not refreshing into the local mirror. Signal consumer half
> of bd-8rd.4 fixed (configurable project id); this transport/sync half is OGP's.

## What I actually found

### 1. The "stale since May 20" reading was a file-mtime artifact, not data loss
The `~/.ogp-openclaw/projects.json` **content is internally consistent** with what that daemon
instance received. It contains all 6 aicoe-expert-network contributions that arrived on the
`.ogp-openclaw` instance (4 tool-preference, 2 model-preference). The "Standalone service live
test" and "API attribution label verification" contributions named in `daemon.log` ARE present on
disk. The May 20 mtime simply reflects "no new contribution landed on THIS instance since then."
The daemon (pid 1206, port 18790, stateDir `~/.ogp-openclaw`) is healthy and heartbeating peers.

There is **no write race**: pid 1206 owns `~/.ogp-openclaw` exclusively. The other running
`ogp start` (pid 17668) uses a **different** stateDir (`~/.ogp-hermes`, port 18793) — confirmed via
`lsof` (distinct listen sockets) and the per-process `config.json`/log file handles. So
bd-ffl (pidfile/stateDir lock) is still worth doing, but it is NOT the cause here.

### 2. The real defect: contribution state fragments across a single human's multiple daemon instances
This machine runs (at least) three OGP stateDirs:
- `~/.ogp-openclaw`  — OpenClaw daemon (pid 1206). aicoe-expert-network: **6 contribs / 2 topics**.
- `~/.ogp-hermes`    — Hermes daemon (pid 17668). aicoe-expert-network: **12 contribs / 5 topics**
  (richer: tool-preference, workflow-pattern, design-principle, config-pattern, model-preference;
  includes Apr-23 entries like "David thinks Kimi K2.6 is terrible" that `.ogp-openclaw` never got).
- `~/.ogp-meta`      — no projects.json yet.

Both `.ogp-openclaw` and `.ogp-hermes` are independent **members of the same logical project**
(`aicoe-expert-network`), but **OGP has no mechanism to reconcile project-contribution state
between a peer's own instances** (or between any two members). Each daemon's `projects.json` only
ever reflects the `project.contribute` messages that were addressed to / received by **that
specific instance**. There is no gossip / anti-entropy / pull-on-join backfill of existing
contributions.

Consequence for the consumer (Signal / aicoe-expert-network query path): whichever mirror the
consumer reads, it sees only a **partial subset** of the federation's true contribution set, and it
looks "stale" relative to the other instance. The consumer-side half (configurable project id,
bd-8rd.4) was already fixed; this transport/state-reconciliation half is OGP's, exactly as the
bead says.

### 3. Secondary issue (separate bead candidate, not the cause): notify bridge is 100% failing
Every `notifyOpenClaw` → `sessions.send` in `~/.ogp-openclaw/daemon.log` fails:
```
[OGP Bridge] sessions.send failed via wss://localhost:18789: Command failed: openclaw gateway call ...
[OGP Bridge] OpenClaw hooks.allowRequestSessionKey=false; /hooks/agent cannot be pinned to the
             target session and may run in the default hook session instead.
```
This does NOT cause the stale-mirror symptom (persistence happens in `contributeToProject` →
`saveProjects()` BEFORE the notify call in `handleProjectContribute`). But it means inbound
federation items are not being surfaced to David's configured Telegram target as intended, and the
`/hooks/agent` fallback warning suggests a gateway config gap (`hooks.allowRequestSessionKey=false`).
Worth its own bead.

## Proposed fix direction (PROPOSE — do not auto-ship; npm release discipline applies)
Options, smallest-first:

A. **Pull-on-join backfill (recommended first step).** When a daemon joins/learns of a project, it
   issues a `project.query` (no entryType filter, or a "full export" variant) to known members and
   merges returned contributions by contribution `id` (idempotent union; ids are
   `${projectId}-${entryType}-${ts}`, already unique). This makes a fresh/partial mirror converge to
   the union without a continuous protocol.

B. **Anti-entropy sync interval.** Periodic union-merge with project members (digest of known
   contribution ids → request missing). More moving parts; defer.

C. **Out of scope / explicitly reject:** auto-merging *across a single human's own instances* by
   filesystem scanning of sibling stateDirs. Tempting but wrong — it bypasses the protocol and the
   trust model. Convergence must happen over signed OGP messages, not by reading peer dirs.

Merge semantics must be **union by contribution id**, never overwrite (preserves the
event-log-plus-derived-views model that Cosmo/AICOE described — see the V1 field spec in daemon.log
agent-comms from "AI CoE Team - Cosmo").

## NOT touched / hard rules respected
- No npm publish, no ECS deploy, no daemon restart/kill performed.
- No crypto/Ed25519 code changed (any signed-message backfill design = escalate-before-merge).
- Bead bd-8t0 claimed; this doc + a `bd remember` note are the durable artifacts.

## Verification evidence
- `lsof -nP -iTCP -sTCP:LISTEN` → pid 1206 :18790, pid 17668 :18793 (distinct).
- per-pid `config.json` stateDir: 1206→`~/.ogp-openclaw`, 17668→`~/.ogp-hermes`.
- `projects.json` content counts: openclaw 6/2, hermes 12/5 (same project id `aicoe-expert-network`).
- `ogp --version` = 0.7.2 = `npm view @dp-pcs/ogp version`; `/opt/homebrew/bin/ogp` → repo `dist/cli.js`.
- src: `src/daemon/projects.ts` `contributeToProject()` persists per-instance; no cross-member sync exists.
