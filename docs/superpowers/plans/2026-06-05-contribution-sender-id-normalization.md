# Contribution Sender-ID Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every federated `project.contribute` from failing `401 sender-mismatch` by comparing the signed `authorId` and the transport `message.from` on the same canonical 32-char peer-id form.

**Architecture:** One surgical change in `src/daemon/contribution-signing.ts` — the sender-identity equality check in `verifySignedContribution` normalizes both operands to the 32-char canonical peer ID (matching `CANONICAL_PEER_ID_LENGTH`/`derivePeerIdFromPublicKey` in `peers.ts`, which is how peer identity is established everywhere else in OGP) before comparing. Signature verification and the `projectId` bind are untouched. The headline addition is an end-to-end wire test that reproduces the truncated-`from` path the original bd-6twb tests missed.

**Tech Stack:** TypeScript (ESM/NodeNext), vitest, ed25519 via `node:crypto`. Bead: bd-hjoh (P0). Ships as 0.8.2.

**Posture:** Crypto-adjacent → escalate-before-merge. Propose-don't-deploy: land as a PR off `main`, do NOT merge.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/daemon/contribution-signing.ts` | `verifySignedContribution` sender check + new `canonicalPeerId` helper | Modify (~125) |
| `test/contribution-signing.test.ts` | Add wire-path + relay regression tests | Modify |
| `package.json` | Version bump 0.8.1 → 0.8.2 | Modify (Task 4) |
| `dist/**` | Recompiled outputs | Modify (Task 4) |

**Key facts (verified against live code):**
- `peers.ts:91` → `export const CANONICAL_PEER_ID_LENGTH = 32;`
- `peers.ts:131` → `export function derivePeerIdFromPublicKey(publicKey: string): string { return publicKey.substring(0, CANONICAL_PEER_ID_LENGTH); }`
- `contribution-signing.ts` currently imports only **types** from `./projects.js` (`import type { ProjectContribution, AuthorIdentity }`). Keep any `peers.ts` reference type-only — do NOT add a runtime import of `peers.ts` (avoids a require cycle). Define a local `canonicalPeerId` constant/helper instead.
- The buggy check is `contribution-signing.ts:125`: `if (expectedSenderId !== undefined && canonical.authorId !== expectedSenderId)`.
- `federationSend` sets `from: keypair.publicKey.substring(0, 32)` (`federation.ts:1011`) — the 32-char form the receiver sees as `message.from`.

---

## Task 1: Add the failing end-to-end wire test

**Files:**
- Test: `test/contribution-signing.test.ts`

This test reproduces the real wire path: author signs with the full key; transport presents the 32-char prefix as the sender. It MUST fail against current code (proving the bug), then pass after Task 2.

- [ ] **Step 1: Add the wire-path test**

Append inside the existing `describe('contribution-signing', ...)` block in `test/contribution-signing.test.ts` (it already has `author` = `generateKeyPair()` and `base` with `authorId: author.publicKey`):

```ts
  it('accepts when expectedSenderId is the 32-char canonical prefix of the author key (real wire path)', () => {
    // federationSend sends message.from = keypair.publicKey.substring(0, 32);
    // the receiver passes that as expectedSenderId. The signed authorId is the full key.
    const { wire } = buildSignedContribution(base, author.privateKey);
    const wireSenderId = author.publicKey.substring(0, 32); // what transport actually presents
    const res = verifySignedContribution(wire, wireSenderId);
    expect(res.ok).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('still rejects a genuine cross-peer relay (different author vs sender)', () => {
    const other = generateKeyPair();
    const { wire } = buildSignedContribution(base, author.privateKey); // signed by author
    const otherSenderId = other.publicKey.substring(0, 32);            // transport says someone else
    const res = verifySignedContribution(wire, otherSenderId);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('sender-mismatch');
  });

  it('still accepts when expectedSenderId is the full author key (local self path)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const res = verifySignedContribution(wire, author.publicKey); // full key, not prefix
    expect(res.ok).toBe(true);
  });
```

- [ ] **Step 2: Run the new tests — the wire-path one MUST fail**

