# Relay-mode Federation Handshake — Design (bd-63bs)

**Status:** proposed, for review before implementation. Trust-adjacent → escalate-before-merge.
**Depends on:** relay Phase 2 (bd-b7em, shipped). **Relates to:** bd-uiwr (health over relay, PR #68).

## Problem

Relay Phase 2 routes ongoing **message delivery** over the relay, but the initial
federation **handshake** still uses direct HTTP. Concretely, two daemons that are
both relay-only (no tunnel / no public gateway) **cannot federate at all** — there
is no HTTP path between them for the request/approve exchange. Relay only helps
*after* a federation already exists.

This is the gap between "relay works for existing federations" and "relay is
turnkey no-tunnel onboarding" — which was the whole point (tunnel setup is the #1
adoption deterrent).

## Why this is bigger than the delivery branch

Message delivery was easy because the receiver funnels **everything** through one
transport-agnostic function, `handleMessage()` (src/daemon/message-handler.ts:90).
The relay receiver just calls it (relay-client.ts:204 `dispatchInbound`).

The handshake is **not** structured that way:

- **Receiver side:** `/federation/request` and `/federation/approve` are *separate
  Express route handlers* (src/daemon/server.ts:543 and ~:268) with their own
  validation (`validateSignedRegistration`-style pure validators at :76, :145),
  tombstone handling, and response shapes. They are **not** reachable through
  `handleMessage`. The relay receiver only knows how to call `handleMessage`.
- **Sender side:** `federationRequest()` (src/cli/federation.ts:677) does two
  HTTP things *before* it POSTs, both of which assume reachability:
  1. `ensureLocalGatewayReachable()` (:681) — checks **our own** gateway responds.
     For a relay-only requester whose tunnel is down, **this fails immediately**
     and blocks the whole request.
  2. `resolvePeerGatewayUrl()` (:693) — fetches the peer's `/.well-known/ogp` card
     for their identity (publicKey, displayName) before sending.

So "handshake over relay" = a new relay frame type + making the request/approve
handlers callable off the HTTP path + reworking the sender preflight + getting the
identity-card exchange to work without `/.well-known`.

## Design

### 1. Refactor the receive handlers to be transport-agnostic (pure cores)

Extract the bodies of the `/federation/request` and `/federation/approve` Express
handlers into pure async functions:

```
handleFederationRequest(signedEnvelope) -> { status, statusCode, body }
handleFederationApprove(signedEnvelope) -> { status, statusCode, body }
```

The Express routes become thin wrappers (parse req.body → call core → res.json).
This mirrors how `handleMessage` already works and is independently good hygiene.
**No behavior change on the HTTP path** — locked by existing tests + a new
"wrapper calls core" test.

### 2. New relay frame type: `federation` (request/approve)

The relay already routes opaque signed envelopes by pubkey with reqId↔response
correlation (`deliver`/`response` frames, relay-core.ts). Add a sibling that
carries a handshake op so the receiver can dispatch to the right core:

```
{ type: 'federation', op: 'request'|'approve', reqId, to, frame: { payloadStr, signature } }
```

- Sender: `deliverViaRelay`-style call but tagged `op`.
- Relay core: routes identically to `deliver` (it never inspects the envelope —
  same untrusted-forwarder property).
- Receiver (`dispatchInbound`, relay-client.ts:204): switch on `op` →
  `handleFederationRequest` / `handleFederationApprove` / (default) `handleMessage`
  → send the result back as the `response` frame.

This keeps the relay **untrusted** and the E2E Ed25519 guarantee intact — the
handshake envelope is signed exactly as today; only the transport changes.

### 3. Sender preflight rework (the subtle part)

In `federationRequest()`, branch when the **target advertises relay** (via
`lookupPeerTransport`) AND we intend to reach them over relay:

- **Skip `ensureLocalGatewayReachable`** — relay reachability does not depend on
  our own gateway being public. (Keep it for the direct path unchanged.)
