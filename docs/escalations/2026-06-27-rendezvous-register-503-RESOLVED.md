# RESOLVED — Rendezvous register/heartbeat 503 was a FALSE ALARM (stale log)

- **Bead:** bd-iv6c (P1, bug) — **resolve as not-a-bug**
- **Resolved:** 2026-06-27, agent.ogp-a-dp-agent (Telegram-thread session)
- **Supersedes:** `2026-06-27-rendezvous-register-503.md`

## TL;DR

David's daemon **is registered and discoverable right now.** The "397/500 lines = 503"
finding was read from the **wrong (stale) log file**. No ECS action is needed.

## Root cause of the false alarm

| What the original escalation read | Reality |
|---|---|
| `~/.ogp/daemon.log` — 397/500 lines "register returned 503" | That file is **frozen at Apr 8 14:52** and belongs to **old daemon identities** (pubkeys `9a8bcbd155…`, `c306860469…`). |
| "still 503-ing right now" | The live daemon does **not** write to that file. |

The **live** daemon is **PID 31911** (`/opt/homebrew/bin/ogp start`, running since Wed),
using stateDir **`~/.ogp-openclaw/`** and logging to **`~/.ogp-openclaw/daemon.log`**
(18 MB, last write Jun 27 05:21). Its current pubkey is `93297a1a…` (matches
`/.well-known/ogp`). The Apr-8 `~/.ogp/daemon.log` is a different, retired stateDir.

## Live verification (2026-06-27)

| Probe | Result |
|---|---|
| `GET https://rendezvous.elelem.expert/peer/<david-pubkey 93297a1a…>` | **200** — `lastSeen` age **8 s**, full identity card, `transport: relay` (`wss://rendezvous.elelem.expert/relay`) |
| `GET rendezvous /` | `200 {"ok":true,"peers":3}` |
| `POST rendezvous /register` (bad sig) ×8 | **401** every time (Express reachable; `x-powered-by: Express`) — **never 503** |
| Live daemon log, recent rendezvous lines | `[OGP Heartbeat] Checking health of 4 peer(s)… Health check completed` — **no recent 503** |

`age 8 s` = the daemon re-registered 8 seconds before the probe. Register/heartbeat **works**.

## Answers to the two asks

1. **Why does POST /register 503 while GET / 200s?** — It **doesn't, currently.** From an
   external shell the register path returns a clean Express 401 on a bad signature and is
   reachable/fast. The rendezvous **source has no 503 code path at all** (register is an
   in-memory `peers.set()`); any historical 503 would have been a transient infra/ALB window
   (no healthy target during a deploy/restart), not an application fault. The 503s in the
   **stale** Apr-8 log were a past transient that no longer reflects reality.
2. **Does `peers:3` include David's daemon?** — **Yes.** Confirmed by direct
   `GET /peer/<pubkey>` → 200 with an 8-second-fresh `lastSeen`. Not stale TTL state.

## Action items

- **No ECS / rendezvous deploy action required.** Server is healthy; daemon is discoverable.
- **bd-iv6c → close (not-a-bug / false alarm).**
- **bd-ntoj** (no AWS read into acct 913524910742): still a *nice-to-have* for future Loop 1
  rendezvous-internal verification, but it was **NOT** blocking here — the bug was diagnosable
  entirely from the daemon side + external probes. Note the `prod-aicoe-admin` profile David
  cited on 2026-06-26 now returns **ExpiredToken**, so that read path needs a creds refresh
  before it's usable unattended.

## Lesson for Loop 1 (federation health)

**Before trusting log-line counts, confirm which log file the *live* daemon writes.**
Cross-check `ps aux | grep ogp` → the running PID's stateDir → that stateDir's `daemon.log`.
Here the heartbeat was tailing a retired stateDir (`~/.ogp/`) while the active daemon lived
in `~/.ogp-openclaw/`. A stale log produced 397 phantom 503s and a P1 escalation for a
healthy system. The authoritative liveness check is **`GET rendezvous /peer/<own-pubkey>`
and inspect `lastSeen` freshness** — not log greps.
