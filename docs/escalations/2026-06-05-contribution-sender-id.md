# Escalation: Contribution sender-id normalization (bd-hjoh)

**Date:** 2026-06-05
**Author:** agent.ogp-a-dp-agent
**Posture:** crypto-adjacent → escalate-before-merge. Propose-don't-deploy: PR open, NOT merged. Ships as 0.8.2.
**Spec:** `docs/superpowers/specs/2026-06-05-contribution-sender-id-normalization-design.md`
**Plan:** `docs/superpowers/plans/2026-06-05-contribution-sender-id-normalization.md`
**Bead:** bd-hjoh (P0).

## Why this is escalated

It changes the federation authentication path for `project.contribute` (the
sender↔author identity check). No new crypto primitive is introduced; signature
verification is untouched. But it is a correctness change to an auth gate, so it
gets a written escalation and a human review before merge.

## The bug (a regression from bd-6twb / 0.8.0)

bd-6twb added a sender-binding check to the contribution receiver:
`canonical.authorId === expectedSenderId`. But:

- `canonical.authorId` (the signed canonical field) is the **full 88-char ed25519
  SPKI hex public key** (`getPublicKey()`).
- `expectedSenderId` is `message.from`, which the federation transport sets to the
  **32-char canonical peer-id prefix** (`keypair.publicKey.substring(0, 32)`,
  BUILD-111 — peers are identified by this prefix, stable across tunnel/URL changes).

88 chars never equal 32 chars, so **every federated signed contribution was
rejected `401 sender-mismatch`, on every box, regardless of identity.** Reproduced
live 2026-06-05 (Junior → Cosmo, project `signal`): local store succeeded, the
federated push 401'd.

It hid because bd-6twb's unit tests passed the *same full key* as both `authorId`
and `expectedSenderId`, never exercising the truncated-`from` wire path. No
end-to-end wire test existed.

(Two earlier theories — keypair self-split and project-membership drift — were
investigated and disproven by the live test. The daemon's key is single/consistent
and the peer already held contributions authored by the current key.)

## The fix

In `verifySignedContribution` (`src/daemon/contribution-signing.ts`), normalize both
operands to the canonical 32-char peer-id form before comparing:

```ts
canonicalPeerId(canonical.authorId) !== canonicalPeerId(expectedSenderId)
```

This is the same identity form (`derivePeerIdFromPublicKey`, `CANONICAL_PEER_ID_LENGTH=32`)
that the entire OGP peer system already uses for routing, scopes, and membership.

## Why it is safe (narrower trust, not looser)

- **Signature verification is untouched.** `verifyCanonical` still runs first, against
  the **full** `canonical.authorId`. An attacker cannot forge a contribution for a key
  they do not hold. The prefix comparison is identity *reconciliation* layered on top
  of real authenticity, not the authenticity gate itself.
- **Genuine cross-peer relay is still rejected** — a contribution signed by peer A but
  presented by peer B yields different 32-char prefixes → `sender-mismatch`.
- The change only stops rejecting the case where author and sender are the **same** peer
  expressed in two formats (full key vs prefix). No previously-rejected malicious case
  becomes accepted (see spec §4 matrix).
- An end-to-end wire test (passing `expectedSenderId = authorId.substring(0,32)`, exactly
  what `federationSend` does) now guards against regression. Reviewed by an independent
  code-quality pass: sound, no Critical/Important findings.

## Known follow-ups (not blocking)

- **Receiver-side coordination:** the 401 is enforced by the *receiver*. A full
  Junior→Cosmo round-trip requires **both** peers on ≥0.8.2. Junior's fix alone corrects
  Junior-as-receiver; Cosmo (an ECS container) must be reloaded onto ≥0.8.2 for the push
  to succeed. This is a rollout step, not a fix defect.
- **Optional hardening (separate bead):** if the contribution authenticity gate should
  exceed OGP's 32-bit peer-id discrimination, resolve `message.from` → stored
  `peer.publicKey` and compare full-key-to-full-key. Filed as a P3 follow-up.
- **Keypair guard / `ogp doctor`** (bd-o14d, P2): private-key-as-truth + self-key/membership
  diagnostic. Designed during this investigation but NOT needed for this fix.

## Reviewer ask

Confirm: (1) comparing sender identity on the 32-char canonical prefix is acceptable for
the contribution path given the full signature is independently verified; (2) the
both-sides-≥0.8.2 rollout coordination is understood for the Cosmo round-trip.
