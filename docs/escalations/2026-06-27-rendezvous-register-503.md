# Escalation — Rendezvous register/heartbeat 503 (daemon discovery-drop risk)

- **Bead:** bd-iv6c (P1, bug) — depends on bd-ntoj
- **Found:** 2026-06-27 heartbeat (Loop 1 federation sweep), agent.ogp-a-dp-agent
- **Synapse session:** synapse-9b9ce651
- **Severity:** P1 — not a hard outage (reads work), but David's daemon may age out of peer discovery if register keeps failing.

## Symptom

David's daemon at `https://ogp.sarcastek.com` is **read-healthy but cannot register/heartbeat** to the rendezvous server `https://rendezvous.elelem.expert`.

`~/.ogp/daemon.log` (last 500 lines):
- **397** lines = `[OGP] Rendezvous heartbeat failed: Rendezvous register returned 503`
- Only related non-503 lines = `[OGP] Deregistered from rendezvous`
- No successful register/heartbeat in the recent window.

## What still works (probed this cycle)

| Probe | Result |
|---|---|
| `GET https://rendezvous.elelem.expert/` | `200 {"ok":true,"peers":3}` (0.30s) |
| `GET https://ogp.sarcastek.com/federation/ping` | `200` (0.12s) |
| `GET https://ogp.sarcastek.com/.well-known/ogp` | `200` v0.11.4 ("David - Junior") |
| `GET .../register`, `.../peers` | `404` (POST-only endpoints; 404-on-GET expected) |

So the rendezvous service answers `GET /` but **503s the daemon's register POST**. This is a server-side register-path failure, not a daemon-network problem.

## Risk

If register keeps 503-ing, David's daemon stops refreshing its rendezvous TTL and **ages out of peer discovery**. The `peers:3` reported by `/` may be other peers and/or stale state — it does **not** confirm David's daemon is currently discoverable. Other peers will eventually fail to find David's node.

## Why this is escalated, not fixed

- Rendezvous server is **AWS ECS Fargate** (cluster `ogp-rendezvous-prod` / service `ogp-rendezvous`, **account 913524910742**, us-east-1). Per AUTONOMY.md: **never auto-deploy the rendezvous server.**
- This shell's AWS creds are account `943347375834` (`bragging-rights-dev`), **not** 913524910742 — ECS/CloudWatch for rendezvous are unverifiable from here (tracked as **bd-ntoj**). So I can't read why `/register` 503s while `/` 200s.

## Asks for David

1. Check rendezvous ECS service health + CloudWatch logs (acct 913524910742) for why **`POST /register` returns 503** while `GET /` returns 200 — likely a backing-store / register-handler fault, a memory/throttle limit, or a partial deploy.
2. Confirm whether the reported `peers:3` includes David's own daemon or is stale TTL state.
3. If the daemon needs a kick after the server recovers: `ogp` deregister/re-register (do not have the agent touch ECS).

## Distinct from

- **bd-ydjk** (#86): down-peer 502 storm in contribution backfill — that's outbound to a *dead peer* (hermes/Apollo), different failure.
- **bd-ntoj**: no AWS read access to rendezvous account — the visibility blocker this depends on.
