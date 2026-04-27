# OGP Security Best-Practices Report

**Date:** 2026-04-27
**Scope:** OGP daemon (`src/daemon/**`), shared crypto (`src/shared/signing.ts`), CLI (`src/cli/**`), and the standalone rendezvous service (`packages/rendezvous/src/index.ts`).
**Stack reviewed against:** TypeScript / Node.js / Express 4.x backend (no frontend, no DB, no cookie auth).

---

## Executive summary

OGP gets the cryptographic core right — Ed25519 keypairs, signed payloads, instance-scoped Keychain storage on macOS, AES-256-GCM at rest on other platforms — and the doorman correctly enforces scope + rate-limit checks **after** signature verification on `/federation/message`.

The weak layer is the **handshake and discovery surface**. Two of the three handshake endpoints (`/federation/request`, `/federation/approve`) destructure a `signature` field but never call `verify()` on it, and the rendezvous server has no proof-of-key-ownership at all. The result is one exploitable hijack path (F-01) where an attacker who learns of an in-flight federation can race the legitimate peer to "approve" it and substitute their own public key — every subsequent message from the attacker then passes signature verification because the daemon is verifying against the attacker's key.

Secondary findings are conventional Express hardening: missing helmet/body limits/x-powered-by/error handler, two `rejectUnauthorized: false` outbound TLS calls, and absence of rate limiting on unauthenticated endpoints.

| ID | Severity | Title |
|---|---|---|
| F-01 | **Critical** | `/federation/approve` does not verify any signature — pending-federation hijack |
| F-02 | **Critical** | Rendezvous `/register` and `/invite` accept unsigned pubkey claims — identity squatting |
| F-03 | **High** | `rejectUnauthorized: false` on outbound HTTPS in `notify.ts` and `openclaw-bridge.ts` |
| F-04 | **High** | `/federation/request` ignores its own `signature` field; no rate limit on unauthenticated POST that triggers user notifications |
| F-05 | **High** | `/federation/reply/:nonce` (POST) accepts unauthenticated reply bodies and stores them verbatim |
| F-06 | **High** | Rendezvous trusts `X-Forwarded-For` blindly; spoofed IP becomes the published federation address |
| F-07 | Medium | Keypair stored to macOS Keychain via shell-string subprocess invocation instead of an argv form |
| F-08 | Medium | No `helmet()`, no `app.disable('x-powered-by')`, no custom 404/error handler |
| F-09 | Medium | No explicit `express.json({ limit })`; no rate limiting on any HTTP endpoint above the doorman |
| F-10 | Low | Federation request triggers `notifyOpenClaw` *before* approval, with no abuse controls |
| F-11 | Low | `executeIntentHandler` exposes peer-controlled JSON in env vars / stdin to a local script with only a soft 30 s spawn timeout |

---

## Critical findings

### F-01 · `/federation/approve` accepts approvals without verifying any signature
- **Rule:** EXPRESS-INPUT-001, app-specific authentication
- **Location:** `src/daemon/server.ts:364-518`
- **Evidence:** The handler reads `fromPublicKey`, `fromGatewayUrl`, `scopeGrants` etc. directly from `req.body` and uses `findBestPeerForApproval(...)` to locate a pending peer. There is no call to `verify()` / `verifyObject()` before lines 412-427:
  ```ts
  const approvedPeer: Peer = {
    ...peer,
    ...peerUpdates,
    id: fromPublicKey ? derivePeerIdFromPublicKey(fromPublicKey) : peer.id,
    status: 'approved',
    approvedAt
  };
  const persisted = replacePeersByIdentity(
    { peerId: peer.id,
      gatewayUrl: fromGatewayUrl || peer.gatewayUrl,
      publicKey: fromPublicKey || peer.publicKey },
    approvedPeer
  );
  ```
- **Impact:** Anyone who can reach the daemon's `/federation/approve` and who knows (or can guess) a pending peer's gateway URL or publicKey prefix can flip that peer to `approved` *and* overwrite `peer.publicKey` with their own attacker-controlled key. From that moment on, `verifyObject(message, signature, peer.publicKey)` in `message-handler.ts:100` will validate **the attacker's signed messages** as authentic — full impersonation of the federated peer.
  - The id is re-derived from `fromPublicKey` (line 415), so the persisted peer becomes attacker-keyed.
  - The auto-grant block (lines 474-510) also POSTs *our* scope grants to `freshPeer.gatewayUrl`, which the attacker controls if they also supplied `fromGatewayUrl`.
