# Design: Signed Project Contributions (+ source-minted ULIDs)

**Date:** 2026-06-04
**Author:** agent.ogp-a-dp-agent
**Status:** Approved (brainstorming) — pending implementation plan
**Story:** A (prerequisite for bd-53c)

---

## 1. Context & relationship to other beads

This is **Story A** of a two-story decomposition. It is the prerequisite for
**bd-53c** (OGP cross-member contribution reconciliation — the pull-on-join +
periodic backfill that is the PRIMARY fix for bd-8t0 mirror fragmentation).

- **Story A (this spec):** make contributions *signable and verifiable* — authors
  mint a ULID and sign each contribution; the receiver verifies and stores verbatim.
- **Story B (bd-53c, separate spec):** pull-on-join + periodic anti-entropy
  backfill; idempotent union-merge by contribution id; verify each contribution's
  signature on merge. Depends on Story A.

**Why split:** per-contribution signatures pull the whole signed-contribute write
path in as a dependency. Landing it first lets Story B's merge logic *assume*
signatures exist, and keeps each change independently reviewable and testable.

**Crypto posture:** crypto-adjacent → **escalate-before-merge**. However, this story
reuses the existing, battle-tested `signCanonical` / `verifyCanonical` primitives
in `src/shared/signing.ts` (already used on the federation message path); it
invents no new crypto.

### Related beads
- **bd-53c** (Story B) — will gain a dependency on the Story A bead.
- **bd-8t0** — the mirror-stale bug; healed structurally by Story B, unblocked by A.
- **bd-8rd.3** — names a "collision-safe contribution IDs (ULID, minted at source)"
  slice. Story A *absorbs* that slice: author-minted ULIDs are a hard requirement
  for signing (you cannot sign over an id the receiver assigns later).
- **bd-ogwd** — query-peer default timeout 10s → 30s. Prerequisite for **Story B**
  (the cross-gateway backfill round-trip), NOT Story A. Non-crypto, trivial; land
  before Story B is built. Listed here only so the chain is complete.
- **bd-2n3** (DONE) — query-peer `--json` + contribution ids on the wire. Consumed
  by Story B, not Story A.

---

## 2. Problem

Contributions today are **unsigned**, and their `id` is minted **at the receiver**:

```
// src/daemon/projects.ts:226
const contributionId = `${projectId}-${entryTypeName}-${Date.now()}`;
```

Two consequences:

1. **No provenance.** For bd-53c to safely merge a contribution that peer X
   *relays* on behalf of a different author Y, the contribution needs verifiable
   authorship. A receiver-minted, unsigned record cannot provide it.
2. **Collision-prone, unsignable id.** `Date.now()` has no entropy (two
   contributions in the same millisecond collide) and, being assigned by the
   receiver, cannot be covered by an author signature.

OGP's `authorId` **is** the author's ed25519 public key (`302a...`). So
"verify Y authored this" reduces to "verify the signature against `authorId`" —
no key distribution required. The missing pieces are: (a) the author must mint a
stable id and sign over it, and (b) the receiver must verify and store verbatim
rather than re-minting.

---

## 3. Scope

**In scope (Story A):**
- Author-side: mint ULID + `signCanonical` the contribution on `project.contribute`.
- Receiver-side: `verifyCanonical`, store verbatim with `verified: true`; stop
  re-minting ids.
- Schema: add `signature?`, `verified?`, `legacy?` to `ProjectContribution`.
- `upsertContribution(record)` — idempotent, signature-verifying merge primitive
  (replaces the mint logic in `addContribution`).
- One-time idempotent migration tagging existing unsigned records
  `verified: false, legacy: true`.

**Out of scope (→ Story B / bd-53c):**
- *When* contributions are fetched: pull-on-join, periodic timer, union-merge loop.
- The query-peer timeout bump (bd-ogwd).
This story changes how contributions are *written and verified*, not *when they
are fetched*.

---

## 4. Schema

`ProjectContribution` gains three **optional** fields (so legacy records remain
valid):

```ts
export interface ProjectContribution {
  id: string;            // NOW a ULID, minted by the AUTHOR
                         // (was: receiver-minted `${projectId}-${entryType}-${Date.now()}`)
  timestamp: string;     // ISO timestamp (author-set, covered by signature)
  authorId: string;      // ed25519 public key — IS the verification key
  authorIdentity?: AuthorIdentity;
  entryType?: string;
  topic?: string;        // legacy alias for entryType
  summary: string;
  metadata?: Record<string, any>;

  signature?: string;    // ed25519 sig over the canonical contribution (absent on legacy)
  verified?: boolean;    // true = signature checked & valid; false = legacy/unsigned
  legacy?: boolean;      // true = predates signing (the existing unsigned records)
}
```

### Canonical signed form

The author signs over a fixed subset, via `signCanonical()`:

```
{ id, projectId, authorId, entryType, summary, metadata, timestamp }
```

- `summary` and `metadata` are included so content cannot be tampered in relay.
- `projectId` is included so a signature cannot be replayed into a different project.
- `signCanonical` already appends/normalizes `timestamp` and returns the exact
  signed bytes (`payloadStr`) alongside the `signature`.