Run: `npx vitest run test/contribution-signing.test.ts -t "canonical prefix of the author key"`
Expected: **FAIL** — `expected false to be true` (current code compares 88-char authorId to 32-char sender → `sender-mismatch`). This failure proves the bug. The "full author key" test should already pass; the "cross-peer relay" test should already pass.

- [ ] **Step 3: Commit the failing test**

```bash
git add test/contribution-signing.test.ts
git commit -m "test(bd-hjoh): failing e2e wire test — 32-char transport sender vs full signed authorId"
```

---

## Task 2: Normalize the sender comparison (the fix)

**Files:**
- Modify: `src/daemon/contribution-signing.ts`

- [ ] **Step 1: Add the `canonicalPeerId` helper**

Near the top of `src/daemon/contribution-signing.ts`, after the existing imports, add:

```ts
// Peers are identified by a 32-char public-key prefix (BUILD-111). The federation
// transport sets message.from to this prefix, while a signed contribution's authorId
// is the full SPKI hex key. Normalize both to this canonical form before comparing
// sender identity. Must equal CANONICAL_PEER_ID_LENGTH in peers.ts (kept local to
// avoid a runtime import cycle — contribution-signing.ts imports peers/projects types only).
const CANONICAL_PEER_ID_LENGTH = 32;
function canonicalPeerId(key: string): string {
  return key.length > CANONICAL_PEER_ID_LENGTH ? key.substring(0, CANONICAL_PEER_ID_LENGTH) : key;
}
```

- [ ] **Step 2: Replace the buggy sender check**

In `verifySignedContribution`, replace this block (currently ~line 125):

```ts
  if (expectedSenderId !== undefined && canonical.authorId !== expectedSenderId) {
    return { ok: false, reason: 'sender-mismatch' };
  }
```

with:

```ts
  if (
    expectedSenderId !== undefined &&
    canonicalPeerId(canonical.authorId) !== canonicalPeerId(expectedSenderId)
  ) {
    return { ok: false, reason: 'sender-mismatch' };
  }
```

Do NOT touch the `verifyCanonical(...)` signature-verification call above it (it still verifies against the full `canonical.authorId`) or the `projectId` check below it.

- [ ] **Step 3: Run the full signing test file — all pass**

Run: `npx vitest run test/contribution-signing.test.ts`
Expected: **PASS** — including the previously-failing wire-path test (Task 1) and all pre-existing bd-6twb cases (round-trip, tampered, forged, missing, project-mismatch).

- [ ] **Step 4: Run the broader contribution + handler suites**

Run: `npx vitest run test/contribution-signing.test.ts test/contribution-upsert.test.ts test/project-contribute-verify.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit the fix**

```bash
git add src/daemon/contribution-signing.ts
git commit -m "fix(bd-hjoh): compare contribution authorId and transport sender on canonical 32-char form