- **Fix:** Require a signature over a canonical approval payload and verify it with `fromPublicKey`. Concretely:
  1. Require `body.signature` and a deterministic payload (e.g. JSON of `{fromPublicKey, fromGatewayUrl, fromGatewayId, peerId, timestamp, scopeGrants?}`).
  2. Reject if `verify(payloadStr, body.signature, fromPublicKey)` is false.
  3. Reject if the timestamp is more than ~5 min old (mirror the pattern already used in `/federation/removed`, `server.ts:556-566`).
  4. After verification, additionally enforce that `derivePeerIdFromPublicKey(fromPublicKey)` matches the pending peer the request is targeting — do not allow `fromPublicKey` to silently *replace* a different pending peer's key.
- **Mitigation (until fixed):** Bind the daemon to loopback only (`app.listen(port, '127.0.0.1')`) and use the cloudflared/ngrok exposure flow with an authenticated reverse proxy. Do not run `ogp expose` against a daemon that is reachable from the public internet without F-01 fixed.

### F-02 · Rendezvous accepts unsigned `pubkey` claims (identity squatting)
- **Rule:** EXPRESS-INPUT-001, EXPRESS-AUTH-001
- **Location:** `packages/rendezvous/src/index.ts:89-117` (`POST /register`) and `:165-193` (`POST /invite`).
- **Evidence:** `/register` body validation only checks types; the caller asserts an arbitrary `pubkey` string and the server stores `peers.set(pubkey, { ip, port, lastSeen })`. There is no signature, nonce, or proof-of-possession check. Same shape on `/invite`.
- **Impact:** Anyone can hijack a pubkey's rendezvous record. A peer doing `lookupPeer(config, victimPubkey)` (`src/daemon/rendezvous.ts:138-168`) will be steered to `http://attacker_ip:port`. Combined with F-01, this becomes an end-to-end MITM of OGP federation discovery.
- **Fix:** Require the registration body to include a signed challenge (e.g. `signature = sign(JSON.stringify({pubkey, port, timestamp}), privateKey)`), then `verify(...)` server-side using the supplied `pubkey` before accepting the record. Reject on bad signature, missing/stale timestamp, or `lastSeen` collision with a freshly-rotated key.
- **Mitigation:** Today the rendezvous server is optional (`config.rendezvous?.enabled`), so users who don't need discovery can leave it off. The published service should not be relied on for trust until signing is added.

---

## High findings

### F-03 · TLS certificate verification disabled on outbound HTTPS
- **Rule:** Node.js / general-backend secure transport
- **Locations:**
  - `src/daemon/notify.ts:612` — Hermes webhook POST: `rejectUnauthorized: false`
  - `src/daemon/openclaw-bridge.ts:207` — OpenClaw `/hooks/agent` POST: `rejectUnauthorized: false`
- **Impact:** OGP will accept *any* TLS certificate on these endpoints, including attacker-served certs on intercepted DNS or compromised LANs. The OpenClaw call is intentional for the `https://localhost:18789` self-signed local case, but the same relaxation applies if `openclawUrl` is ever set to a remote host. The Hermes webhook URL is fully user-configurable and can point at a remote service.
- **Fix:** Restrict the `rejectUnauthorized: false` exception to loopback hosts:
  ```ts
  const isLoopback = ['localhost','127.0.0.1','::1'].includes(url.hostname);
  rejectUnauthorized: !isLoopback,
  ```
  For Hermes, additionally allow override via an explicit env flag (e.g. `OGP_HERMES_INSECURE_TLS=1`) so the relaxed default is never silent.

### F-04 · `/federation/request` ignores its `signature` field; spam/DoS via notifications
- **Rule:** EXPRESS-INPUT-001, EXPRESS-AUTH-001
- **Location:** `src/daemon/server.ts:157-303`
- **Evidence:** Lines 159-162 destructure `peer` and `signature`, but `signature` is never passed to `verify()`. The handler then **writes a peer record to disk** (line 239) and **fires a real-time `notifyOpenClaw(...)` to the operator** (line 285).
- **Impact:** An unauthenticated remote attacker can:
  - Add unbounded entries to `peers.json` (storage exhaustion, peers list corruption).
  - Spam the operator's agent session with fake "Federation Request" notifications, including attacker-chosen `displayName`, `email`, and `gatewayUrl`. The notification text is concatenated directly into a string passed to OpenClaw/Hermes — useful for prompt-injection style attacks against the local agent.
