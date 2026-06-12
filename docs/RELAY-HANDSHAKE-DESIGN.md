# Multi-Transport Advertisement + Relay Handshake — Design

**Status:** proposed, for review before implementation. Trust-adjacent → escalate-before-merge.
**Depends on:** relay Phase 2 (bd-b7em, shipped). **Relates to:** bd-uiwr (health over relay, merged #68).
**Beads:** bd-63bs (handshake over relay) + new bead (multi-transport advertisement). Built as **one combined effort** per David (2026-06-11).

## What changed from the first draft

The first draft scoped only "route the request/approve handshake over relay." Review
with David turned it into a better, larger design:

1. **Multi-transport advertisement** (Q1): a gateway advertises a *list* of transports
   it's reachable on, with a stated **preference**, not a single mode. Each direction
   honors the **recipient's** advertisement independently (asymmetry is correct: if you
   advertise relay-only and I advertise direct, I reach you via relay and you reach me
   via direct).
2. **Rendezvous serves the identity card** (Q2): a relay-only peer has no public
   `/.well-known/ogp`, so the rendezvous server returns the peer's signed identity card
   on lookup — making relay peers first-class for *discovery*, not just delivery.
3. **Handshake over relay** (bd-63bs): the request/approve exchange routes over relay so
   two relay-only peers can federate.

All three touch the **Ed25519-signed registration** and/or the **auto-deploying
rendezvous** → escalate-before-merge, backward-compatible.

---

## Part A — Multi-transport advertisement (preference + fallback)

### Schema change (the keystone)

Today the signed registration carries a single transport descriptor:
```
transport: { transport: 'relay', relayUrl }            // one mode
```
New: a **list**, ordered or preference-tagged, still inside the signed payload:
```
transports: [
  { mode: 'direct', gatewayUrl: 'https://…', preference: 1 },
  { mode: 'relay',  relayUrl: 'wss://…/relay', preference: 2 }
]
```
- **Backward compatible:** the old single `transport` object still parses (treated as a
  one-element list). Absent ⇒ direct, exactly as today. Old daemons keep working; new
  daemons reading an old record see one transport.
- Lives inside `signCanonical(...)` registration → rendezvous cannot forge or reorder it
  (same trust property as Phase 1). **This is the escalate-before-merge keystone.**
- Config: `transport.modes` becomes a list (or we keep `transport.mode` for the simple
  case and add `transport.advertise: ['direct','relay']` + `transport.prefer`). Decide in
  review — must stay ergonomic for the 99% single-mode user.

### Sender resolution + fallback

When delivering to peer X, `lookupPeerTransport(X)` returns X's advertised list. The
sender walks it by preference and uses the first transport it can establish:

1. Honor X's stated preference order.
2. **Default when X advertises both with no preference: try direct first, fall back to
   relay** (direct = no relay hop / lower latency; relay = safety net). [David, 2026-06-11]
3. On failure of the preferred transport, fall through to the next in the list.
4. This is **per-recipient and independent of what the sender advertises** — asymmetry is
   expected and correct.

Touchpoints: `lookupPeerTransport` (src/daemon/rendezvous.ts:255) returns a list;
`deliverFederationMessage` (src/cli/federation.ts) iterates with fallback instead of the
current single relay-or-direct branch.

### Health (already partly done)

bd-uiwr (merged) treats "registered with a relay descriptor" as reachable. Extend to the
list: a peer is healthy if **any** advertised transport is reachable (relay-registered OR
direct HTTP OK).

---

## Part B — Rendezvous serves the identity card

### Why

Direct peers expose `/.well-known/ogp` (displayName, publicKey, offeredIntents, etc.).
Relay-only peers have no HTTP address to serve it from. Today rendezvous `/peer/<pubkey>`
returns reachability (pubkey, ip, port, transport) but **not** the full card
(packages/rendezvous/src/index.ts:274). So a relay peer is reachable but not *discoverable*.

### Change

- The daemon includes its identity card **inside the signed registration** (displayName,
  publicKey, offeredIntents, organization — the same fields as `/.well-known/ogp`, built by
  the pure card-builder at src/daemon/server.ts:279).
- Rendezvous stores it (from the **verified** payload only — same discipline as the
  transport descriptor) and returns it on `/peer/<pubkey>`.
- Lookup helper: `fetchPeerCard(pubkey)` queries rendezvous; for relay peers this replaces
  the `/.well-known/ogp` fetch. Direct peers still use `/.well-known` (or rendezvous if
  present — rendezvous becomes a uniform discovery layer).
- **Trust:** card is in the signed payload → rendezvous can't fabricate identity. The card's
  `publicKey` must equal the registration pubkey (reject mismatch).

This is the second trust-adjacent rendezvous change and pairs naturally with Part A (both
enrich what the signed registration carries + what rendezvous serves) — done in one pass.

---

## Part C — Handshake over relay (bd-63bs)

### Receiver: make the handlers transport-agnostic

`/federation/request` (server.ts:543) and `/federation/approve` (~:268) are Express route
handlers with their own validation/tombstone logic — **not** funneled through
`handleMessage`. Extract pure cores:
```
handleFederationRequest(signedEnvelope) -> { status, statusCode, body }
handleFederationApprove(signedEnvelope) -> { status, statusCode, body }
```
Routes become thin wrappers (no HTTP behavior change — locked by existing tests). The
**approve** core's response body includes the approver's identity card (so the requester
stores a complete peer record even without an HTTP card fetch — and complements Part B).

### New relay frame: one `federation` frame with an `op` field [Q3, locked]

```
{ type: 'federation', op: 'request' | 'approve', reqId, to, frame: { payloadStr, signature } }
```
- Routes through the relay's existing untrusted forward-by-pubkey path (relay-core), with
  the same reqId↔response correlation as `deliver`.