Federated project.contribute compared the full 88-char signed authorId against the
32-char canonical message.from (keypair.publicKey.substring(0,32)), so every signed
contribution failed 401 sender-mismatch. Normalize both operands to the 32-char
canonical peer id before comparing. Signature verification + projectId bind unchanged;
genuine cross-peer relay still rejected."
```

---

## Task 3: Full suite regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all green (baseline was 317 passing; this adds 3 tests → ~320). If any non-related test fails, confirm it is a pre-existing flake (e.g. a stray `EADDRINUSE:3000`) and not caused by this change — investigate any other failure.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 4: Version bump + build + escalation note

**Files:**
- Modify: `package.json` (version)
- Modify: `dist/**` (recompiled)
- Create: `docs/escalations/2026-06-05-contribution-sender-id.md`

- [ ] **Step 1: Write the escalation note**

Create `docs/escalations/2026-06-05-contribution-sender-id.md` summarizing: the bug (full-key authorId vs 32-char transport sender → 100% federated-contribute 401), that it's a regression introduced by bd-6twb's sender-binding check, the fix (canonical-form comparison), why it's safe (signature verification untouched; cross-peer relay still rejected — narrower trust, not looser), and that an end-to-end wire test now guards it. State no new crypto primitive was added.

- [ ] **Step 2: Bump the version**

Run: `npm version patch --no-git-tag-version`
Expected: `package.json` version becomes `0.8.2`; `package-lock.json` updated.

- [ ] **Step 3: Rebuild dist**

Run: `npm run build`
Expected: exit 0; `dist/daemon/contribution-signing.js` reflects the fix.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json dist docs/escalations/2026-06-05-contribution-sender-id.md
git commit -m "chore(release): 0.8.2 — fix federated contribution sender-mismatch (bd-hjoh)

Escalation note + compiled outputs. Patch release: bugfix only, no API change."
```

---

## Task 5: PR + live end-to-end verification

**Files:** none (integration)

- [ ] **Step 1: Push the branch and open a PR (do NOT merge)**

```bash
git push -u origin <branch>
gh pr create --base main \
  --title "fix(bd-hjoh): federated contribution sender-mismatch (0.8.2)" \
  --body "<summary: 100% federated project.contribute failed 401 sender-mismatch because bd-6twb compared full-88-char signed authorId vs 32-char canonical message.from; fix normalizes both to the canonical peer-id form; e2e wire test added; signature verification + cross-peer relay rejection unchanged. Link spec + escalation note. Crypto-adjacent → escalate-before-merge, propose-don't-deploy.>"
```
Expected: PR opened against `main`, left unmerged.

- [ ] **Step 2: Live end-to-end verification against Cosmo**

The unit tests approximate the wire; this proves it. With the human's standing OK to coordinate with the peer, install the fixed build locally (`npm run build` already done) and run a controlled live contribution. NOTE: the running daemon is a separate long-lived process — to exercise the fixed receiver path you need the *receiver* (Cosmo) on the fix too; for the SENDER-side confirmation, the local CLI uses the freshly built `dist`. Run:

```bash
ogp --for openclaw project contribute signal note "bd-hjoh fix verification: signed federated contribute (2026-06-05)"
```
Expected (sender side): local store OK + `↗ Synced to N peers` **without** `Send failed: 401 ... sender-mismatch`.

IMPORTANT caveat to record in the bead: the 401 is enforced by the **receiver**. Junior's fix corrects Junior-as-receiver. For the Junior→Cosmo push to stop 401-ing, **Cosmo must also be running the fix** (≥0.8.2). If Cosmo is still on 0.8.1, the push will still 401 until Cosmo upgrades — that is expected and is a coordination step, not a failure of this fix. Capture which side(s) are on the fixed version when reporting the live result.

- [ ] **Step 3: Update the bead with the live result**

```bash
bd comment bd-hjoh "<live verification result: sender-side green; note Cosmo's version and whether the full round-trip succeeded or awaits Cosmo upgrade>"
```

---

## Self-Review

**Spec coverage** (against `2026-06-05-contribution-sender-id-normalization-design.md`):
- §3 the fix (canonical-form comparison, local helper, type-only peers import, signature + projectId unchanged) → Task 2 ✓
- §4 behavior matrix (wire path accepted, full-key accepted, cross-peer rejected, projectId rejected, tampered rejected) → Tasks 1 + 2 + 3 ✓
- §5 tests 1–5 (wire round-trip, full-key sender, cross-peer relay, projectId, existing pass) → Task 1 (3 new tests) + Task 3 (full suite) ✓
- §6 live federated verification → Task 5 Step 2 ✓
- §8 ships as 0.8.2 patch → Task 4 ✓; escalate-before-merge / propose-don't-deploy → Task 5 ✓

**Placeholder scan:** No "TBD/TODO". The PR body and escalation note are described with their required content, not deferred. The `<branch>` and `<summary>` in Task 5 are fill-in-at-runtime values (branch name, generated PR text), not missing implementation.

**Type/identifier consistency:** `canonicalPeerId(key: string): string` and `CANONICAL_PEER_ID_LENGTH = 32` defined in Task 2 Step 1 and used in Task 2 Step 2. `verifySignedContribution(wire, expectedSenderId?, expectedProjectId?)` signature unchanged — only its body changes. Test helper `buildSignedContribution(base, author.privateKey)` and `base.authorId = author.publicKey` match the existing test file's setup.

**Known caveat surfaced (Task 5 Step 2):** the receiver enforces the check, so a full Junior→Cosmo round-trip also requires Cosmo ≥0.8.2. The plan calls this out explicitly so a still-401 result post-fix is correctly attributed to Cosmo's version, not a bad fix.
