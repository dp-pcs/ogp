# Protocol-Version Negotiation in the Federation Send Path — Design Proposal

**Bead:** bd-kusq · **Status:** PROPOSED (design-first; not implemented)
**Author:** agent.ogp-a-dp-agent · **Date:** 2026-06-14
**Loop:** 1 (federation health / robustness)
**Risk class:** non-crypto wire-compat change → propose, review with David before merge.

---

## TL;DR

`deliverFederationMessage()` (`src/cli/federation.ts:1102`) negotiates **transport**
(relay vs. direct, direct as terminal fallback) but never consults the peer's
**payload-schema version**. A newer sender talking to an older peer connects fine over
direct/tunnel, then the older peer rejects the newer envelope with an opaque error.

The fix is small and additive: the peer record **already carries `protocolVersion`**
(populated by the approve handshake). We add a *read* of that field in the send path
plus a *structured* `unsupported-version` rejection on the receive path, so the failure
renders as **"peer is on an older OGP, ask them to update"** instead of a generic
message rejection.

---

## Verified current state (read against source, not the bead's framing)

The bead says "There is no protocolVersion handshake." That is **partially stale** —
verified against the actual tree on branch `agent/heartbeat`:

| Fact | Evidence |
|---|---|
| `protocolVersion` **is tracked** per peer | `src/cli/federation.ts:1268` — `peer.protocolVersion \|\| '0.1.0 (legacy)'` (shown in `ogp ... show-scopes`) |
| Approve handshake **sends** a version | `src/cli/federation.ts:933` — signed approval envelope includes `protocolVersion: '0.2.0'` |
| Versions defined | `docs/PROTOCOL.md:280-281` — `0.2.0` (scopes + agent-comms), `0.1.0` (request/approve/message) |
| Send path **ignores** the version | `deliverFederationMessage()` (`:1102-1158`) negotiates only transport (`lookupPeerTransport`, relay-vs-direct); it never reads `peer.protocolVersion` before building/serializing the frame |
| No structured "too old" signal | direct path returns whatever `response.json()` yields (`:1148-1152`); relay path returns a generic `peer not connected` error (`:1126-1130`). Neither distinguishes *version mismatch* from *transport failure* or *bad signature* |

**So the real gap is narrower and more tractable than "no handshake exists":**
the version is captured at approve time but is **not enforced/branched on at send time,
and there is no structured rejection contract** for a receiver that can't parse a newer
envelope. The failure is therefore *diagnosable by the operator but not by the code*.

---

## Goals

1. A sender knows, **before** sending, the minimum schema a peer can parse, and can
   either (a) down-shape the envelope to that peer's version, or (b) refuse with a clear,
   actionable error.
2. A receiver that genuinely can't parse an envelope returns a **structured**
   `unsupported-version` error (machine-readable), not an opaque rejection.
3. **Zero regression** for the common case (both peers on the same current version) and
   for legacy `0.1.0` peers where the version is unknown/absent.

## Non-goals

- No change to the crypto/signing model. `signCanonical` and signature verification are
  untouched. (If any field below must be *signed*, that crosses into escalate-before-merge
  territory and gets called out explicitly in review.)
- No new transport. This rides existing direct + relay paths.
- No auto-upgrade / auto-update of peers. We *signal* staleness; humans update.

---

## Design

### 1. Envelope carries an explicit `protocolVersion` (send side)

Today the message frame (`{ message, messageStr, signature }`) does not name a version.
Add a top-level `protocolVersion` to the **message body** the sender builds, equal to this
daemon's `CURRENT_PROTOCOL_VERSION` (single source of truth; suggest `src/shared/protocol.ts`
exporting `export const CURRENT_PROTOCOL_VERSION = '0.2.0'`). This is informational on the
wire and lets a receiver respond precisely.

> Signing note: if `protocolVersion` is added *inside* the canonically-signed payload it
> changes the signed bytes → **escalate-before-merge** (trust-model surface). The lower-risk
> first cut is to send it as an **unsigned sibling field** alongside `messageStr`/`signature`
> (like `message` already is at `:1142-1146`), used only for routing/diagnostics, never for
> auth decisions. Recommend starting there.

