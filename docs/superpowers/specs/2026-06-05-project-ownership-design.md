# Design: Federated Project Ownership (bd-hy3o)

**Date:** 2026-06-05
**Author:** agent.ogp-a-dp-agent
**Status:** Approved (brainstorming) — pending implementation plan
**Bead:** bd-hy3o (P2). Crypto-adjacent → escalate-before-merge. Propose-don't-deploy. Ships ~0.9.0.
**Blocks:** bd-tq31 (per-contribution retract — needs `isOwner` for author-OR-owner authority).

---

## 1. Problem & goal

OGP projects have `members[]` but **no owner concept**. There is no way to say
"these keys are authorized to moderate this project," which blocks owner-authorized
operations — specifically bd-tq31's per-contribution retract (author-OR-owner).
Owners must be recognized **across the federation**: an owner on Junior must
validate as an owner on Cosmo, with no central authority.

**Goal:** a project ownership model where "is key X an owner of project P?" is a
verifiable, eventually-consistent question any peer can answer locally, built on
OGP's existing signed-event grain (no consensus protocol).

## 2. Model: derived ownership from signed records

Ownership is **derived**, not a mutable replicated set. A project carries two new
pieces of signed provenance; `isOwner` is computed from them.

```ts
interface ProjectCreation {        // the root of trust
  projectId: string;
  creatorKey: string;              // full ed25519 key; its canonical-32 form is the root owner
  createdAt: string;               // ISO
  provenance: 'original' | 'legacy-claim';
  signature: string;               // signCanonical, signed by creatorKey
  payloadStr: string;              // exact signed bytes
}

interface OwnerGrant {             // append-only grant record
  id: string;                      // ULID, minted by grantor (idempotency key)
  projectId: string;
  grantee: string;                 // full ed25519 key being made an owner
  grantedBy: string;               // full ed25519 key issuing the grant (must already be an owner)
  grantedAt: string;               // ISO
  signature: string;               // signCanonical, signed by grantedBy
  payloadStr: string;
}
```

Added to the `Project` interface (both optional, so legacy records remain valid):
```ts
  creation?: ProjectCreation;
  ownerGrants?: OwnerGrant[];      // append-only
```

### `isOwner(project, key): boolean` — the entire consumer API

Pure function in `projects.ts`. `key` may be a full key or a 32-char prefix; all
comparisons are on the canonical 32-char form (`canonicalPeerId`, reused from
contribution-signing/bd-hjoh).

`isOwner` is true iff **either**:
- `canonicalPeerId(key) === canonicalPeerId(project.creation.creatorKey)` (root owner), **or**
- there is a valid grant chain to `key`: a grant `g` where `canonicalPeerId(g.grantee) === canonicalPeerId(key)`, `g`'s signature verifies against `g.grantedBy`, **and** `isOwner(project, g.grantedBy)` (recursively, rooting at the creator).

Implementation note: resolve by fixpoint over the grant set (seed owners = {creator};
repeatedly admit any grant whose `grantedBy` is already an owner and whose signature
verifies; until no change). This terminates (grants are finite), handles transitive
chains (creator→A→B→C), and ignores forged grants (signed by a non-owner) and
orphan grants (no root). No recursion-depth or cycle hazard.

### Why this shape

Grants and the creation record are **immutable signed facts**. Any peer verifies
them independently, so the derived owner set **converges automatically under bd-53c
union-merge** (union of immutable grants → identical derived set everywhere) with
**no consensus protocol and no removal-convergence problem**.

### Explicitly OUT of v1 (YAGNI)

- **remove-owner / revocation** — revoking in an append-only grant model needs signed
  revocation events + dominance/ordering rules; genuinely harder and not needed for
  retract. Deferred to its own bead.
- Owner-gating of operations beyond what bd-tq31 needs.
- Any UI.

## 3. Federation flow & operations

All three operations reuse the existing signed path
(`federationSend` → `handleMessage` → signed envelope), exactly like `project.contribute`.
Grants/creation verify on the canonical-32 form, consistent with bd-hjoh.