### ULID

Author mints a ULID at contribution time (sortable + collision-safe). This
satisfies bd-8rd.3's "collision-safe IDs minted at source" and gives Story B a
natural sort key.

---

## 5. Components & data flow

### 5.1 Author side — `projectSendContribution` (src/cli/project.ts)
1. Mint ULID.
2. Build the canonical object `{ id, projectId, authorId, entryType, summary, metadata, timestamp }`.
3. `signCanonical(obj, privateKey)` → `{ payload, payloadStr, signature }`.
4. Send `project.contribute` payload including `id`, `signature`, and fields.

### 5.2 Receiver side — `handleProjectContribute` (src/daemon/message-handler.ts)
1. Reconstruct the canonical envelope from the payload.
2. `verifyCanonical(envelope, authorId)`:
   - pass → `upsertContribution({ ...record, verified: true })`
   - fail → reject `401` with the `verifyCanonical` reason.
3. **No id minting.** **Non-member rejection retained** (cannot contribute to a
   project you are not a member of).

### 5.3 `upsertContribution(record)` (src/daemon/projects.ts) — replaces mint logic
- If `record.id` already exists in the project → **no-op** (idempotency; this is
  what makes Story B's repeated pulls safe).
- Else:
  - `signature` present → `verifyCanonical` against `record.authorId`; pass →
    store `verified:true`, fail → reject.
  - `signature` absent → accepted **only** on the legacy/migration path, never
    from a live `project.contribute`.
- **Member check:** live contributions still require the author be a project
  member. **Backfilled records (Story B) are the documented exception** — a
  relayed contribution's author may not be a local member, so a verified
  signature is sufficient provenance there. Story A builds `upsert` to *support*
  this; Story B wires it.

### 5.4 Self-contribution path
The common path today is contributing to your *own* local project (author ==
receiver, same daemon). It still flows through the signed path for uniformity:
the CLI signs, the local store `upsert`s a fully-formed, already-signed record.
`addContribution`'s mint-and-store responsibility moves into "build signed record
(author) + `upsertContribution` (store)".

### 5.5 Migration (one-time, idempotent)
On daemon start (or first `loadProjects()` after upgrade):
1. Scan all contributions across all projects/topics.
2. Any record lacking `signature` → stamp `verified: false, legacy: true` in place.
3. `saveProjects()` once if anything changed.
- Idempotent: already-tagged records are skipped — safe to run every boot.
- **No re-minting** of legacy ids; originals preserved. Story B's union-merge
  dedupes on whatever id is present (signed ULID or legacy string).
- The existing unsigned aicoe records (the frozen slice) survive untouched except
  for the two honest provenance flags — no data loss.

---

## 6. Error / failure modes

| Case | Behavior |
|------|----------|
| Bad signature on `project.contribute` | Reject `401`, reason `bad-signature` (from `verifyCanonical`) |
| Missing signature on live contribute | Reject `400` — signing is mandatory going forward |
| Duplicate id (upsert) | Silent no-op (idempotent) |
| Legacy record (no sig) | Kept, `verified:false, legacy:true`; never minted fresh |
| Clock skew on `timestamp` | `verifyCanonical` `maxAgeMs` generous/disabled for contributions (durable, not ephemeral like messages) |
| Non-member live contribute | Rejected (unchanged from today) |
| Verified non-member record via `upsert` | Accepted (the Story B hook) |

---

## 7. Testing (TDD, vitest, temp-dir isolation)

1. Author mints ULID + signs → receiver verifies + stores verbatim (`verified:true`).
2. Tampered `summary` → signature fails → `401`.
3. Duplicate id upsert → no-op, single stored copy.
4. Migration stamps existing unsigned records `verified:false, legacy:true`;
   idempotent on re-run (second run is a no-op, no rewrite).
5. `upsert` accepts a verified **non-member** record (the Story B hook).
6. Round-trip: `signCanonical` output verifies against `authorId`.
7. Non-member **live** contribute still rejected `403`/`401`.
8. Tampered `projectId` (replay into another project) → signature fails.

---

## 8. Decisions log (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Backfill trigger scope (Story B) | join + periodic timer (full anti-entropy) |
| 2 | Trust model | **per-contribution ed25519 signatures** |
| 3 | Decomposition | **split — Story A (this) first, Story B on top** |
| 4 | Legacy policy | accept existing unsigned as `verified:false, legacy:true`, preserve |

---

## 9. Risks & escalation

- **Escalate-before-merge:** crypto-adjacent (verifies signatures on the contribute
  path). Mitigated by reusing `signCanonical`/`verifyCanonical` verbatim — no new
  crypto, no new canonicalization.
- **Write-path blast radius:** every contribution now flows through sign/verify.
  Mitigated by: optional schema fields (no break), idempotent migration (no data
  loss), self-contribution path exercised by tests 1 & 6.
- **Interop during rollout:** an un-upgraded peer sends an unsigned live
  contribution → rejected `400`. Acceptable: both sides are David's daemons under
  propose-don't-deploy; coordinate the upgrade. (Flag for the implementation plan:
  decide whether to gate strict-rejection behind a short grace window.)
