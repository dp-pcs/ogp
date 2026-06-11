# Escalation: relay `/relay` WS upgrade not reachable through rendezvous prod ingress

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
- Agent AWS creds this session resolve to acct **943347375834** (bragging-rights-dev),
  **not** prod **913524910742** — cannot inspect CloudFront/ALB or apply the fix.