### 3.1 `project.create` (new intent)
`ogp project create <id> <name>` now also mints + signs a `ProjectCreation`
(`provenance: 'original'`, `creatorKey` = local key) and stores it on the project.
The creator is the root owner.

**Lazy propagation:** the creation record rides along as metadata on the *first*
`project.join` / `project.contribute` this peer sends for the project (not a separate
eager broadcast). A peer learns the creator the moment it first sees the project.
Receiver stores `creation` verbatim after verifying the signature against `creatorKey`.

### 3.2 `project.grant-owner` (new intent)
`ogp project add-owner <projectId> <granteeKey>`:
1. CLI checks `isOwner(project, myKey)` locally; fail fast (`You are not an owner`) if not.
2. Mint ULID, build + `signCanonical` the `OwnerGrant` (signed by my key), append locally.
3. `federationSend` `project.grant-owner` to all project peers.

Receiver `handleProjectGrantOwner`:
- Verify the grant signature against `grantedBy` (canonical-form sender check, like contributions).
- Verify `grantedBy` is an owner **in the receiver's current view** (`isOwner`).
- If owner: append (idempotent by grant `id`). If not yet resolvable (grantor not yet
  a known owner): **defer to a pending set** (see §3.4) — do NOT reject for missing root.
- Grant whose `grantedBy` is provably a non-owner (resolvable and false) → `403`.

### 3.3 `project.create` for legacy projects — the claim
`ogp project claim-ownership <projectId>` for a pre-existing local project with no
`creation`. Mints a `ProjectCreation` with `provenance: 'legacy-claim'`, signed by
the claimant, federates it (same lazy + on-demand path).

**Member-gated (hardening).** A claim is only valid if the claimant's key is already
in the project's `members[]` — a random federated peer cannot claim ownership of a
project it has no relationship to; only an existing participant can root ownership.
Locally the CLI fails fast if the caller is not a member; the receiver rejects a
legacy-claim whose `creatorKey` is not a member of the project in its view (`403`).
For the single-operator case this is a no-op (you are a member); for the federated
case it turns "anyone first" into "a participant first."

**Convergence on competing claims** (two *members* both claim a legacy project):
receiver keeps the claim with the **earliest `createdAt`, tie-broken by lowest
canonical key** — deterministic, so all peers converge on the same root owner.
A claim is **rejected (`409`)** if a `provenance: 'original'` creation already exists;
a legacy-claim never overrides an original.

### 3.4 Out-of-order arrival (creation/grant ordering)
Federation does not guarantee a grant arrives after the creation it roots in. Handling:
- A grant that is not yet resolvable (its `grantedBy` is not yet a known owner) is held
  in a **pending set** on the project, not rejected.
- On every new creation or accepted grant, re-run the `isOwner` fixpoint and admit any
  now-resolvable pending grants.
- A grant never gets permanently rejected for a *missing* root — only for a *provably
  non-owner* grantor. This preserves eventual consistency.

### 3.5 bd-53c union-merge interaction
Creation + grants are immutable signed records → the future backfill union-merges them
(union grants, dedupe by `id`, keep earliest-wins creation per §3.3), then re-derives
`isOwner`. No special-casing beyond treating pending/unresolved grants as data to retain.

## 4. CLI surface

| Command | Behavior |
|---------|----------|
| `ogp project create <id> <name>` | Existing — now ALSO mints+signs ProjectCreation (creator = root owner). Backward compatible: scripted creates keep working, creator auto-becomes owner. |
| `ogp project add-owner <id> <granteeKey>` | NEW — signed owner-grant, federates to peers. Fails if caller is not an owner. |
| `ogp project claim-ownership <id>` | NEW — legacy backfill: signed creation for a pre-existing project (provenance: legacy-claim). |
| `ogp project owners <id>` | NEW — read-only: list derived owners (creator + grant chain), showing grantedBy→grantee and `legacy-claim` provenance. The debuggability surface. |

