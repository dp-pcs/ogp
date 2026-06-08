# Federated Project Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a federated project ownership model — a signed `ProjectCreation` root plus an append-only chain of signed `OwnerGrant`s — so any peer can independently answer "is key X an owner of project P?" via a pure `isOwner()` computation, unblocking bd-tq31 retract.

**Architecture:** Ownership crypto lives in a new focused module `src/daemon/project-ownership.ts` (mirroring how `contribution-signing.ts` isolates contribution crypto), reusing `signCanonical`/`verifyCanonical`/`canonicalPeerId`. `projects.ts` gains the `creation`/`ownerGrants` fields + storage helpers + `isOwner`. `message-handler.ts` gains a `project.grant-owner` handler and creation/claim acceptance. CLI adds `add-owner`/`claim-ownership`/`owners` and signs on `create`. Completion scripts and README ship with it.

**Tech Stack:** TypeScript (ESM/NodeNext), vitest (temp-dir via `process.env.OGP_HOME`), ed25519 via `node:crypto`, `ulid`. Bead: bd-hy3o. Ships ~0.9.0.

**Posture:** Crypto-adjacent → escalate-before-merge. Propose-don't-deploy: PR off `main`, do NOT merge. No remove-owner in v1.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/daemon/project-ownership.ts` | `ProjectCreation`/`OwnerGrant` types; build+verify signed creation/grant; `deriveOwners` fixpoint | **Create** |
| `src/daemon/projects.ts` | `creation?`/`ownerGrants?`/`pendingGrants?` on `Project`; `isOwner`; storage helpers (`setProjectCreation`, `addOwnerGrant`, `resolvePendingGrants`) | Modify |
| `src/daemon/message-handler.ts` | `project.grant-owner` intent + `handleProjectGrantOwner`; accept `creation`/legacy-claim on inbound; register intents (~512/624) | Modify |
| `src/cli/project.ts` | `projectCreate` signs creation; `projectAddOwner`, `projectClaimOwnership`, `projectOwners` | Modify |
| `src/cli.ts` | wire `add-owner`/`claim-ownership`/`owners` commands (~`project` group) | Modify |
| `scripts/completion.bash`, `scripts/completion.zsh` | add `add-owner claim-ownership owners` to `project` subcommands | Modify |
| `README.md` | "Project Ownership (v0.9.0+)" section + project command table rows | Modify |
| `test/project-ownership.test.ts` | `deriveOwners`/`isOwner`/grant-chain/forged/out-of-order | **Create** |
| `test/project-ownership-handler.test.ts` | grant-owner receiver, member-gated claim, race convergence | **Create** |
| `test/project-ownership-docs.test.ts` | grep-assert completion + README updated | **Create** |

