# Escalation: OGP local mirror stale for aicoe-expert-network (bd-8t0)

- **Date:** 2026-05-30
- **Filed by:** agent.ogp-a-dp-agent (ogp project agent)
- **Source:** signal agent handoff (consumer/federation escalation per OGP-coupling boundary)
- **Bead:** bd-8t0 (P1, labels ogp+signal) — full root cause in the bead DESCRIPTION
- **Durable note:** `bd recall bd-8t0-mirror-stale-rootcause`
- **Cross-silo Synapse learning:** 2bdfcae3 (applies-to project.ogp, project.signal)
- **Related (consumer side, already fixed):** bd-8rd.4 — branch `fix/bd-8rd.4-configurable-project-id` (David review pending)

## Premise correction
The handoff framed this as "projects.json isn't being rewritten / aicoe contributions aren't
present." Reality: **`aicoe-expert-network` IS in `~/.ogp-openclaw/projects.json`** with 6
contributions (4 `tool-preference` + 2 `model-preference`). The problem is they are **stale** —
newest contribution timestamp is `2026-04-22T01:52:31Z` (~5 weeks old). The file mtime `2026-05-20`
is an unrelated whole-file rewrite; the aicoe topic data itself stopped advancing on Apr 22.

## Evidence
1. **Dual daemon, one stateDir.** Two `ogp start` processes share `~/.ogp-openclaw`:
   - pid **1206** (started 2026-05-22) — owns daemon port **18790**, writes `daemon.pid`.
   - pid **17668** (started 2026-05-29) — listens on **18793**, holds ESTABLISHED conn to AWS
     `52.0.149.96:443` (rendezvous).
   Two daemons writing the same `projects.json`/`peers.json` is a race hazard.
2. **Stale gateway auth token → bridge 100% broken.** `daemon.log` shows all **88** gateway bridge
   calls use `--token 1129a9023b...` and **all fail** (`Command failed: openclaw gateway call ...`).
   `config.json` (mtime **May 8**) carries `openclawToken=e625...` / `openclawHooksToken=fcf57...` —
   *older* than the daemon's token. The daemon cached the gateway's then-current token at startup
   (May 22); the OpenClaw gateway has since restarted (now pid **76656**) and rotated its token, so
   the daemon is holding a dead token and every `sessions.send` / sync-note 401s.
3. **No fresh contributions arriving.** Recent `daemon.log` is 100% heartbeat noise
   (`Checking health of 4 peer(s)... completed`) plus the failing-bridge backlog. No recent
   `[OGP] ... contributed to 'AICOE Expert Network'` events — nothing new from the peer to write.

## Diagnosis (two coupled faults)
- **A — daemon/auth:** stale gateway token after a gateway restart breaks the OpenClaw bridge; the
  daemon can't refresh the token without a restart. The sync/notify path is dead even if data arrived.
- **B — upstream/peer:** no new aicoe contributions have reached this daemon since Apr 22, so part of
  "mirror is stale" is simply "nothing new to write." Needs confirmation from the source peer
  (Cosmo @ Clawporate / `302a...738064be`) whether they are still contributing.

## Recommended fix (ESCALATE — production daemon lifecycle; do NOT auto-execute per AUTONOMY.md)
1. Resolve the dual daemon: pick the canonical instance, stop the other; one daemon per stateDir.
2. Clean restart of the canonical daemon so it picks up the current gateway token.
3. Re-verify: trigger/await a fresh aicoe contribution from the peer; confirm `projects.json` mtime
   advances **and** a new aicoe contribution timestamp appears.

## Product follow-ups (OGP code — separate bead candidate)
- Daemon should detect gateway-token rotation and re-auth **without a full restart** (watch
  `config.json` or re-read token on 401), instead of silently failing 88x into the log.
- Guard against two daemons sharing one stateDir (pidfile lock / refuse on port-in-use).
