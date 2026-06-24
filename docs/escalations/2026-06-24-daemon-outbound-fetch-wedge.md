# Escalation: OGP daemon outbound-fetch wedge (Loop 1 federation health)

- **Date:** 2026-06-24
- **Reporter:** agent.ogp-a-dp-agent (heartbeat, Loop 1)
- **Bead:** bd-sj90 (P1, project:ogp)
- **Memory key:** `ogp-daemon-fetch-wedge`
- **Severity:** federation peer discovery/signaling DOWN on David's node; degraded (not full) — direct/relay fallback may still carry both-online sends.
- **Status:** AWAITING DAVID — recommend a daemon restart (state change on his live instance; not auto-performed).

## Symptom

David's per-user OGP companion daemon (`https://ogp.sarcastek.com`, pid 41781, up ~4h since
10:19 local) is logging continuous outbound-fetch timeouts in `~/.ogp-openclaw/daemon.log`
(17 MB, actively written):

| Pattern | Count in current log |
|---|---|
| `[OGP] Rendezvous transport lookup failed: The operation was aborted due to timeout` | 3008 |
| `Send failed: 502` | 9446 |
| `[OGP] Rendezvous heartbeat failed: ... timeout` | 906 |
| `[OGP] Could not detect public IP: ... timeout` (api.ipify.org) | present |

All hit the daemon's 8 s `AbortSignal.timeout`. The peer health loop still runs
(`Checking health of 4 peer(s)` / `Health check completed`).

## Root cause: LOCAL DAEMON, not the rendezvous server

Proven by probing the exact endpoints the daemon's rendezvous client uses
(`src/daemon/rendezvous.ts`) **from the host shell**, which all respond healthy and fast:

| Endpoint (daemon path) | Shell result |
|---|---|
| `GET https://rendezvous.elelem.expert/` | **200** in 0.23 s |
| `POST .../register` (rendezvous.ts:242) | **400** (rejects empty body) in 0.23 s — server alive |
| `GET .../peer/{pubkey}` (rendezvous.ts:359/449) | **404** `{"error":"Peer not found"}` in 0.24 s |
| `https://api.ipify.org` (rendezvous.ts:174) | reachable from shell |
| daemon's own `GET /federation/ping` | **200** in 0.15 s |

So: **host network is fine, the rendezvous server is independently healthy, and the daemon's own
HTTP listener is fine** — only the long-running daemon *process's* outbound `fetch()` is wedged.
Because it breaks an unrelated third-party endpoint (ipify) too, this is **not** rendezvous-specific
and **not** a server fault. Classic signature of a **Node `fetch`/undici connection-pool or
DNS-resolver wedge inside a long-lived process**.

## Impact

- Rendezvous-mediated **peer discovery + transport lookup is non-functional** on David's node
  until cleared (`GET /peer/{pubkey}` always times out → no relay/iroh address resolution).
- Rendezvous **re-registration/heartbeat fails** → David's node will eventually age out of the
  rendezvous registry for other peers.
- Both-online **direct** sends may still succeed via cached/fallback transport, but at-least-once
  relay + discovery paths are degraded.

## Recommended fix (escalate-don't-auto-do)

**Restart the daemon** to recreate the fetch agent / DNS state:

```
ogp restart
# or: kill 41781 && relaunch via the macOS LaunchAgent
```

- Low risk; standard remedy for a process-local outbound wedge.
- **This is the per-user companion daemon, NOT the rendezvous-server deploy** — the AUTONOMY hard
  rules ("never auto-deploy the rendezvous server") do not apply, but restarting David's *live*
  instance is still a state change, so it's left for David's go-ahead.

After restart, confirm recovery by tailing `~/.ogp-openclaw/daemon.log` for the disappearance of
`Rendezvous ... timeout` and a successful `register`, and re-probing `GET /peer/{pubkey}` succeeds
from the daemon (peer health returns reachable).

## Relationship to other beads

- **Distinct from bd-ntoj** ("no AWS read access to rendezvous account"): that blocks *verifying*
  the ECS service; here the server is independently proven healthy from shell, and the fault is
  client-side in the daemon.

## Follow-up hardening to consider (separate work, not blocking the restart)

- Add a daemon self-watchdog: N consecutive outbound timeouts across *unrelated* hosts →
  auto-recreate the global `fetch`/undici dispatcher (or self-restart) instead of silently
  spinning until a human notices.
- Surface a `lastRendezvousOk` / `outboundHealthy` field on `/federation/ping` so Loop 1 can
  detect this state without parsing 17 MB of logs.
