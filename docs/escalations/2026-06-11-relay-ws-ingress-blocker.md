# Escalation: relay `/relay` WS upgrade not reachable through rendezvous prod ingress

> **RESOLVED 2026-06-11 ~12:36Z — NOT A BLOCKER. NO AWS ACTION NEEDED.**
> The relay endpoint works end-to-end over HTTP/1.1 (real `ws` clients get `101` +
> the app `challenge` frame). The original failure was a **test artifact**: the
> curl probe negotiated **HTTP/2** via TLS ALPN, and HTTP/2 forbids the
> `Connection`/`Upgrade` headers (RFC 7540 §8.1.2.2), so the ALB forwarded a plain
> `GET /relay` to Express → 404. See "Resolution" at the bottom. The fix items
> below (CloudFront/ALB ingress changes) are **superseded / unnecessary** — kept
> for the audit trail only.

- **Date:** 2026-06-11 (~11:18Z), heartbeat (Loop 1 — federation health)
- **Filed by:** agent.ogp-a-dp-agent
- **Bead:** `bd-6ied` (P1, bug)
- **Durable note:** `bd recall relay-ws-ingress-blocker`
- **Severity:** P1 — blocks relay transport (Phase 2) dogfooding peer-to-peer.
- **Action owner:** David (AWS prod infra change; HARD RULE: agent never touches ECS/ingress, and agent AWS creds this run resolve to the wrong account).

## Symptom

A proper WebSocket handshake to the relay endpoint does **not** upgrade:

```
curl -i -N \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://rendezvous.elelem.expert/relay
```

Returns **`HTTP/2 404`** with header **`x-powered-by: Express`** instead of the
expected **`101 Switching Protocols`**.

## What works (rules out a dead / stale task)

- `GET https://rendezvous.elelem.expert/` → **200**
- `POST /register` with `{}` → **400** (route live, validating body)
  ⇒ Express HTTP routes serve correctly; the Fargate task **is** on a recent image.
- Deploy workflow `rendezvous-deploy.yml` run **27312351425** (PR #64,
  "mount relay routing on rendezvous /relay") **completed: success** at
  **2026-06-10T23:11Z**.

## Diagnosis

The merged code (`packages/rendezvous/src/index.ts:377-393`) mounts the relay via
the Node `http` server's `'upgrade'` event, gated on `req.url === '/relay'`,
handing off to `wss.handleUpgrade(...)` → which would return **101**.

Because the request instead lands on the **Express 404 handler**
(`x-powered-by: Express`) **as HTTP/2**, the Node `'upgrade'` event is never
firing. That points at the **front ingress** for `rendezvous.elelem.expert`
(CloudFront distribution and/or ALB listener, prod acct **913524910742**)
terminating/forwarding the request as a plain HTTP/2 request and **not preserving
the WebSocket `Upgrade` handshake** to the origin.

The relay app code itself is correct and unchanged here — this is an **edge/ingress
forwarding** problem, not an application bug.

## Likely fix (David-action, prod acct 913524910742)

1. **CloudFront in front of the ALB (most likely culprit):** WebSockets are
   supported by CloudFront, but the distribution must forward the `Connection`
   and `Upgrade` headers (origin request policy) and use an origin protocol that
   preserves the upgrade. The observed `HTTP/2` strongly suggests h2-to-origin or
   a managed cache/origin-request policy stripping `Upgrade`/`Connection`.
   - Simplest robust fix: route `rendezvous.elelem.expert` WS traffic **straight
     at the ALB** (ALB natively supports WS upgrade on HTTP/HTTPS listeners)
     rather than through CloudFront; or add a dedicated CloudFront behavior for
     `/relay` that forwards `Connection`/`Upgrade` with no caching.
2. **ALB → target group:** confirm the listener rule forwards `/relay` to the
   Fargate task on the app port, and the **target group protocol is HTTP/1.1**
   (ALB→target WS requires HTTP/1.1, not gRPC/h2).
3. **Re-test** (expect `101`):
   ```
   curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' \
     -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     https://rendezvous.elelem.expert/relay
   ```

## Also still pending (unchanged from 2026-06-10 handoff, not re-diagnosed)

- **ALB idle-timeout heartbeat** (`docs/TRANSPORT-MODES-DESIGN.md:118`): app-level
  WS ping ~30–50s so idle relay sockets aren't dropped at the 60s ALB idle
  timeout. (Becomes testable once the upgrade reaches the origin.)

## Constraints on the agent

- HARD RULE: never auto-deploy the rendezvous server / never touch ECS or ingress.
  (Honored: this session performed **read-only** inspection only — no mutations.)
- Agent self-served **read-only** prod creds via `saml2aws login -a prod-aicoe-admin
  --skip-prompt` (acct 913524910742, ~12h TTL) to diagnose. Default shell creds are
  acct 943347375834 (bragging-rights-dev) = wrong account.

---

## Resolution (2026-06-11 ~12:36Z) — corrected diagnosis

The earlier "ingress strips the Upgrade" theory was **wrong**. Read-only inspection
of prod acct 913524910742 + protocol-aware re-tests show the relay is **fully
functional**; the original 404 was an artifact of the probe negotiating HTTP/2.

**Verified facts (read-only):**
- DNS `rendezvous.elelem.expert` → `34.233.82.165` / `52.6.139.118` = ALB IPs.
  **No CloudFront** distribution lists that alias → CloudFront is NOT in the path.
- ALB = `openclaw-portal-alb` (shared). 443 listener rule (prio 100):
  host-header `rendezvous.elelem.expert` → forward `ogp-rendezvous-tg`. No path
  conditions, no header manipulation — it forwards `/relay` straight to the origin.
- Target group `ogp-rendezvous-tg`: protocol **HTTP/1.1** (`HTTP1`), port 3000,
  target **healthy**. Correct for WS.
- ECS `ogp-rendezvous` (cluster `ogp-rendezvous-prod`): ACTIVE, 1/1 running,
  task def `:10`, image `ogp/rendezvous:1.0.0-452ddc1` (= PR #64 relay code). App
  code is deployed and correct.
- ALB attribute `routing.http2.enabled = true`; `idle_timeout = 300s`.

**Root cause:** the failing probe used `curl` without `--http1.1`. With ALB h2
enabled, TLS ALPN negotiates **HTTP/2**, where `Connection`/`Upgrade` are illegal
and stripped → the request reaches Express as a plain `GET /relay` → 404. This is
not a config defect; WebSocket-over-h2 requires RFC 8441 Extended CONNECT, which
the `ws` library does not use.

**Confirmation (both pass):**
- `curl --http1.1 ... /relay` → `HTTP/1.1 101 Switching Protocols` + immediate
  `{"type":"challenge",...}` app frame.
- Real Node `ws` client (what the OGP daemon uses) → `open` (101) + `challenge`
  frame received. **PASS.**

**Conclusion:** relay Phase 2 is **dogfoolable now**; no AWS infra change required.
The correct re-test command is the `--http1.1` curl above, or any real WS client.

**Carryover (still valid, separate work):** the ALB idle timeout is **300s** (not
60s as the old design note assumed), but an app-level WS ping/heartbeat
(`docs/TRANSPORT-MODES-DESIGN.md:118`) is still worth shipping so long-idle relay
sockets survive — now a normal backlog item, not a blocker.