- **Fix:**
  1. Verify `signature` against `peer.publicKey` over a canonical payload before persisting anything.
  2. Add a per-IP rate limit on the public POST endpoints (e.g. `rate-limiter-flexible` keyed on `req.ip` after configuring `app.set('trust proxy', ...)` correctly — see F-09).
  3. Treat operator-displayed strings as untrusted: prefix with `[unverified]` until the operator explicitly trusts the peer, and avoid embedding raw `peer.displayName` / `peer.email` inside hand-crafted prompt-style strings without a clear delimiter.

### F-05 · `/federation/reply/:nonce` POST is unauthenticated and stores arbitrary bodies
- **Rule:** EXPRESS-INPUT-001
- **Location:** `src/daemon/server.ts:698-719`
- **Evidence:** The handler accepts any POST body and calls `storePendingReply(nonce, replyPayload)` with no signature check, no peer lookup, no nonce ownership check.
- **Impact:** Anyone who learns or guesses a nonce can poison the polled reply (`GET /federation/reply/:nonce`, lines 671-696). Nonces are random in normal flows, so this is hard to exploit blindly, but anything that exposes a nonce (logs, agent transcripts) immediately exposes the reply slot.
- **Fix:** Track which peer originated each nonce (the daemon already knows when *it* sent the message; for inbound flows the nonce comes from a verified message). On `POST /federation/reply/:nonce`, look up the expected peer and call `verifyObject(reply, signature, peer.publicKey)` before storing. Reject otherwise. The reply already comes signed when produced by `sendReply` (`reply-handler.ts:140`); the inbound endpoint just needs to actually check that signature.

### F-06 · Rendezvous server trusts `X-Forwarded-For` blindly
- **Rule:** EXPRESS-PROXY-001
- **Location:** `packages/rendezvous/src/index.ts:69-77`
- **Evidence:**
  ```ts
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '0.0.0.0';
  ```
  There is no `app.set('trust proxy', ...)` and no validation that the request actually came from a known proxy.
- **Impact:** Any client can set `X-Forwarded-For: 10.0.0.5` and the rendezvous record will publish that IP back to other peers via `/peer/:pubkey`. Combined with F-02 (no signed registration), this is a one-step way to redirect federation lookups to internal addresses (SSRF amplification) or to victim hosts (reflective DoS).
- **Fix:**
  1. Configure `app.set('trust proxy', <hop count>)` to match the actual deployment (e.g. `1` behind a single ALB).
  2. Use `req.ip` (Express-derived, respects trust-proxy) instead of hand-parsing the header.
  3. After F-02 lands, prefer the *socket* IP for the peer record and use `pubkey` solely as the trust anchor.

---

## Medium findings

### F-07 · `keypair.ts` shells out via string-concatenated subprocess invocation
- **Rule:** EXPRESS-CMD-001 (defense-in-depth — the inputs today are app-controlled and not exploitable, but the pattern is fragile).
- **Location:** `src/daemon/keypair.ts:41-87`
- **Evidence:**
  ```ts
  execSync(
    `security add-generic-password -U -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT} -w ${JSON.stringify(privateKey)}`,
    { stdio: 'pipe' }
  );
  ```
  The values today are: a hex hash slice, a constant, and a hex-encoded Ed25519 key. None of them are reachable from the network, so this is not exploitable in current code. The risk is regression — the next refactor that makes the service name user-influenced introduces a real injection.
- **Fix:** Replace each `execSync(...)` invocation with the `execFileSync('security', [args...], ...)` argv form so quoting is handled by the OS rather than shell-string interpolation.