### 2. Receiver returns a structured `unsupported-version` error (receive side)

On `/federation/message`, when envelope parsing fails *because of unknown/newer fields*
(as opposed to a bad signature), respond with a stable shape:

```json
{
  "success": false,
  "error": "unsupported-version",
  "peerProtocolVersion": "0.1.0",
  "requiredProtocolVersion": "0.2.0",
  "hint": "This peer is on an older OGP. Ask them to update (npm i -g @dp-pcs/ogp)."
}
```

`error: "unsupported-version"` is the contract token senders branch on. The two version
fields let the sender render an exact message.

### 3. Sender pre-flight + structured-error handling (send side)

In `deliverFederationMessage()`, after transport resolution and before/after the POST:

- **Pre-flight (cheap, optional):** if `peer.protocolVersion` is known and *older* than the
  minimum required for the intent being sent, short-circuit with the same structured
  `unsupported-version` result **without** a network round-trip. (Keeps behavior graceful
  even when the peer is offline.)
- **Post-flight:** if the response body has `error === 'unsupported-version'`, surface it
  verbatim up through `federationSend()` so the CLI prints the actionable hint instead of
  a generic failure.

Legacy handling: a missing/`undefined` `peer.protocolVersion` is treated as `0.1.0` and the
sender **down-shapes** (or, where impossible, refuses with the structured error) — never
silently sends `0.2.0`-only fields to a `0.1.0` peer.

### 4. Version comparison helper

Add `isAtLeast(peerVersion, required)` semver-lite compare in `src/shared/protocol.ts`
(versions are simple `MAJOR.MINOR.PATCH`; no ranges needed). Single tested helper avoids
ad-hoc string compares scattered across the send path.

---

## Touch points (implementation map — for the eventual PR, not done here)

| File | Change |
|---|---|
| `src/shared/protocol.ts` (new) | `CURRENT_PROTOCOL_VERSION`, `MIN_VERSION_FOR_INTENT`, `isAtLeast()` |
| `src/cli/federation.ts` `deliverFederationMessage()` (~1102) | read `peer.protocolVersion`; pre-flight gate; handle `unsupported-version` in both relay + direct return paths |
| `src/cli/federation.ts` `federationSend()` (~1158) | propagate structured error to CLI output |
| receive handler for `/federation/message` (daemon route) | emit structured `unsupported-version` on parse-due-to-version failure |
| `docs/PROTOCOL.md` | document the `unsupported-version` error contract + bump version table |
| tests | unit: `isAtLeast`; integration: 0.2.0-sender → mocked 0.1.0-receiver yields structured error, not opaque reject |

---

## Rollout / compatibility

- **Old receiver, new sender:** sender pre-flights on known `protocolVersion` (or down-shapes);
  worst case the old receiver still rejects, but now the sender renders the actionable hint.
- **New receiver, old sender:** old sender omits `protocolVersion`; receiver defaults it to
  `0.1.0` and parses leniently. No regression.
- **Both new:** `protocolVersion` matches; no behavior change. Hot path unaffected.

## Open questions for David

1. **Signing:** OK to start with `protocolVersion` as an *unsigned* diagnostic sibling field
   (lower risk), deferring "version is part of the signed envelope" to a later, reviewed change?
2. **Per-intent minimums:** is a flat daemon `CURRENT_PROTOCOL_VERSION` enough for now, or do
   you want `MIN_VERSION_FOR_INTENT` granularity from day one (e.g. `agent-comms` requires
   ≥0.2.0 while `message` works at 0.1.0)?
3. Confirm the bead's referenced precedents (bd-6twb format-mismatch, signed-contribution
   shape, sender-id normalization) are the failure cases this should subsume.

---

*Verified against `src/cli/federation.ts` and `docs/PROTOCOL.md` on branch `agent/heartbeat`,
2026-06-14. No code changed; this is a proposal artifact only.*