## 5. Documentation & tooling deliverables (first-class, not afterthoughts)

These ship **with** the feature, not later (per the recent stale-completion/README cleanup lesson):

- **Shell completion** — add `create` (exists), `add-owner`, `claim-ownership`, `owners`
  to the `project` subcommand list in BOTH `scripts/completion.bash` and
  `scripts/completion.zsh`. Syntax-check both (`bash -n`, `zsh -n`).
- **README** — a new "Project Ownership (v0.9.0+)" subsection under project docs:
  what ownership is, the four commands, the creator-rooted-grant model in one
  paragraph, and the legacy `claim-ownership` path. Update the project command table.
- A verification step confirms `ogp project <Tab>` surfaces the new commands and the
  README reflects them.

## 6. Error / behavior matrix

| Case | Result |
|------|--------|
| Grant signed by a provable non-owner | reject `403` |
| Grant whose grantor not yet known (out-of-order) | defer to pending, re-evaluate later (no reject) |
| `claim-ownership` when an `original` creation exists | reject `409` |
| `claim-ownership` by a non-member (local pre-check / receiver) | fail fast / reject `403` |
| Two legacy claims race (both members) | earliest createdAt, key tie-break (deterministic) |
| Creator self-grant | no-op (already owner) |
| Duplicate grant id (re-apply / backfill) | idempotent no-op |
| `add-owner` by a non-owner (local pre-check) | fail fast, no federation send |
| Tampered creation/grant signature | reject (verifyCanonical) |

## 7. Testing (TDD, vitest, temp-dir isolation)

1. `isOwner`: creator is owner; non-member is not; valid-chain grantee is; grantee of a
   grant signed by a non-owner is NOT (forged chain rejected).
2. Transitive depth: creator→A→B→C all resolve (each grant by an existing owner).
3. `project.create` round-trip: signed creation verifies + stored verbatim; tampered creatorKey fails.
4. Out-of-order: grant arrives before its creation → pending → resolves when creation lands.
5. Legacy claim: a member's claim is accepted; a **non-member's claim is rejected (403)**;
   two competing *member* claims converge (earliest createdAt, key tie-break); claim
   rejected when an `original` creation exists.
6. `project.grant-owner` receiver: provable non-owner grantor → 403; idempotent re-apply.
7. Union-merge convergence: two peers with disjoint grant subsets derive the SAME owner set after merge.
8. Completion scripts include the new commands (grep assertion); README updated (grep assertion).

## 8. Decisions log (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Ownership model | **Creator-rooted, signed grants** (derived, not a replicated mutable set) |
| 2 | Root of trust | **Signed creation record** (`project.create` becomes a signed event) |
| 3 | Legacy projects | **One-time signed creation backfill** via `claim-ownership` (provenance: legacy-claim), **member-gated** (only an existing project member may claim) + deterministic race convergence |
| 4 | remove-owner in v1 | **No** — revocation deferred to its own bead |
| 5 | Completion + README | **First-class deliverables shipped with the feature** |

## 9. Risks

- **Crypto-adjacent** (signed authority records on the federation path) → escalate-before-merge.
  Mitigated: reuses `signCanonical`/`verifyCanonical`/`canonicalPeerId` — no new crypto;
  ownership is *derived* from immutable signed facts (no mutable shared state to corrupt).
- **Legacy claim trust:** claims are **member-gated** — only an existing project member
  may root ownership of a legacy project, so a random federated peer cannot hijack it.
  Among members it is first-claimer (deterministic tie-break); `provenance: legacy-claim`
  keeps it honest and auditable, distinct from an original creation. Residual: a
  malicious *member* could still race-claim, but membership already implies a trust
  relationship with the project, so this is an acceptable bound for v1.
- **Append-only growth:** grants accumulate. Bounded in practice (few owners per project);
  revocation/compaction is a future bead, not a v1 concern.
- **bd-tq31 coupling:** this exists to unblock retract. `isOwner` is the only API retract
  consumes; keeping it one pure function limits the coupling surface.
