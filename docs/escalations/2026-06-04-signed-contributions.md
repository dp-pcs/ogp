# Escalation: Signed Project Contributions (bd-6twb)

**Date:** 2026-06-04
**Author:** agent.ogp-a-dp-agent
**Posture:** crypto-adjacent → escalate-before-merge. Propose-don't-deploy: PR open, NOT merged to main.
**Spec:** `docs/superpowers/specs/2026-06-04-signed-contributions-design.md`
**Plan:** `docs/superpowers/plans/2026-06-04-signed-contributions.md`
**Bead:** bd-6twb (Story A). Unblocks bd-53c (Story B, the backfill).

## Why this is escalated

This change adds a **signature-verification gate on the `project.contribute`
federation path**. It does not introduce a new crypto primitive — it reuses the
existing, in-production `signCanonical` / `verifyCanonical` (`src/shared/signing.ts`),
the same primitives that already authenticate the federation handshake. But it
does change the trust semantics of an inbound federated intent, so it gets a
written escalation and a human review gate before merge.

## What changed (trust-relevant summary)

Every project contribution is now **author-signed**:

- The author mints a **ULID** and signs a canonical object
  `{ id, projectId, authorId, entryType, summary, metadata, timestamp }` with their
  ed25519 private key. In OGP, `authorId` **is** the ed25519 public key, so the
  verification key needs no distribution.
- The `project.contribute` **receiver** (`handleProjectContribute`) enforces three
  bindings before storing, all at the 401 layer:
  1. **signature** verifies against the `authorId` embedded *inside* the signed
     bytes (so authorId cannot be swapped without breaking the signature);
  2. **sender == author** — the signed `authorId` must equal the
     federation-authenticated `message.from` (relay is rejected on the live path;
     relayed-merge is a separate, signature-gated path reserved for bd-53c);
  3. **project match** — the signed `projectId` must equal the route project
     (a contribution signed for project A cannot be replayed into project B).
  A missing envelope is a **strict 400** — there is **no backward-compat grace
  window** (David-approved 2026-06-04). An invalid signature/sender/project is 401.
- The **stored record is derived from the signed bytes**, never from the unsigned
  top-level payload. The human notification was switched to read the signed fields
  too, removing a notification-spoofing surface.
- `upsertContribution` is **idempotent by id** and **independently re-verifies** the
  signature from a reconstructed canonical form (defense in depth). It does *not*
  require project membership — a verified signature is sufficient provenance, which
  is the hook bd-53c's relayed-backfill merge depends on.
- A one-time, idempotent **migration** (run on daemon start) tags pre-existing
  unsigned contributions `verified:false, legacy:true`, preserving their original
  ids (no re-mint, no data loss).

## What did NOT change

- No new crypto primitive; `signCanonical`/`verifyCanonical` reused verbatim.
- The both-online happy path of every other intent is untouched.
- `maxAgeMs` (staleness window) is intentionally disabled for contributions only —
  they are durable artifacts, not ephemeral messages. Signature verification itself
  is unchanged.

## Verification

- 300 tests pass (35 files); `tsc --noEmit` clean.
- Crypto core, receiver gate, and the full end-to-end round-trip were each
  independently reviewed. The author→wire→receiver→store canonical byte-match
  (across metadata-undefined / simple / nested / integer-key shapes) was verified
  empirically and is guarded by a regression test.

## Known follow-ups (not blocking this PR)

- `contributeToProject` (the old receiver-minting, unsigned-write function) is now
  dead in the live paths (its CLI import was removed) but still exists in
  `projects.ts`. File a follow-up to prune or repoint it through the signing path so
  no future caller reintroduces unsigned writes.
- bd-53c (Story B) will pass the original `payloadStr` through the relayed-merge
  rather than reconstructing it, retiring the canonical-key-order sync-point between
  `buildSignedContribution` and `upsertContribution`.

## Reviewer ask

Confirm: (1) the strict-400 no-grace-window stance is acceptable for the current
both-sides-are-our-daemons deployment; (2) the transport-trust-plus-per-contribution-
signature model is the intended trust boundary; (3) the legacy-tagging (vs reject)
treatment of the existing unsigned slice is acceptable.
