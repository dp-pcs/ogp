# Design: Normalize sender↔author comparison in signed contributions (bd-hjoh)

**Date:** 2026-06-05
**Author:** agent.ogp-a-dp-agent
**Status:** Approved (brainstorming) — pending implementation plan
**Bead:** bd-hjoh (P0). Crypto-adjacent → escalate-before-merge. Propose-don't-deploy → ships as 0.8.2.

---

## 1. Problem (live-reproduced)

Every federated `project.contribute` fails with `401 Unauthorized — Contribution
signature rejected: sender-mismatch`. Reproduced live 2026-06-05: local store
succeeds (ULID minted), the federated push to the peer is rejected.

**Root cause — a format mismatch in the bd-6twb sender-binding check:**

- The signed contribution's `authorId` (the canonical field the author signs) is
  the **full 88-char SPKI hex public key** (`getPublicKey()`).
- The federation transport sets `message.from` to the **32-char canonical peer ID**
  — `keypair.publicKey.substring(0, 32)` (BUILD-111: peers are identified by a
  32-char public-key prefix, stable across tunnel/URL changes).
- The receiver `handleProjectContribute` (`message-handler.ts:782`) calls
  `verifySignedContribution(contribution, message.from, projectId)`, and
  `verifySignedContribution` (`contribution-signing.ts:125`) enforces
  `canonical.authorId !== expectedSenderId → 'sender-mismatch'`.

So it compares an **88-char string to a 32-char string** — always unequal — so
**every federated signed contribution 401s, on every box, regardless of identity,
keypair, or project membership.**

**Why it hid:** bd-6twb's unit tests pass the *same full key* as both `authorId`
and `expectedSenderId`, so the equality check passed in tests. The real wire path,
where transport truncates `from` to 32 chars, was never exercised — there is no
end-to-end wire test.

