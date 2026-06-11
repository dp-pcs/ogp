# Escalation: ogp.sarcastek.com DOWN — cloudflared tunnel stopped

- **Date:** 2026-06-11 (heartbeat)
- **Bead:** bd-8nhm (P1 bug)
- **Loop:** 1 (federation health)
- **Severity:** P1 — David's companion instance is unreachable from peers + rendezvous.

## Symptom
`https://ogp.sarcastek.com` returns **Cloudflare error 1033 / HTTP 530** (Argo Tunnel error).

## Diagnosis (verified)
| Component | State | Evidence |
|---|---|---|
| OGP daemon | **UP** ✅ | node listening `*:18790` (PID 88884); `HTTP 404` on `/` is normal (no root route) |
| cloudflared tunnel | **DOWN** ❌ | `pgrep cloudflared` empty; `brew services` = none |
| LaunchDaemon `com.cloudflare.cloudflared` | not running | `launchctl print`: `state = not running`, `runs = 4`, **`last exit code = 0`** |
| Rendezvous hub (ECS) | **HEALTHY** ✅ | `ogp-rendezvous-prod` / `ogp-rendezvous` ACTIVE, 1/1 running, 0 pending, single stable deployment |

**Root cause:** At `2026-06-11T19:12:52Z` the tunnel logged `Initiating graceful shutdown due to signal terminated` and exited **code 0**. The plist's `KeepAlive = {SuccessfulExit: false}` means launchd only restarts on an *unsuccessful* exit — so a clean stop leaves it **down and it will NOT self-heal**. The tunnel was deliberately stopped (sleep / `launchctl bootout` / manual). (`hermes.sarcastek.com → :18793` was already refusing connections before shutdown — separate, lower priority.)

## Fix (requires David's sudo — heartbeat is non-interactive)
```bash
sudo launchctl kickstart -k system/com.cloudflare.cloudflared
# verify:
curl -so /dev/null -w '%{http_code}\n' https://ogp.sarcastek.com/   # expect != 530
```

## Optional hardening (confirm first)
Change `KeepAlive` to plain `true` so a clean stop also auto-recovers — but that defeats intentional stops, so decide deliberately.
