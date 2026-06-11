# Escalation: Federated Project Ownership (bd-hy3o)

**Date:** 2026-06-05
**Author:** agent.ogp-a-dp-agent
**Posture:** crypto-adjacent → escalate-before-merge. Propose-don't-deploy: PR open, NOT merged. Ships as 0.9.0.
**Spec:** `docs/superpowers/specs/2026-06-05-project-ownership-design.md`
**Plan:** `docs/superpowers/plans/2026-06-05-project-ownership.md`
**Bead:** bd-hy3o. Unblocks bd-tq31 (per-contribution retract, author-OR-owner authority).

## Why this is escalated

It introduces **signed authority records on the federation path** — who owns a
project, and therefore who may moderate it (retract contributions, etc.). No new
crypto primitive is added; it reuses `signCanonical`/`verifyCanonical`/the canonical
32-char peer-id form (same as bd-6twb/bd-hjoh). But it defines a new trust-bearing
concept, so it gets a written escalation and human review before merge.

## What it does

Ownership is **derived from immutable signed records**, not a mutable replicated set:

- A signed **`ProjectCreation`** roots ownership: `{ projectId, creatorKey, createdAt,
  provenance: 'original' | 'legacy-claim' }`, signed by the creator. The creator's
  key is the root owner.
- Append-only signed **`OwnerGrant`** records (`grantedBy → grantee`, each signed by
  the grantor) extend ownership.
- **`deriveOwners(creation, grants)`** computes the owner set by fixpoint: seed =
  {creator}, then admit any grant whose signature verifies AND whose grantor is
  already an owner, until no change. Any peer derives the same set independently, so
  ownership **converges under bd-53c union-merge with no consensus protocol**.
- **`isOwner(projectId, key)`** is the single consumer API (what bd-tq31 calls).

New intents: `project.create` (signed creation, member-gated for legacy claims) and
`project.grant-owner` (signed grant). New CLI: `create` now signs; `add-owner`,
`claim-ownership`, `owners`.

## Trust properties (and the one the review caught)

Verified sound by an independent code review:
- **Sound:** ownership only grows from the cryptographically-verified creator through
  signature-verified grants whose grantor is already an owner. No unrooted admission.
- **Complete + order-independent:** the fixpoint re-scans until stable.
- **Forgery-resistant:** wrong-signer grants and outer-field-swap (claiming a different
  grantedBy/creatorKey than what was signed) are both rejected — the same defense class
  as the bd-6twb authorId binding. Timestamps are also signature-bound.
- **Rootless cycles / non-owner self-grants admit nobody.**

**Security gap found in review and fixed before ship:** the first cut let a self-signed
`provenance:'original'` creation silently *overwrite* an existing `legacy-claim` creation,
which would let a non-member/non-owner stranger re-root ownership of a legacy-claimed
project. Fixed: a creation is accepted only when none exists, except deterministic
legacy→legacy convergence; an `'original'` never overwrites any existing creation;
identical re-delivery is an idempotent no-op. Regression tests added.

**Legacy claim** (`claim-ownership`) is **member-gated** — only an existing project
member may root ownership of a pre-existing project (the member check tolerates 32-char /
full-key / email member forms). Among members it is first-claimer with a deterministic
earliest-createdAt + key tie-break.

## What it does NOT do (v1 scope)

- **No remove-owner / revocation** — revocation in an append-only grant model needs
  signed revocation events + dominance rules; deferred to its own bead.
- No piggyback of the creation onto existing `project.join`/`project.contribute` messages
  — creation federates via `project.create`/claim/grant. Sufficient for the single-owner
  case (the owner holds the creation locally); a small follow-up if a peer needs the
  creation without a claim/grant.

## Verification

- Full suite green; `tsc --noEmit` clean. Ownership-specific tests cover: sign/verify,
  the fixpoint (transitive chains, forged/orphan rejection, rootless cycle, self-grant,
  field-swap, cross-project), storage + `isOwner`, out-of-order grant resolution, the
  original-overwrite security fix, and bd-53c union-merge convergence.
- Completion scripts (bash+zsh) and README updated, guarded by a grep-assertion test.

## Reviewer ask

Confirm: (1) creator-rooted signed-grant ownership (derived, not consensus) is the
intended model; (2) the member-gated legacy claim is an acceptable bound for
pre-existing projects; (3) no-remove-owner in v1 is acceptable.