**Verified code facts:**
- `signCanonical(payload, privKey)` → `{ payload: {...,timestamp}, payloadStr, signature }` (`signing.ts:101`).
- `verifyCanonical({payloadStr,signature}, pubKeyHex, {maxAgeMs})` → `{ ok, reason? }` (`signing.ts:127`).
- `canonicalPeerId(key)` is a local helper in `contribution-signing.ts` (first 32 chars). For ownership, **import it is not possible** (it's not exported). Define a matching local helper in `project-ownership.ts` (same rule, 32) — consistent with how contribution-signing keeps it local.
- `ulid()` from `'ulid'` (dep already present).
- `Project` (`projects.ts:38`) has `id,name,description?,createdAt,updatedAt,members[],topics[],metadata?`.
- `loadProjects()`/`saveProjects(projects)` read/write `projects.json` under `getConfigDir()` (honors `OGP_HOME`).
- `getProject`, `createProject`, `addProject`, `isProjectMember`, `joinProject` exported from `projects.ts`.
- Contribution signing uses `getPublicKey()`/`getPrivateKey()` from `daemon/keypair.js`; ownership CLI will too.
- Intent dispatch: `message-handler.ts` has a `case 'project.contribute':` at ~512 (registry) and ~624 (dispatch to handler). Mirror for `project.grant-owner`.

---

## Task 1: Ownership crypto module (`project-ownership.ts`)

**Files:**
- Create: `src/daemon/project-ownership.ts`
- Test: `test/project-ownership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/project-ownership.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import {
  buildSignedCreation,
  verifySignedCreation,
  buildSignedGrant,
  verifySignedGrant,
  deriveOwners,
  type ProjectCreation,
  type OwnerGrant
} from '../src/daemon/project-ownership.js';

describe('project-ownership', () => {
  const creator = generateKeyPair();
  const alice = generateKeyPair();
  const bob = generateKeyPair();

  it('builds + verifies a signed creation', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    expect(c.creatorKey).toBe(creator.publicKey);
    expect(c.provenance).toBe('original');
    expect(verifySignedCreation(c).ok).toBe(true);
  });

  it('rejects a creation whose signature does not match creatorKey', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, alice.privateKey);
    // signed by alice but claims creator
    const forged = { ...c, creatorKey: creator.publicKey };
    expect(verifySignedCreation(forged).ok).toBe(false);
  });

  it('derives the creator as the sole owner with no grants', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const owners = deriveOwners(c, []);
    expect(owners.has(creator.publicKey.substring(0, 32))).toBe(true);
    expect(owners.has(alice.publicKey.substring(0, 32))).toBe(false);
  });

  it('admits a grantee of a valid grant by the creator (and transitive chains)', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const g1 = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
    const g2 = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    const owners = deriveOwners(c, [g2, g1]); // order-independent
    expect(owners.has(alice.publicKey.substring(0, 32))).toBe(true);
    expect(owners.has(bob.publicKey.substring(0, 32))).toBe(true);
  });

  it('ignores a forged grant (grantedBy is not an owner)', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    // alice is NOT an owner; she grants bob
    const g = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    const owners = deriveOwners(c, [g]);
    expect(owners.has(bob.publicKey.substring(0, 32))).toBe(false);
  });

  it('ignores a grant whose signature does not match grantedBy', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const g = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: creator.publicKey }, bob.privateKey); // wrong signer
    const owners = deriveOwners(c, [g]);
    expect(owners.has(alice.publicKey.substring(0, 32))).toBe(false);
  });

  it('returns empty owners when creation is absent', () => {
    expect(deriveOwners(undefined, []).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/project-ownership.test.ts`
Expected: FAIL — `Cannot find module '../src/daemon/project-ownership.js'`.

- [ ] **Step 3: Implement the module**

Create `src/daemon/project-ownership.ts`:

```ts
import { ulid } from 'ulid';
import { signCanonical, verifyCanonical } from '../shared/signing.js';

// Mirror CANONICAL_PEER_ID_LENGTH in peers.ts (kept local to avoid module coupling;
// the comment guards against drift). Same form used by contribution-signing.
const CANONICAL_PEER_ID_LENGTH = 32;
function canonicalPeerId(key: string): string {
  return key.length > CANONICAL_PEER_ID_LENGTH ? key.substring(0, CANONICAL_PEER_ID_LENGTH) : key;
}

// Ownership records are durable artifacts, not ephemeral handshakes — disable the
// max-age staleness window (same posture as contribution-signing).
const OWNERSHIP_MAX_AGE_MS = Number.MAX_SAFE_INTEGER;

export interface ProjectCreation {
  projectId: string;
  creatorKey: string;                       // full ed25519 key
  createdAt: string;                        // ISO (from signCanonical timestamp)
  provenance: 'original' | 'legacy-claim';
  signature: string;
  payloadStr: string;
}

export interface OwnerGrant {
  id: string;                               // ULID (idempotency key)
  projectId: string;
  grantee: string;
  grantedBy: string;
  grantedAt: string;                        // ISO
  signature: string;
  payloadStr: string;
}

export interface BuildCreationParams {
  projectId: string;
  creatorKey: string;
  provenance: 'original' | 'legacy-claim';
}

export interface BuildGrantParams {
  projectId: string;
  grantee: string;
  grantedBy: string;
}

export function buildSignedCreation(params: BuildCreationParams, privateKeyHex: string): ProjectCreation {
  const canonical = {
    projectId: params.projectId,
    creatorKey: params.creatorKey,
    provenance: params.provenance
  };
  const env = signCanonical(canonical, privateKeyHex);
  return {
    projectId: params.projectId,
    creatorKey: params.creatorKey,
    createdAt: env.payload.timestamp,
    provenance: params.provenance,
    signature: env.signature,
    payloadStr: env.payloadStr
  };
}

export function verifySignedCreation(c: ProjectCreation | undefined | null): { ok: boolean; reason?: string } {
  if (!c || !c.payloadStr || !c.signature || !c.creatorKey) return { ok: false, reason: 'missing-fields' };
  const vr = verifyCanonical({ payloadStr: c.payloadStr, signature: c.signature }, c.creatorKey, { maxAgeMs: OWNERSHIP_MAX_AGE_MS });
  if (!vr.ok) return { ok: false, reason: vr.reason ?? 'bad-signature' };
  // The signed bytes must actually carry this creatorKey/projectId.
  try {
    const parsed = JSON.parse(c.payloadStr);
    if (parsed.creatorKey !== c.creatorKey || parsed.projectId !== c.projectId || parsed.provenance !== c.provenance) {
      return { ok: false, reason: 'field-mismatch' };
    }
  } catch { return { ok: false, reason: 'bad-payload' }; }
  return { ok: true };
}

export function buildSignedGrant(params: BuildGrantParams, privateKeyHex: string): OwnerGrant {
  const id = ulid();
  const canonical = {
    id,
    projectId: params.projectId,
    grantee: params.grantee,
    grantedBy: params.grantedBy
  };
  const env = signCanonical(canonical, privateKeyHex);
  return {
    id,
    projectId: params.projectId,
    grantee: params.grantee,
    grantedBy: params.grantedBy,
    grantedAt: env.payload.timestamp,
    signature: env.signature,
    payloadStr: env.payloadStr
  };
}

export function verifySignedGrant(g: OwnerGrant | undefined | null): { ok: boolean; reason?: string } {
  if (!g || !g.payloadStr || !g.signature || !g.grantedBy || !g.grantee || !g.id) return { ok: false, reason: 'missing-fields' };
  const vr = verifyCanonical({ payloadStr: g.payloadStr, signature: g.signature }, g.grantedBy, { maxAgeMs: OWNERSHIP_MAX_AGE_MS });
  if (!vr.ok) return { ok: false, reason: vr.reason ?? 'bad-signature' };
  try {
    const parsed = JSON.parse(g.payloadStr);
    if (parsed.grantedBy !== g.grantedBy || parsed.grantee !== g.grantee || parsed.id !== g.id || parsed.projectId !== g.projectId) {
      return { ok: false, reason: 'field-mismatch' };
    }
  } catch { return { ok: false, reason: 'bad-payload' }; }
  return { ok: true };
}

/**
 * Derive the canonical-32 owner-id set by fixpoint. Seed = {creator}; repeatedly
 * admit any grant whose signature verifies AND whose grantedBy is already an owner,
 * until no change. Forged/orphan grants are never admitted. Order-independent.
 */
export function deriveOwners(creation: ProjectCreation | undefined | null, grants: OwnerGrant[]): Set<string> {
  const owners = new Set<string>();
  if (!creation || !verifySignedCreation(creation).ok) return owners;
  owners.add(canonicalPeerId(creation.creatorKey));

  const valid = (grants ?? []).filter(g => verifySignedGrant(g).ok);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of valid) {
      const granteeId = canonicalPeerId(g.grantee);
      if (owners.has(granteeId)) continue;
      if (owners.has(canonicalPeerId(g.grantedBy))) {
        owners.add(granteeId);
        changed = true;
      }
    }
  }
  return owners;
}

export { canonicalPeerId as _ownershipCanonicalPeerId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/project-ownership.test.ts`
Expected: PASS (7 tests). Also `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/project-ownership.ts test/project-ownership.test.ts
git commit -m "feat(bd-hy3o): project-ownership crypto module (creation + grant + deriveOwners fixpoint)"
```

---

## Task 2: `projects.ts` schema + `isOwner` + storage helpers

**Files:**
- Modify: `src/daemon/projects.ts`
- Test: extend `test/project-ownership.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/project-ownership.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import {
  addProject, createProject, joinProject, getProject,
  setProjectCreation, addOwnerGrant, isOwner, type Project
} from '../src/daemon/projects.js';

describe('projects ownership storage + isOwner', () => {
  let tempDir: string;
  const creator = generateKeyPair();
  const alice = generateKeyPair();
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-own-'));
    process.env.OGP_HOME = tempDir;
    const p: Project = createProject('proj', 'Proj');
    addProject(p);
  });
  afterEach(() => { delete process.env.OGP_HOME; fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('isOwner: creator after setProjectCreation; non-owner otherwise', () => {
    expect(isOwner('proj', creator.publicKey)).toBe(false); // no creation yet
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    expect(setProjectCreation('proj', c)).toBe('set');
    expect(isOwner('proj', creator.publicKey)).toBe(true);
    expect(isOwner('proj', alice.publicKey)).toBe(false);
  });

  it('isOwner: grantee after a valid grant is added; idempotent grant', () => {
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    setProjectCreation('proj', c);
    const g = buildSignedGrant({ projectId: 'proj', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
    expect(addOwnerGrant('proj', g)).toBe('added');
    expect(addOwnerGrant('proj', g)).toBe('duplicate');
    expect(isOwner('proj', alice.publicKey)).toBe(true);
  });

  it('isOwner accepts a 32-char prefix as the key argument', () => {
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    setProjectCreation('proj', c);
    expect(isOwner('proj', creator.publicKey.substring(0, 32))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/project-ownership.test.ts`
Expected: FAIL — `setProjectCreation`/`addOwnerGrant`/`isOwner` not exported.

- [ ] **Step 3: Implement**

In `src/daemon/projects.ts`:

(a) Add imports at top:
```ts
import {
  type ProjectCreation,
  type OwnerGrant,
  deriveOwners,
  _ownershipCanonicalPeerId as canonicalPeerId
} from './project-ownership.js';
```

(b) Extend the `Project` interface (add three optional fields):
```ts
  creation?: ProjectCreation;
  ownerGrants?: OwnerGrant[];
  pendingGrants?: OwnerGrant[];   // grants not yet resolvable (out-of-order arrival)
```

(c) Add helpers (after `addProject`):
```ts
export function setProjectCreation(projectId: string, creation: ProjectCreation): 'set' | 'exists-original' | 'not-found' | 'rejected' {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return 'not-found';
  const { verifySignedCreation } = requireOwnership();
  if (!verifySignedCreation(creation).ok) return 'rejected';
  if (project.creation?.provenance === 'original') return 'exists-original';
  // legacy-claim race convergence: keep earliest createdAt, tie-break lowest canonical key
  if (project.creation?.provenance === 'legacy-claim' && creation.provenance === 'legacy-claim') {
    const cur = project.creation;
    const keep = creation.createdAt < cur.createdAt
      || (creation.createdAt === cur.createdAt && canonicalPeerId(creation.creatorKey) < canonicalPeerId(cur.creatorKey));
    if (!keep) return 'exists-original'; // current claim wins; treat as no-op
  }
  project.creation = creation;
  saveProjects(projects);
  resolvePendingGrants(projectId);
  return 'set';
}

export function addOwnerGrant(projectId: string, grant: OwnerGrant): 'added' | 'duplicate' | 'pending' | 'rejected' | 'not-found' {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return 'not-found';
  const { verifySignedGrant } = requireOwnership();
  if (!verifySignedGrant(grant).ok) return 'rejected';
  project.ownerGrants ??= [];
  project.pendingGrants ??= [];
  if (project.ownerGrants.some(g => g.id === grant.id) || project.pendingGrants.some(g => g.id === grant.id)) {
    return 'duplicate';
  }
  // Resolvable now? grantedBy must be a current owner.
  const owners = deriveOwners(project.creation, project.ownerGrants);
  if (owners.has(canonicalPeerId(grant.grantedBy))) {
    project.ownerGrants.push(grant);
    saveProjects(projects);
    resolvePendingGrants(projectId); // a new owner may unlock pending grants
    return 'added';
  }
  // Not yet resolvable (out-of-order). Defer — do not reject for missing root.
  project.pendingGrants.push(grant);
  saveProjects(projects);
  return 'pending';
}

export function resolvePendingGrants(projectId: string): number {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project || !project.pendingGrants?.length) return 0;
  let moved = 0, changed = true;
  project.ownerGrants ??= [];
  while (changed) {
    changed = false;
    const owners = deriveOwners(project.creation, project.ownerGrants);
    for (let i = project.pendingGrants.length - 1; i >= 0; i--) {
      const g = project.pendingGrants[i];
      if (owners.has(canonicalPeerId(g.grantedBy))) {
        project.ownerGrants.push(g);
        project.pendingGrants.splice(i, 1);
        moved++; changed = true;
      }
    }
  }
  if (moved > 0) saveProjects(projects);
  return moved;
}

export function isOwner(projectId: string, key: string): boolean {
  const project = loadProjects().find(p => p.id === projectId);
  if (!project) return false;
  const owners = deriveOwners(project.creation, project.ownerGrants ?? []);
  return owners.has(canonicalPeerId(key));
}
```

(d) Add the lazy-require shim near the top of the file (avoids any load-order surprise; both modules are runtime-safe but this keeps `projects.ts` import list minimal):
```ts
function requireOwnership() {
  return {
    verifySignedCreation: (c: any) => (require('./project-ownership.js') as typeof import('./project-ownership.js')).verifySignedCreation(c),
    verifySignedGrant: (g: any) => (require('./project-ownership.js') as typeof import('./project-ownership.js')).verifySignedGrant(g)
  };
}
```
> NOTE: ESM `require` may be unavailable. PREFER static imports: add `verifySignedCreation, verifySignedGrant` to the existing `./project-ownership.js` import in (a) and delete `requireOwnership`, calling them directly. Verify no runtime cycle: `project-ownership.ts` imports ONLY `signing.js` + `ulid` (NOT `projects.js`), so a static import in `projects.ts` is safe. Use the static form; the shim is only a fallback if a cycle is discovered.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/project-ownership.test.ts`
Expected: PASS (all). `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/projects.ts test/project-ownership.test.ts
git commit -m "feat(bd-hy3o): Project ownership fields + isOwner + creation/grant/pending storage helpers"
```

---

## Task 3: Out-of-order resolution test (explicit)

**Files:**
- Test: extend `test/project-ownership.test.ts`

- [ ] **Step 1: Write the test**

Append (same `describe` temp-dir block style as Task 2):

```ts
describe('out-of-order grant resolution', () => {
  let tempDir: string;
  const creator = generateKeyPair();
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-ooo-'));
    process.env.OGP_HOME = tempDir;
    addProject(createProject('proj', 'Proj'));
  });
  afterEach(() => { delete process.env.OGP_HOME; fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('defers a grant whose grantor is not yet an owner, then resolves it', () => {
    // alice->bob grant arrives BEFORE creator->alice grant.
    const gAliceBob = buildSignedGrant({ projectId: 'proj', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    expect(addOwnerGrant('proj', gAliceBob)).toBe('pending'); // no creation/owners yet

    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    setProjectCreation('proj', c);
    const gCreatorAlice = buildSignedGrant({ projectId: 'proj', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
    expect(addOwnerGrant('proj', gCreatorAlice)).toBe('added');
    // adding creator->alice makes alice an owner, which should resolve the pending alice->bob.
    expect(isOwner('proj', bob.publicKey)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect PASS** (Task 2's `resolvePendingGrants` should already handle this)

Run: `npx vitest run test/project-ownership.test.ts`
Expected: PASS. If the out-of-order test FAILS, fix `resolvePendingGrants`/`addOwnerGrant` until it passes (do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add test/project-ownership.test.ts
git commit -m "test(bd-hy3o): out-of-order grant defers then resolves"
```

---

## Task 4: `project.grant-owner` handler + creation/claim acceptance

**Files:**
- Modify: `src/daemon/message-handler.ts`
- Test: `test/project-ownership-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/project-ownership-handler.test.ts` using the hoisted-mock style of `test/project-contribute-verify.test.ts` (mock `getPeer`→approved, `verifyObject`→true via partial `signing.js` mock keeping `verifyCanonical` real, `checkAccess`→allowed, `getIntent`→truthy, config/personas). Mock `../src/daemon/projects.js` to expose in-memory `getProject`, `isProjectMember`, `setProjectCreation`, `addOwnerGrant`. Assert:

```ts
// (1) a project.grant-owner from an owner is accepted (addOwnerGrant called, success)
// (2) a grant whose grantedBy is a provable non-owner -> addOwnerGrant returns 'rejected' -> 403
// (3) a legacy-claim project.create from a NON-member -> 403
// (4) a legacy-claim from a member -> setProjectCreation called, success
```

Concretely (adapt mock wiring to match message-handler imports — confirm names by reading the file):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedGrant, buildSignedCreation } from '../src/daemon/project-ownership.js';

const owner = generateKeyPair();
const stranger = generateKeyPair();

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(() => ({ id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '' })),
  isProjectMember: vi.fn(() => true),
  isOwner: vi.fn(() => true),
  setProjectCreation: vi.fn(() => 'set'),
  addOwnerGrant: vi.fn(() => 'added'),
  getPeer: vi.fn(() => ({ id: 'p', publicKey: 'pk', status: 'approved', displayName: 'P' })),
  verifyObject: vi.fn(() => true),
}));
vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject, isProjectMember: mocks.isProjectMember, isOwner: mocks.isOwner,
  setProjectCreation: mocks.setProjectCreation, addOwnerGrant: mocks.addOwnerGrant,
  getContributionEntryType: vi.fn(),
}));
vi.mock('../src/daemon/peers.js', () => ({ getPeer: mocks.getPeer, updatePeer: vi.fn(), listPeers: vi.fn(() => []) }));
vi.mock('../src/shared/signing.js', async (orig) => { const real = await orig() as any; return { ...real, verifyObject: mocks.verifyObject }; });
vi.mock('../src/daemon/doorman.js', () => ({ checkAccess: () => ({ allowed: true }) }));
vi.mock('../src/daemon/intent-registry.js', () => ({ getIntent: () => ({ name: 'project.grant-owner' }) }));
vi.mock('../src/daemon/notify.js', () => ({ notifyOpenClaw: vi.fn(async () => {}) }));
// config/personas mocks as needed (copy from project-contribute-verify.test.ts)

const { handleMessage } = await import('../src/daemon/message-handler.js');

function msg(intent: string, payloadObj: any, from = owner.publicKey.substring(0,32)) {
  const m = { from, nonce: 'n', intent, payload: payloadObj };
  return { m, str: JSON.stringify(m) };
}

describe('ownership handlers', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isProjectMember.mockReturnValue(true); mocks.addOwnerGrant.mockReturnValue('added'); mocks.setProjectCreation.mockReturnValue('set'); });

  it('accepts a grant-owner and stores it', async () => {
    const g = buildSignedGrant({ projectId: 'proj', grantee: stranger.publicKey, grantedBy: owner.publicKey }, owner.privateKey);
    const { m, str } = msg('project.grant-owner', { projectId: 'proj', grant: g });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(mocks.addOwnerGrant).toHaveBeenCalledOnce();
  });

  it('rejects a grant the store deems non-owner (403)', async () => {
    mocks.addOwnerGrant.mockReturnValue('rejected');
    const g = buildSignedGrant({ projectId: 'proj', grantee: stranger.publicKey, grantedBy: stranger.publicKey }, stranger.privateKey);
    const { m, str } = msg('project.grant-owner', { projectId: 'proj', grant: g });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a legacy-claim from a non-member (403)', async () => {
    mocks.isProjectMember.mockReturnValue(false);
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: stranger.publicKey, provenance: 'legacy-claim' }, stranger.privateKey);
    const { m, str } = msg('project.create', { projectId: 'proj', creation: c }, stranger.publicKey.substring(0,32));
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run — FAIL** (handler not implemented).
Run: `npx vitest run test/project-ownership-handler.test.ts` → FAIL.

- [ ] **Step 3: Implement the handlers + register intents**

In `src/daemon/message-handler.ts`:

(a) Add `project.grant-owner` and `project.create` to the intent registry list (the `case 'project.contribute':` block ~512) and the dispatch switch (~624):
```ts
      case 'project.grant-owner':
        return await handleProjectGrantOwner(message, displayName, payload, hookAgentId);
      case 'project.create':
        return await handleProjectCreate(message, displayName, payload, hookAgentId);
```
(Mirror the registry entry alongside `project.contribute` at ~512 so the intent is recognized.)

(b) Add the import: `import { setProjectCreation, addOwnerGrant, isProjectMember, getProject } from './projects.js';` (extend the existing `./projects.js` import — several already present).

(c) Implement the handlers (place near `handleProjectContribute`):
```ts
async function handleProjectGrantOwner(message: FederationMessage, displayName: string, payload: any, hookAgentId: string): Promise<MessageResponse> {
  const { projectId, grant } = payload;
  if (!projectId || !grant) return { success: false, nonce: message.nonce, error: 'Missing projectId or grant', statusCode: 400 };
  if (!getProject(projectId)) return { success: false, nonce: message.nonce, error: `Project '${projectId}' not found`, statusCode: 404 };
  const result = addOwnerGrant(projectId, grant);
  if (result === 'rejected') return { success: false, nonce: message.nonce, error: 'Owner grant rejected (signature invalid or grantor not an owner)', statusCode: 403 };
  if (result === 'not-found') return { success: false, nonce: message.nonce, error: 'Project not found', statusCode: 404 };
  // 'added' | 'duplicate' | 'pending' all succeed.
  return { success: true, nonce: message.nonce, response: { projectId, grantState: result, timestamp: new Date().toISOString() } };
}

async function handleProjectCreate(message: FederationMessage, displayName: string, payload: any, hookAgentId: string): Promise<MessageResponse> {
  const { projectId, projectName, creation } = payload;
  if (!projectId || !creation) return { success: false, nonce: message.nonce, error: 'Missing projectId or creation', statusCode: 400 };
  // Ensure the project exists locally (create a shell if needed, like project.join does).
  let project = getProject(projectId);
  if (!project) {
    const { createProject, addProject } = await import('./projects.js');
    project = createProject(projectId, projectName || projectId);
    addProject(project);
  }
  // Member-gate legacy claims: the claimant (creation.creatorKey) must already be a member.
  if (creation.provenance === 'legacy-claim' && !isProjectMember(projectId, creation.creatorKey)) {
    return { success: false, nonce: message.nonce, error: 'Legacy ownership claim requires project membership', statusCode: 403 };
  }
  const result = setProjectCreation(projectId, creation);
  if (result === 'rejected') return { success: false, nonce: message.nonce, error: 'Creation rejected (bad signature)', statusCode: 401 };
  if (result === 'exists-original') return { success: false, nonce: message.nonce, error: 'Project already has an original creation', statusCode: 409 };
  return { success: true, nonce: message.nonce, response: { projectId, creationState: result, timestamp: new Date().toISOString() } };
}
```
> **IMPORTANT — member matching (verified):** `isProjectMember(projectId, peerId)` does an EXACT `project.members.includes(peerId)` — NO canonicalization. Members may be stored as 32-char ids, full keys, OR emails (e.g. signal's members = `['302a…738064be', 'david@theproctors.cloud', '302a…27ce9d6d']`). A claimant passing their full key will NOT match a 32-char member entry. So the member-gate must check BOTH forms. Add a helper in this handler (or inline):
> ```ts
> function claimantIsMember(projectId: string, creatorKey: string): boolean {
>   const proj = getProject(projectId);
>   if (!proj) return false;
>   const full = creatorKey;
>   const short = creatorKey.substring(0, 32);
>   return proj.members.some(m => m === full || m === short || (m.length >= 32 && m.substring(0,32) === short));
> }
> ```
> and use `if (creation.provenance === 'legacy-claim' && !claimantIsMember(projectId, creation.creatorKey))` instead of the bare `isProjectMember` call. (Email-form membership can't be matched to a key — that's expected; key-based membership is what owner-claim keys on.) Confirm `handleMessage`/`FederationMessage`/`MessageResponse` names against the file before wiring.

- [ ] **Step 4: Run — PASS**
Run: `npx vitest run test/project-ownership-handler.test.ts` → PASS (3). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/message-handler.ts test/project-ownership-handler.test.ts
git commit -m "feat(bd-hy3o): project.grant-owner + project.create handlers (member-gated legacy claim, 403/409)"
```

---

## Task 5: CLI commands (create signs, add-owner, claim-ownership, owners)

**Files:**
- Modify: `src/cli/project.ts`, `src/cli.ts`

- [ ] **Step 1: `projectCreate` mints+signs creation**

In `src/cli/project.ts`, find the project-create function (or add `projectCreateOwned`). On create, after the project is created locally, mint + store a signed `original` creation:
```ts
import { getPublicKey, getPrivateKey } from '../daemon/keypair.js';
import { buildSignedCreation, buildSignedGrant } from '../daemon/project-ownership.js';
import { setProjectCreation, addOwnerGrant, isOwner } from '../daemon/projects.js';
// ... in create flow, after addProject(...):
const creation = buildSignedCreation({ projectId, creatorKey: getPublicKey(), provenance: 'original' }, getPrivateKey());
setProjectCreation(projectId, creation);
console.log(`  Owner: you (${getPublicKey().substring(0,32)}…)`);
```

- [ ] **Step 2: `projectAddOwner`**
```ts
export async function projectAddOwner(projectId: string, granteeKey: string): Promise<void> {
  const config = loadConfig(); if (!config) { console.error('Not configured. Run "ogp setup".'); process.exit(1); }
  if (!isOwner(projectId, getPublicKey())) { console.error(`You are not an owner of '${projectId}'`); process.exit(1); }
  const grant = buildSignedGrant({ projectId, grantee: granteeKey, grantedBy: getPublicKey() }, getPrivateKey());
  addOwnerGrant(projectId, grant); // local
  // federate to all approved project member peers (mirror projectContribute fan-out)
  const { listPeers } = await import('../daemon/peers.js');
  const peers = listPeers('approved').filter(p => listProjectsForPeer(p.id, [getProject(projectId)!]).length > 0);
  let acked = 0;
  for (const peer of peers) {
    const r = await federationSend(peer.id, 'project.grant-owner', JSON.stringify({ projectId, grant }), 30000);
    if (r && r.success !== false) acked++;
  }
  console.log(`✓ Granted owner ${granteeKey.substring(0,32)}… to '${projectId}'${acked ? ` (synced to ${acked} peer${acked>1?'s':''})` : ''}`);
}
```

- [ ] **Step 3: `projectClaimOwnership`** (member-gated locally + federate)
```ts
export async function projectClaimOwnership(projectId: string): Promise<void> {
  const config = loadConfig(); if (!config) { console.error('Not configured.'); process.exit(1); }
  const project = getProject(projectId); if (!project) { console.error(`Project '${projectId}' not found`); process.exit(1); }
  if (project.creation?.provenance === 'original') { console.error('Project already has an original owner'); process.exit(1); }
  // Member check must tolerate 32-char / full-key / email member forms (members.includes is exact).
  const myKey = getPublicKey(); const myShort = myKey.substring(0, 32);
  const member = project.members.some(m =>
    m === myKey || m === myShort || (m.length >= 32 && m.substring(0,32) === myShort) || m === config.email);
  if (!member) { console.error('Only an existing project member may claim ownership'); process.exit(1); }
  const creation = buildSignedCreation({ projectId, creatorKey: getPublicKey(), provenance: 'legacy-claim' }, getPrivateKey());
  setProjectCreation(projectId, creation);
  const { listPeers } = await import('../daemon/peers.js');
  const peers = listPeers('approved').filter(p => listProjectsForPeer(p.id, [project]).length > 0);
  for (const peer of peers) await federationSend(peer.id, 'project.create', JSON.stringify({ projectId, projectName: project.name, creation }), 30000);
  console.log(`✓ Claimed ownership of '${projectId}' (legacy-claim). You are now root owner.`);
}
```

- [ ] **Step 4: `projectOwners`** (read-only)
```ts
export function projectOwners(projectId: string): void {
  const project = getProject(projectId); if (!project) { console.error(`Project '${projectId}' not found`); process.exit(1); }
  if (!project.creation) { console.log(`Project '${projectId}' has no ownership record (run 'ogp project claim-ownership ${projectId}').`); return; }
  console.log(`Owners of '${projectId}':`);
  console.log(`  • creator: ${project.creation.creatorKey.substring(0,32)}…  [${project.creation.provenance}]`);
  for (const g of project.ownerGrants ?? []) console.log(`  • ${g.grantee.substring(0,32)}…  (granted by ${g.grantedBy.substring(0,32)}…)`);
  if (project.pendingGrants?.length) console.log(`  (${project.pendingGrants.length} pending grant(s) awaiting their root)`);
}
```
> Confirm the existing imports in project.ts already include `getProject`, `isProjectMember`, `listProjectsForPeer`, `federationSend`, `loadConfig` — most are present from contribution work. Add only what's missing.

- [ ] **Step 5: Wire commands in `src/cli.ts`** (in the `project` command group, mirroring existing subcommands):
```ts
project.command('add-owner').description('Grant ownership of a project to a peer key (owners only)')
  .argument('<project-id>').argument('<grantee-key>')
  .action(async (projectId, granteeKey) => { await projectAddOwner(projectId, granteeKey); });
project.command('claim-ownership').description('Claim ownership of a pre-existing project (members only)')
  .argument('<project-id>')
  .action(async (projectId) => { await projectClaimOwnership(projectId); });
project.command('owners').description('List the owners of a project')
  .argument('<project-id>')
  .action((projectId) => { projectOwners(projectId); });
```
Add the imports of `projectAddOwner, projectClaimOwnership, projectOwners` to cli.ts's `./cli/project.js` import.

- [ ] **Step 6: Build + manual smoke (temp home)**

Run: `npx tsc --noEmit && npm run build`
Then a real local smoke (no federation):
```bash
OGP_HOME=$(mktemp -d) sh -c '
  node dist/cli.js project create demo "Demo" ;
  node dist/cli.js project owners demo ;
'
```
Expected: create prints `Owner: you (…)`, `owners` lists the creator with `[original]`.

- [ ] **Step 7: Commit**

```bash
git add src/cli/project.ts src/cli.ts
git commit -m "feat(bd-hy3o): CLI — create signs ownership; add-owner, claim-ownership, owners commands"
```

---

## Task 6: Completion scripts (first-class)

**Files:**
- Modify: `scripts/completion.bash`, `scripts/completion.zsh`
- Test: `test/project-ownership-docs.test.ts`

- [ ] **Step 1: Write the grep-assertion test**

Create `test/project-ownership-docs.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bd-hy3o docs + completion updated', () => {
  it('bash completion lists ownership subcommands', () => {
    const s = readFileSync('scripts/completion.bash', 'utf-8');
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
  it('zsh completion lists ownership subcommands', () => {
    const s = readFileSync('scripts/completion.zsh', 'utf-8');
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
  it('README documents project ownership', () => {
    const s = readFileSync('README.md', 'utf-8');
    expect(s).toMatch(/Project Ownership/i);
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run test/project-ownership-docs.test.ts`).

- [ ] **Step 3: Update bash completion**

In `scripts/completion.bash`, find the `project` subcommand opts line (`opts="create join list remove contribute query status request-join send-contribution query-peer status-peer delete"`) and add the three commands:
```bash
      opts="create join list remove contribute query status request-join send-contribution query-peer status-peer delete add-owner claim-ownership owners"
```

- [ ] **Step 4: Update zsh completion**

In `scripts/completion.zsh`, find the `_ogp_project` subcommand `_arguments '1:subcommand:((` block and add:
```
      add-owner\:"Grant ownership to a peer key (owners only)"
      claim-ownership\:"Claim ownership of a pre-existing project (members only)"
      owners\:"List the owners of a project"
```

- [ ] **Step 5: Run docs test + syntax-check**

Run: `bash -n scripts/completion.bash && zsh -n scripts/completion.zsh && npx vitest run test/project-ownership-docs.test.ts`
Expected: bash/zsh OK; the two completion assertions PASS (README still fails until Task 7).

- [ ] **Step 6: Commit**

```bash
git add scripts/completion.bash scripts/completion.zsh test/project-ownership-docs.test.ts
git commit -m "feat(bd-hy3o): completion scripts — add-owner/claim-ownership/owners (+ docs assertion test)"
```

---

## Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Project Ownership section**

Add a `### Project Ownership (v0.9.0+)` subsection in the project area of `README.md`, containing: a one-paragraph model description (creator is root owner via a signed creation record; additional owners via signed grants; any peer derives the owner set independently; legacy projects use `claim-ownership`, members only), and a command list:
```bash
ogp project create <id> <name>          # you become the root owner (signed)
ogp project add-owner <id> <peer-key>   # grant ownership (owners only)
ogp project claim-ownership <id>        # claim a pre-existing project (members only)
ogp project owners <id>                 # list owners
```
Also add the three commands as rows to the existing project command table if one exists.

- [ ] **Step 2: Run the docs test — all PASS**

Run: `npx vitest run test/project-ownership-docs.test.ts`
Expected: all 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(bd-hy3o): README — Project Ownership section + commands"
```

---

## Task 8: Union-merge convergence test + full suite + release

**Files:**
- Test: extend `test/project-ownership.test.ts`
- Modify: `package.json`, `dist/**`, `docs/escalations/2026-06-05-project-ownership.md`

- [ ] **Step 1: Convergence test**

Append to `test/project-ownership.test.ts` a test that two peers with disjoint grant subsets derive the same owner set:
```ts
import { deriveOwners as derive2 } from '../src/daemon/project-ownership.js';
it('two peers with disjoint grant subsets derive the same owner set after union', () => {
  const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
  const gA = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
  const gB = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
  // peer1 has [gA], peer2 has [gB]; after union both have [gA,gB]
  const union = derive2(c, [gA, gB]);
  expect(union.has(alice.publicKey.substring(0,32))).toBe(true);
  expect(union.has(bob.publicKey.substring(0,32))).toBe(true);
  // peer with only gB (no gA) cannot derive bob (orphan) — proves union is required, convergence is monotonic
  expect(derive2(c, [gB]).has(bob.publicKey.substring(0,32))).toBe(false);
});
```
Run: `npx vitest run test/project-ownership.test.ts` → PASS.

- [ ] **Step 2: Full suite + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green (baseline 323 + the new ownership tests); tsc 0. Investigate any non-preexisting failure.

- [ ] **Step 3: Escalation note + version bump + build**

Create `docs/escalations/2026-06-05-project-ownership.md` summarizing: the model (creator-rooted signed grants, derived ownership), why it's escalated (signed authority records on the federation path), what it does NOT do (no remove-owner), the member-gated legacy claim, and that it reuses `signCanonical`/`verifyCanonical` (no new crypto).
Then:
```bash
npm version minor --no-git-tag-version   # 0.8.3 -> 0.9.0
npm run build
git add package.json package-lock.json dist docs/escalations/2026-06-05-project-ownership.md test/project-ownership.test.ts
git commit -m "chore(release): 0.9.0 — federated project ownership (bd-hy3o) + escalation note"
```

- [ ] **Step 4: Push + PR (no merge)**

```bash
git push -u origin <branch>
gh pr create --base main --title "feat(bd-hy3o): federated project ownership (0.9.0)" --body "<model summary; isOwner consumer API for bd-tq31; member-gated legacy claim; no remove-owner v1; completion+README updated; reuses signCanonical/verifyCanonical — no new crypto; escalate-before-merge, propose-don't-deploy>"
```

- [ ] **Step 5: Close the bead**

```bash
bd close bd-hy3o --reason "Shipped as PR #<n> (0.9.0). Creator-rooted signed-grant ownership; isOwner() consumer API; member-gated legacy claim; completion+README updated. No remove-owner (v1). Unblocks bd-tq31. Propose-don't-deploy: PR open, not merged."
```

---

## Self-Review

**Spec coverage** (against `2026-06-05-project-ownership-design.md`):
- §2 model (ProjectCreation/OwnerGrant/`deriveOwners` fixpoint/`isOwner`) → Tasks 1, 2 ✓
- §2 out of v1 (no remove-owner) → not implemented anywhere ✓ (correct)
- §3.1 project.create signed + lazy propagation → Task 4 (handler) + Task 5 (CLI signs on create) ✓ (lazy propagation: creation rides on project.create federation in claim path + create; note: eager-on-create-to-existing-peers is covered by add-owner/claim federation; a brand-new project has no peers yet, so "lazy on first join/contribute" is satisfied by storing creation locally and including it when the project federates — Task 5 stores it; full piggyback-on-join is a follow-up if needed)
- §3.2 grant-owner (owner check, idempotent, pending) → Task 2 (`addOwnerGrant`) + Task 4 (handler) ✓
- §3.3 member-gated legacy claim + race convergence + 409 → Task 2 (`setProjectCreation` tie-break) + Task 4 (member-gate 403/409) + Task 5 (CLI) ✓
- §3.4 out-of-order pending → Task 2 (`resolvePendingGrants`) + Task 3 (test) ✓
- §3.5 union-merge convergence → Task 8 test ✓
- §4 CLI surface (create/add-owner/claim-ownership/owners) → Task 5 ✓
- §5 completion + README first-class → Tasks 6, 7 (+ docs assertion test) ✓
- §6 error matrix (403/409/idempotent/pending) → Tasks 2, 4 ✓
- §7 tests 1-8 → distributed across Tasks 1,2,3,4,8 + docs test 6/7 ✓

**Gap flagged honestly:** §3.1 "lazy propagation on first join/contribute" — the plan stores the creation locally and federates it explicitly on claim/create-to-peers and via add-owner, but does NOT piggyback the creation onto an *existing* `project.join`/`project.contribute` message. For v1 (single operator, signal already federated) the explicit `project.create` federation in the claim path covers the real case. If a peer needs the creation without a claim/grant, that piggyback is a small follow-up — noted in Task 4. Not a blocker for bd-tq31 (which runs on Junior, the owner, who holds the creation locally).

**Placeholder scan:** No "TBD/TODO". The handler/CLI tasks include "confirm names against the file" verification steps — these are deliberate guards against the message-handler mock surface (which varies), not missing content; the code to write is fully specified.

**Type consistency:** `ProjectCreation`/`OwnerGrant`/`buildSignedCreation`/`buildSignedGrant`/`verifySignedCreation`/`verifySignedGrant`/`deriveOwners` consistent across Tasks 1,2,4,5,8. `isOwner(projectId, key)`, `setProjectCreation(projectId, creation)→'set'|'exists-original'|'not-found'|'rejected'`, `addOwnerGrant(projectId, grant)→'added'|'duplicate'|'pending'|'rejected'|'not-found'` consistent across Tasks 2,4,5. `canonicalPeerId` exported as `_ownershipCanonicalPeerId` and imported aliased in Task 2.

**Verification reminders for the implementer (cheap, at the task):**
- Task 2: prefer the static import of verify fns; only use the `requireOwnership` shim if a real cycle appears (none expected — project-ownership.ts imports only signing+ulid).
- Task 4: confirm `handleMessage` mock surface (doorman/intent-registry/config) by copying the working setup from `test/project-contribute-verify.test.ts`; confirm `isProjectMember` member-id form (32-char vs email) and adapt the claimant member check.