- Receiver `dispatchInbound` (relay-client.ts:204) switches on `op` →
  request/approve core → returns the result as the `response` frame.
- Relay stays untrusted; E2E Ed25519 unchanged (the handshake envelope is signed exactly
  as today).

### Sender preflight rework

`federationRequest` (src/cli/federation.ts:677) currently does two HTTP things that break
for relay-only peers:
1. `ensureLocalGatewayReachable` (:681) — checks **our own** gateway. **Skip in relay mode**
   (relay reachability doesn't need our gateway public).
2. `resolvePeerGatewayUrl` → `/.well-known` (:693) — **replace with `fetchPeerCard(pubkey)`
   from rendezvous** (Part B) when the peer is relay-only.

Then route the signed request via the `federation` relay frame instead of `fetch`.

### Bootstrap

No new discovery: `ogp federation connect <pubkey>` and `invite`/`accept <code>` already
resolve the peer via rendezvous; they now resolve a transport *list* + card, then hand off
to the relay handshake when relay wins the preference walk.

---

## What does NOT change

- **Direct federation: byte-identical.** The relay path only triggers when the peer's
  advertised list selects relay. Single-`transport` (old) records still parse.
- **E2E Ed25519** preserved in every transport and in the handshake.
- The relay server remains an **untrusted forwarder** — it gains a `federation` frame type
  and (Part B) stores+serves a signed card, but never sees private keys and can't forge.

## Files

**Daemon (dormant for direct users — no deploy):**
- `src/shared/config.ts` — transport config becomes a list/preference (keep simple-mode ergonomic).
- `src/daemon/rendezvous.ts` — build + parse a transport *list*; `lookupPeerTransport` returns it; `fetchPeerCard`; backward-compat for single descriptor.
- `src/cli/federation.ts` — `deliverFederationMessage` preference-walk + fallback; `federationRequest` preflight rework + relay handshake.
- `src/daemon/server.ts` — extract request/approve cores; include card in approve response; include card in registration.
- `src/daemon/relay-client.ts` — `dispatchInbound` op-routing; request/approve over relay.
- `src/shared/relay-protocol.ts` — `federation` frame type + guard.
- `src/daemon/heartbeat.ts` — health = any advertised transport reachable.
- `packages/relay-dev/src/relay-core.ts` — route the `federation` frame (dogfood).

**Rendezvous (ESCALATE — merge=deploy):**
- `packages/rendezvous/src/index.ts` + `verify.ts` — parse/store/return the transport *list* and the identity card from the verified payload; route the `federation` relay frame.
- `packages/rendezvous/src/relay-core.ts` (vendored) — accept the `federation` frame.

## Tests
- Transport-list parse + backward-compat (old single descriptor → one-element list).
- Preference walk + fallback (prefer direct→relay default; explicit preference honored; first-reachable wins).
- Card in signed registration; rendezvous returns it; pubkey-mismatch rejected (tamper test, mirror existing).
- Request/approve handler cores in isolation; wrapper-calls-core (no HTTP change).
- `dispatchInbound` op-routing; relay-core routes `federation` frame.
- Direct-path regression (handshake + delivery byte-identical).
- e2e: two relay-only daemons complete request→approve→federated handshake with no HTTP gateway (extend test/relay-e2e.test.ts).

## Rollout / PRs

Per David: **one combined effort**, but still split by deploy risk:
1. **PR A — daemon + relay-dev (no deploy):** all daemon-side changes (transport list,
   preference/fallback, card fetch, handler cores, relay handshake, health). Dormant for
   direct users; relay handshake just connection-refuses until PR B lands.
2. **PR B — rendezvous (ESCALATE, merge=deploy):** transport-list + card storage/serving +
   `federation` frame routing. Trust-adjacent + auto-deploys. Dogfood the full two-relay-only
   federation locally first; David reviews the diff before merge.

## Estimate / risk

~2–3 days given the combined scope. Three trust-adjacent surfaces (signed transport list,
signed card, relay handshake) all reviewed together. Highest-regression-risk piece is the
request/approve handler-core refactor — land it behind existing handshake tests with **no
behavior change** before adding the relay path.

## Settled decisions (David, 2026-06-11)
- Q1 → multi-transport advertisement with preference + fallback; honor the recipient's
  advertisement per-direction; default both-no-preference = **direct first, relay fallback**.
- Q2 → **rendezvous serves the signed identity card** for relay peers (chosen over
  handshake-only card exchange; also enrich the approve response as a complement).
- Q3 → **one `federation` frame with an `op` field.**
- Sequencing → **one combined effort**, PRs split by deploy risk (A dormant, B escalate).

## Config ergonomics — SETTLED (Option A, David 2026-06-11)

Keep the simple single-mode path **exactly as today**; layer multi-transport on as
opt-in extras. No migration, no breaking change to `set-mode`.

```
ogp config transport set-mode relay          # unchanged — the 99% case, ships as-is
ogp config transport advertise direct relay  # opt-in: reachable on both
ogp config transport prefer relay            # opt-in: preference (else default direct-first)
```

- The transport **list is the internal source of truth**. `set-mode <m>` writes a
  one-element list `[{ mode: m }]`; `advertise` writes the multi-element list.
- **Precedence rule (resolve the "which wins"):** if `transport.advertise` is set, it
  defines the advertised list and `mode`/`prefer` order it; if only `mode` is set, it's a
  one-element list (today's behavior). Absent ⇒ direct.
- This keeps Option A able to *become* a full list model later with zero user-facing
  change (the list is already the truth; the simple commands just write into it).
- Companion toggle (bd-26fg) keeps working — it sets `mode`; a future UI can expose the
  advertise/prefer list.