### F-08 · Missing baseline Express hardening
- **Rule:** EXPRESS-HEADERS-001, EXPRESS-FINGERPRINT-001, EXPRESS-ERROR-001
- **Location:** `src/daemon/server.ts:127-130`
- **Evidence:** `const app = express(); app.use(express.json());` — no `helmet()`, no `app.disable('x-powered-by')`, no terminal `app.use((err,req,res,next) => ...)` error handler. Each route does its own try/catch which is fine, but unhandled middleware errors will fall through to Express's default handler.
- **Impact:** Defense-in-depth only (no XSS surface — responses are JSON). Mostly relevant for fingerprinting and to keep stack traces out of error paths once the surface grows.
- **Fix:**
  ```ts
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); // no HTML rendered
  // ... routes ...
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, _next) => {
    console.error('[OGP] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  ```

### F-09 · No explicit body-size limit; no rate limiting
- **Rule:** EXPRESS-BODY-001, EXPRESS-AUTH-001
- **Location:** `src/daemon/server.ts:129` and all unauthenticated POST routes
- **Evidence:** `express.json()` without `{ limit }` (defaults to 100 KB, but not stated). No middleware caps unauthenticated request volume on `/federation/request`, `/federation/approve`, `/federation/message`, `/federation/reply/:nonce`, `/federation/update-identity`, `/federation/removed`, `/federation/ping`, `/.well-known/ogp`. The doorman rate-limiter only kicks in **after** signature verification on `/federation/message`.
- **Impact:** Trivial DoS — an attacker can hammer any unauthenticated endpoint with parsed JSON until the doorman path is the only thing surviving. F-04 amplifies this into a notification-flood attack.
- **Fix:** Add `express.json({ limit: '64kb' })` and a global per-IP limiter:
  ```ts
  import rateLimit from 'express-rate-limit';
  app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));
  ```
  Pair with `app.set('trust proxy', ...)` if you run behind cloudflared/ngrok so `req.ip` is meaningful.

---

## Low findings

### F-10 · Pre-approval notifications can be abused for prompt injection
- **Location:** `src/daemon/server.ts:248-293`
- **Evidence:** `notificationText` is built with raw `peer.displayName`, `peer.gatewayUrl`, `peer.email` and shipped to the local agent before the operator approves anything. The agent then sees attacker-chosen text in a high-trust system message context.
- **Fix:** Sandbox unverified peer fields with explicit delimiters and a `[UNVERIFIED]` prefix; alternatively, refuse to forward them at all and only show the derived peer ID until approval.

### F-11 · `executeIntentHandler` hard-kill timeout
- **Location:** `src/daemon/message-handler.ts:479-551`
- **Evidence:** `spawn(handlerPath, [], { env, stdio: ['pipe','pipe','pipe'], timeout: 30_000 })`. Node's `timeout` option sends `SIGTERM`; a misbehaving handler that ignores SIGTERM keeps the slot held indefinitely.
- **Fix:** Track the child and `child.kill('SIGKILL')` after a follow-up grace period; or use AbortController with `killSignal: 'SIGKILL'`.

---

## What looks correct (for the record)

- **Ed25519 signature verification on `/federation/message`** (`message-handler.ts:99-108`) uses the stored peer.publicKey and the raw `messageStr` to avoid JSON key-order drift — this is the right design.
- **`/federation/removed`** (`server.ts:520-629`) is the example to copy for the other handshake endpoints: it requires a signature, verifies against the peer's stored publicKey, and rejects stale timestamps.
- **Doorman scope + rate-limit enforcement** (`doorman.ts`) is layered correctly behind signature verification.
- **At-rest key storage**: macOS Keychain on darwin; AES-256-GCM with scrypt KDF and `chmod 600` everywhere else (`keypair.ts:123-177`).
- **Atomic peers.json writes** via temp-file + rename (`peers.ts:186-211`).
- **Single body parser, no static, no template engine, no SQL/NoSQL** — which removes most of the OWASP top-10 surface from this app.

---

## Suggested fix order

1. **F-01** then **F-04 / F-05** (close the unauthenticated-control surface). These are one focused PR — re-use the signed-payload + timestamp pattern already in `/federation/removed`.
2. **F-02 / F-06** (rendezvous). Until signed registration lands, document that the rendezvous service must be considered untrusted and is suitable only as a discovery cache.
3. **F-03** (TLS verification scope reduction).
4. **F-08 / F-09** (helmet, body limit, rate limit, error handler) — single small PR.
5. **F-07, F-10, F-11** as cleanup.

---

Report file: `/Users/davidproctor/Documents/GitHub/ogp/security_best_practices_report.md`