**Disproven theories (both red herrings, settled by the live test):** not a keypair
self-split (the daemon's key is single and consistent), and not project-membership
drift (the peer already holds contributions authored by the current key). The
signature itself verifies fine — only the *sender-identity equality* check is broken.

## 2. Scope

**In scope:** fix the sender-identity equality so the signed `authorId` and the
transport `message.from` are compared on the **same canonical form**, plus an
end-to-end wire test that reproduces the truncated-`from` path.

**Out of scope (→ bd-o14d):** the private-key-as-truth keypair guard and the
`ogp doctor` diagnostic. Those are real hardening for a *different* class (keypair
self-split / membership drift) but are NOT needed to fix this 401. Split to their
own P2 bead.

**Noted, not fixed here:** the local `signal` project's member list lists the
daemon under a stale key. Cosmetic to this bug (the fixed flow works regardless);
flag for separate cleanup.

## 3. The fix

In `verifySignedContribution` (`src/daemon/contribution-signing.ts`), the
sender-identity check must normalize both sides to the canonical 32-char peer ID
before comparing.

`src/daemon/peers.ts` already exports the canonicalization used everywhere else:

```ts
export const CANONICAL_PEER_ID_LENGTH = 32;
export function derivePeerIdFromPublicKey(publicKey: string): string {
  return publicKey.substring(0, CANONICAL_PEER_ID_LENGTH);
}
```

The check changes from raw equality:

```ts
// BEFORE (bug): 88-char authorId vs 32-char expectedSenderId — never equal
if (expectedSenderId !== undefined && canonical.authorId !== expectedSenderId) {
  return { ok: false, reason: 'sender-mismatch' };
}
```

to a canonical-form comparison that accepts `expectedSenderId` given as either a
full key or a 32-char prefix (so the check is correct no matter which form the
caller passes):

```ts
// AFTER: compare on the canonical peer-id form
if (expectedSenderId !== undefined) {
  const authorCanonical = canonicalPeerId(canonical.authorId);
  const senderCanonical = canonicalPeerId(expectedSenderId);
  if (authorCanonical !== senderCanonical) {
    return { ok: false, reason: 'sender-mismatch' };
  }
}
```

where `canonicalPeerId(k)` returns the first `CANONICAL_PEER_ID_LENGTH` (32)
characters of `k` (a key already shorter than 32 is returned as-is). This is a
local helper in `contribution-signing.ts` mirroring `derivePeerIdFromPublicKey`,
to avoid a runtime import cycle between `contribution-signing.ts` and `peers.ts`
(today `contribution-signing.ts` only imports *types*, not runtime symbols, from
`peers.ts`/`projects.ts`; keeping it type-only matters). The constant value `32`
must match `CANONICAL_PEER_ID_LENGTH`.

**Unchanged:**
- **Signature verification** (`verifyCanonical` against the full `canonical.authorId`)
  — untouched. We still verify the signature against the full key the author signed
  with; only the sender-*identity* equality is normalized.
- The **`projectId` bind** (`project-mismatch`) — untouched.
- The stored `record` (derived from signed bytes) — untouched. `record.authorId`
  remains the full key.

### Why prefix comparison is safe

`derivePeerIdFromPublicKey` is the canonical identity used across the whole peer
system (federation routing, scopes, membership matching all key on the 32-char
prefix). The comment at `peers.ts` notes 32 is chosen specifically to clear the
shared Ed25519 DER header (the first 24 chars are identical for all keys), so a
32-char prefix is a real discriminator, not a collision risk. Comparing on this
form makes the contribution sender-check consistent with how every other part of
OGP already establishes peer identity.

## 4. Error / behavior matrix (after fix)

| Case | Before | After |
|------|--------|-------|
| Honest contribution, transport `from` = 32-char prefix of author | **401 sender-mismatch (bug)** | **accepted** |
| `expectedSenderId` passed as full key (e.g. local self-path) | accepted (full==full) | accepted (prefix==prefix) |
| Genuine relay: author ≠ sender (different peers) | 401 sender-mismatch | 401 sender-mismatch (prefixes differ) — **still rejected** |
| Tampered signature / bad payload | rejected | rejected (unchanged) |
| Wrong project | project-mismatch | project-mismatch (unchanged) |

The security property is preserved: a contribution whose signed author is a
*different peer* than the transport sender is still rejected — the fix only stops
rejecting the case where they are the **same** peer expressed in two formats.

## 5. Testing (TDD, vitest)

The headline addition is the **end-to-end wire test** the original work lacked:

1. **Wire round-trip (the regression guard):** author builds a signed contribution
   with the full-key `authorId`; simulate transport by passing
   `expectedSenderId = authorId.substring(0, 32)` (exactly what `federationSend`
   does); assert `verifySignedContribution(...).ok === true`. This test fails
   against today's code and passes after the fix.
2. **Full-key sender still works:** `expectedSenderId` = full key → accepted
   (the local self-contribute path, which passes the full key).
3. **Genuine cross-peer relay still rejected:** author key A, `expectedSenderId`
   = 32-char prefix of a *different* key B → `sender-mismatch`.
4. **projectId mismatch still rejected** (regression — unchanged behavior).
5. **Existing bd-6twb tests still pass** (tampered/forged/missing cases).

## 6. Verification beyond unit tests

After the code fix lands, re-run the **live federated contribution** to the peer
(the same controlled test that reproduced the 401) and confirm it now succeeds
end-to-end. This is the proof the unit tests can only approximate. (Outward-facing;
run with the human's standing OK to coordinate with the peer.)

## 7. Decisions log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Compare on full keys or canonical prefix? | **Canonical 32-char prefix** (consistent with BUILD-111 peer identity everywhere else) |
| 2 | Accept `expectedSenderId` as full key OR prefix? | **Both** — normalize each side, so callers passing either form are correct |
| 3 | Bundle the keypair-guard / `ogp doctor`? | **No** — split to bd-o14d (P2 hardening) so this P0 ships small |
| 4 | Helper location | **Local helper in `contribution-signing.ts`** mirroring `CANONICAL_PEER_ID_LENGTH`, to keep the `peers.ts` import type-only (no runtime cycle) |

## 8. Risk

- **Crypto-adjacent** (federation auth check) → escalate-before-merge. Mitigated:
  the change is *narrower* trust, not looser — signature verification is untouched;
  only the same-peer-two-formats false-negative is fixed; cross-peer relay stays
  rejected.
- **Blast radius:** this is the one check that currently blocks 100% of federated
  signed writes, so the fix is strictly unblocking; the matrix in §4 shows no
  previously-rejected malicious case becomes accepted.
- Ships as 0.8.2 (patch — bugfix, no API change). The keypair guard (bd-o14d) is
  independent and later.
