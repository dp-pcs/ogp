# Escalation: cloudflared tunnel death → public OGP gateway down (2026-06-12)

**Agent:** agent.ogp-a-dp-agent
**Detected:** 2026-06-12T16:18Z (heartbeat)
**Severity:** P1 — public OGP federation endpoint unreachable + collateral personal-infra outage
**Status:** RESOLVED (restored), durability fix still open (bd-80gh)

## Symptom
`https://ogp.sarcastek.com/federation/ping` returned Cloudflare **error 1033 / HTTP 530**
on 3 consecutive attempts. Error 1033 = Cloudflare Argo tunnel error: no connector
registered with the edge for the hostname.

## Root cause
The `cloudflared` process for the **`sarcastek-backend`** tunnel was **not running** at all
(`ps aux | grep cloudflared` returned only the grep's own shell). The tunnel runs via a
manual `nohup` invocation with **no LaunchAgent / KeepAlive**, so when the process dies
nothing restarts it. This is precisely the durability gap tracked by **bd-80gh**.

## Blast radius (larger than OGP)
`~/.cloudflared/config.yml` (tunnel `sarcastek-backend`, id `1aa71419-...`) fronts **6 hostnames**:
- `ogp.sarcastek.com` → `localhost:18790` (OGP daemon — David's public federation gateway)
- `hermes.sarcastek.com` → `localhost:18793`
- `ha.sarcastek.com` → `localhost:8123` (Home Assistant)
- `cam.sarcastek.com` → `localhost:8888`
- `backend.sarcastek.com` → `localhost:8000`
- `sales-api.sarcastek.com` → `localhost:8001`

So the tunnel death took down David's whole personal-infra surface, not just OGP.

## What was healthy
- Local OGP daemon: sole `ogp start` pid 33285, sole LISTEN on `:18790`, `localhost:18790/federation/ping` = pong. No dup-daemon recurrence (bd-ffl lock holding).
- Public rendezvous `rendezvous.elelem.expert/` = `{ok:true,peers:4}` HTTP 200.

So the fault was purely the local→edge tunnel link, not the daemon or the rendezvous hub.

## Fix applied (restore-to-known-good, no config change)
```
nohup cloudflared tunnel --config ~/.cloudflared/config.yml run sarcastek-backend \
  > ~/.cloudflared/tunnel.log 2>&1 &
```
4 edge connections registered (den01, dfw06, dfw08, den03).

### Verification
- `ogp.sarcastek.com/federation/ping` → `{"pong":true,...}` ✅
- `ha.sarcastek.com/` → HTTP 200 ✅ (collateral infra back)
- Single cloudflared process (pid 60729).

## Open follow-up (bd-80gh) — ROOT CAUSE CORRECTED

**bd-80gh's premise was outdated.** A launchd manager already exists; the bug is its restart policy.

### What actually exists
`/Library/LaunchDaemons/com.cloudflare.cloudflared.plist` (root:wheel, created 2026-05-29):
- `Label` = `com.cloudflare.cloudflared`
- `ProgramArguments` = `/opt/homebrew/bin/cloudflared tunnel --config ~/.cloudflared/config.yml --origincert ~/.cloudflared/cert.pem run sarcastek-backend`
- `RunAtLoad` = true, `ThrottleInterval` = 5
- `KeepAlive` = `{ SuccessfulExit: false }`  ← **the bug**
- Logs: `/Library/Logs/com.cloudflare.cloudflared.{out,err}.log`
- `launchctl print system/com.cloudflare.cloudflared`: `runs=4`, but `state = not running`, `active count = 0`.

### Why the tunnel stayed dead ~21h
The err log shows at **2026-06-11T19:12:52Z** the tunnel received `signal terminated`
(graceful SIGTERM) and exited **code 0**. `KeepAlive { SuccessfulExit: false }` means
*restart only on a NON-zero/unsuccessful exit*. A clean exit-0 from SIGTERM is
"successful", so launchd correctly declined to respawn it — and nothing else did, until
the manual nohup revived it ~21h later.

### Proposed real fix (HARD-GATED on David's go — /Library system-domain edit, sudo)
Change the daemon's `KeepAlive` so a SIGTERM-driven exit-0 still respawns:
```xml
<key>KeepAlive</key>
<true/>
```
(unconditional restart). Then the clean end-state:
1. Back up the original plist, edit `KeepAlive` → `<true/>`.
2. `kill 60729` (the out-of-band manual nohup) so launchd owns the process.
3. `sudo launchctl bootout system/com.cloudflare.cloudflared` then `bootstrap system ...`
   (or `kickstart -k`) to reload with the new policy.
4. Verify: `launchctl print` shows `state = running`, `active count = 1`;
   `ogp.sarcastek.com/federation/ping` = pong; then **kill-test** — `kill` the launchd-owned
   pid and confirm launchd respawns it within `ThrottleInterval`.

**Not done autonomously:** this is a root-owned `/Library/LaunchDaemons` edit + an infra
restart of a 6-hostname tunnel. Awaiting David's explicit go.

## Durable memory
`bd recall ogp-tunnel-restart` — restart command + dead-tunnel symptom (error 1033 / 530).