- **Skip `resolvePeerGatewayUrl` / `/.well-known` fetch** — we can't fetch a
  relay-only peer's card over HTTP. Get their identity from the **rendezvous
  record** instead (pubkey is the routing key; displayName/etc. can be exchanged
  IN the handshake response, or fetched lazily later). The request envelope
  already carries *our* full identity; the approve response carries *theirs*.
- Route the signed request envelope via the new `federation` relay frame.

### 4. Identity exchange without `/.well-known`

Today the requester learns the peer's card via HTTP before federating. Over relay:
- The **request** already includes the requester's full `peer` block (signed).
- The **approve** response should symmetrically include the approver's `peer`
  block (displayName, publicKey, offeredIntents) so the requester can store a
  complete peer record. Minor addition to the approve core's response body.

### 5. Bootstrap / discovery

How does the requester find a relay peer in the first place? The existing
rendezvous paths already cover it:
- `ogp federation connect <pubkey>` → `lookupPeerTransport` → sees relay → handshake over relay.
- `ogp federation invite` / `accept <code>` → resolves pubkey via rendezvous → same.

No new discovery mechanism needed; only the handshake *transport* changes.

## What does NOT change

- Direct federation: byte-identical. The relay branch only triggers when the peer
  advertises relay and (optionally) our own gateway is unreachable.
- E2E Ed25519: every handshake envelope is signed/verified exactly as today.
- The relay server: it already forwards opaque envelopes by pubkey; the new
  `federation` frame routes through the same untrusted path (may need to accept
  the new `type` in validation, but no new trust surface).

## Files

**Modify**
- `src/daemon/server.ts` — extract `handleFederationRequest`/`handleFederationApprove`
  cores; routes become wrappers; approve response includes approver identity.
- `src/daemon/relay-client.ts` — `dispatchInbound` switches on `op`; add a
  `requestViaRelay`/`approveViaRelay` (or generalize `deliverViaRelay` with an op).
- `src/shared/relay-protocol.ts` — add the `federation` frame type + guard.
- `src/cli/federation.ts` — `federationRequest` (and the approve sender) branch on
  relay; skip gateway preflight + `/.well-known` in relay mode; identity from
  rendezvous/handshake.
- `packages/relay-dev/src/relay-core.ts` + `packages/rendezvous/src/relay-core.ts`
  — accept/route the `federation` frame (vendored copy stays in sync; the rendezvous
  edit is **the escalate-before-merge, merge=deploy piece**).

**Tests**
- Handler-core unit tests (request/approve cores in isolation).
- `dispatchInbound` op-routing test.
- Relay-core routes `federation` frames (mirror existing routeDeliver tests).
- A federation-deliver-style regression: direct handshake path unchanged.
- e2e: two relay-only daemons complete a full request→approve→federated handshake
  over the relay with no HTTP gateway (extend test/relay-e2e.test.ts).

## Rollout / PRs

1. **PR A (daemon + relay-dev, no deploy):** handler-core refactor, `federation`
   frame, relay-client op routing, sender preflight rework, relay-dev core, all
   tests. Dormant for direct users.
2. **PR B (rendezvous mount, ESCALATE — merge=deploy):** accept/route the
   `federation` frame in `packages/rendezvous/src/relay-core.ts`. Trust-adjacent +
   auto-deploys. Dogfood the full two-relay-only handshake locally first.

## Estimate / risk

~1.5–2 days. Trust-adjacent (Ed25519 handshake path) and touches the
auto-deploying rendezvous → both the handler refactor and the relay frame need
careful review. The refactor (step 1) is the riskiest for regressions and should
land behind the existing handshake tests with no behavior change before the relay
path is added.

## Open questions for review

1. Identity exchange: is enriching the **approve** response with the approver's
   `peer` block acceptable, or do we want a dedicated card-exchange frame?
2. Should the relay path be **automatic** when the peer advertises relay, or
   **opt-in** (e.g. only when our own gateway is detected unreachable)? Auto is
   more turnkey; opt-in is more conservative for the trust review.
3. Do we want `request`/`approve` to share one `federation` frame with an `op`
   field (proposed), or two distinct frame types? One-with-op is less surface.
