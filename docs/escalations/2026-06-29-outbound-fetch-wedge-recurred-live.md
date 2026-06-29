# ESCALATION — Outbound-fetch wedge RECURRED live on David's daemon (2026-06-29 ~12:18 MDT / 18:18Z)

**Severity:** P1 — federation discovery degraded on the live per-user daemon.
**Status:** Awaiting David. Remediation = deploy actions (restart + ship bd-kclo) → NOT auto-done
(propose-don't-deploy; no auto npm release; no auto daemon restart).

## What happened
The **outbound-fetch wedge** first seen in **bd-sj90 (2026-06-24)** has **recurred** on the live
daemon. The daemon's HTTP server is up, but its **egress to the rendezvous is fully wedged**: every
rendezvous transport-lookup and heartbeat fetch aborts at the 30s timeout.

### Live evidence (live log `~/.ogp-openclaw/daemon.log`, NOT stale `~/.ogp/daemon.log`)
- Daemon PID **31911** (started **Jun 24 14:21** — pre-fix; same long-lived process as bd-sj90 era).
- Newest tail is **100% wedge signatures**:
  - `[OGP] Rendezvous transport lookup failed: The operation was aborted due to timeout`
  - `Request timed out after 30000ms`
  - `[OGP] Rendezvous heartbeat failed: The operation was aborted due to timeout`
- Density / acceleration:
  - last **1000** lines: **500×** transport-lookup-failed, **143×** heartbeat-failed, **214×** `Request timed out after 30000ms`
  - last **5000** lines: 578× / 165× / 244× → i.e. the rate **accelerated sharply** into the most
    recent window (most failures are in the newest 1000 lines).
  - **0** successful rendezvous lookups in the last 1000 lines.
  - 25s live re-tail: +9 new lines, **all wedge signatures**.
- The earlier **502-storm** (bd-ydjk) has gone quiet (0×/1000) — not because it healed, but because
  the daemon can no longer reach rendezvous to look up transports to send to. The wedge superseded it.

### The blind-spot, confirmed
`https://ogp.sarcastek.com/federation/ping` → **200** in 0.21s the entire time. This is precisely the
bd-sj90 / bd-kclo blind spot: **HTTP server healthy while egress is wedged.** Loop 1's public-endpoint
check alone would have reported GREEN.

### Mesh impact
`https://rendezvous.elelem.expert/` → `{"ok":true,"peers":2}` (was **peers:3** all of 06-28→06-29
morning). Consistent with David's daemon failing to re-register / dropping out of the peer mesh while
its egress is wedged.

## Remediation (David's call — both are deploy actions)
1. **Immediate:** restart the daemon (`ogp restart` / kill+`ogp start`) to rebuild the wedged
   undici connection-pool / DNS-resolver state. Clears the wedge now (same manual fix as bd-sj90).
2. **Durable:** ship **bd-kclo** — already implemented + verified, NOT yet deployed:
   - branch `agent/bd-kclo-outbound-watchdog`, commit **e168657**
   - `src/daemon/outbound-health.ts` `OutboundHealthWatchdog`: trips after 5 consecutive failures
     across ≥2 distinct hosts, recreates the global undici dispatcher to self-recover.
   - `/federation/ping` now exposes `outboundHealthy` + per-host `lastOutboundSuccess` — would have
     made THIS incident visible without log-diving.
   - `npm run build` clean; `vitest` 574/574 pass. Ready for review/merge → npm release.

This incident is the live justification for bd-kclo: the wedge recurred exactly as predicted, the
watchdog would have auto-recovered it, and the health field would have flagged it immediately.

## What this agent did (no deploy, escalate-before-merge / no-auto-deploy honored)
- Added live-evidence comment to bd-kclo.
- Wrote this escalation doc + committed.
- Telegram heads-up to David.
- No restart, no merge, no npm publish, no ECS touch.
