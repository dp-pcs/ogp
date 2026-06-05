# Signed Project Contributions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every project contribution carry author-minted ULID + ed25519 signature, verified on receipt and stored verbatim, so a later backfill (bd-53c) can safely merge relayed contributions by id.

**Architecture:** Authors mint a ULID and sign a canonical contribution object using the existing `signCanonical` primitive. A new focused helper module `src/daemon/contribution-signing.ts` owns build+verify. `src/daemon/projects.ts` gains the schema fields, an idempotent `upsertContribution`, and a one-time legacy-tagging migration. The `project.contribute` receiver and both author call-sites (peer send + local self-contribute) route through the helper. No new crypto — reuses `src/shared/signing.ts`.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest (temp-dir isolation via `process.env.OGP_HOME`), ed25519 via `node:crypto`, `ulid` npm package (sortable ids).

**Bead:** bd-6twb (Story A). Spec: `docs/superpowers/specs/2026-06-04-signed-contributions-design.md` (commit 5dff459).

**Posture:** Crypto-adjacent → escalate-before-merge. Propose-don't-deploy: land as a PR off `main`, do NOT merge. Strict `400` on missing-sig live contribute (no grace window, David-approved 2026-06-04).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/daemon/projects.ts` | `ProjectContribution` schema; `upsertContribution`; `migrateLegacyContributions` | Modify |
| `src/daemon/contribution-signing.ts` | Build (author) + verify (receiver) a signed contribution; canonical-object shape | **Create** |
| `src/daemon/message-handler.ts` | `handleProjectContribute`: verify envelope → `upsertContribution` | Modify (~745–815) |
| `src/cli/project.ts` | `projectSendContribution` (peer) + local self-contribute (~340) sign before send/store | Modify |
| `src/daemon/server.ts` | Run `migrateLegacyContributions()` once on daemon start | Modify |
| `package.json` | Add `ulid` dependency | Modify |
| `test/contribution-signing.test.ts` | Unit tests for build/verify helper | **Create** |
| `test/contribution-upsert.test.ts` | Unit tests for `upsertContribution` + migration | **Create** |
| `test/project-contribute-verify.test.ts` | Handler verify/reject integration | **Create** |

### Wire contract (`project.contribute` payload)

```jsonc
{
  "projectId": "...", "entryType": "...", "topic": "...", "summary": "...",
  "metadata": { }, "authorIdentity": { },        // existing fields, kept for routing/notification
  "contribution": {                               // NEW signed envelope
    "id": "01J...",                               // author-minted ULID
    "authorId": "302a...",                        // author ed25519 pubkey hex
    "timestamp": "2026-06-04T...Z",
    "payloadStr": "{...}",                         // exact signed bytes over the canonical object
    "signature": "<hex>"
  }
}
```

The **stored record is derived from `payloadStr`** (the signed truth), not the top-level convenience fields — eliminating signed-vs-routing drift. Top-level fields remain only for the routing guard and notification text.

### Canonical signed object (what `payloadStr` contains)

```ts
{ id, projectId, authorId, entryType, summary, metadata, timestamp }
```

---

## Task 1: Schema fields + `ulid` dependency

**Files:**
- Modify: `src/daemon/projects.ts:16-25` (`ProjectContribution`)
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Add `ulid` dependency**

Run: `npm install ulid@2.3.0`
Expected: `package.json` `dependencies` gains `"ulid": "^2.3.0"`; `package-lock.json` updated. (`ulid` is a zero-dependency, sortable id generator.)

- [ ] **Step 2: Extend the `ProjectContribution` interface**

In `src/daemon/projects.ts`, replace the interface (currently lines 16–25) with:

```ts
export interface ProjectContribution {
  id: string;           // ULID, minted by the AUTHOR (was receiver-minted projectId-entryType-Date.now())
  timestamp: string;    // ISO timestamp (author-set, covered by signature)
  authorId: string;     // peer ID who contributed (ed25519 pubkey hex) — IS the verification key
  authorIdentity?: AuthorIdentity;
  entryType?: string;
  topic?: string;       // legacy alias for entryType
  summary: string;
  metadata?: Record<string, any>;
  signature?: string;   // ed25519 sig over the canonical contribution (absent on legacy records)
  verified?: boolean;   // true = signature checked & valid; false = legacy/unsigned
  legacy?: boolean;     // true = predates signing (existing unsigned records)
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exit 0 (new fields are optional; no existing code breaks).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/daemon/projects.ts
git commit -m "feat(bd-6twb): add signature/verified/legacy fields + ulid dep"
```

---

## Task 2: `contribution-signing.ts` helper (the crypto core)

**Files:**
- Create: `src/daemon/contribution-signing.ts`
- Test: `test/contribution-signing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/contribution-signing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import {
  buildSignedContribution,
  verifySignedContribution
} from '../src/daemon/contribution-signing.js';

describe('contribution-signing', () => {
  const author = generateKeyPair();
  const base = {
    projectId: 'aicoe-expert-network',
    authorId: author.publicKey,
    entryType: 'tool-preference',
    summary: 'Use Opus 4.8 for planning',
    metadata: { tool: 'claude' }
  };

  it('builds a record + wire envelope that verifies', () => {
    const { record, wire } = buildSignedContribution(base, author.privateKey);

    expect(record.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(record.verified).toBe(true);
    expect(record.signature).toBe(wire.signature);
    expect(wire.payloadStr).toContain('"projectId":"aicoe-expert-network"');

    const res = verifySignedContribution(wire);
    expect(res.ok).toBe(true);
    expect(res.record?.summary).toBe('Use Opus 4.8 for planning');
    expect(res.record?.verified).toBe(true);
  });

  it('rejects a tampered summary', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const parsed = JSON.parse(wire.payloadStr);
    parsed.summary = 'malicious';
    const tampered = { ...wire, payloadStr: JSON.stringify(parsed) };
    expect(verifySignedContribution(tampered).ok).toBe(false);
  });

  it('rejects when authorId in payload does not own the signature', () => {
    const other = generateKeyPair();
    const { wire } = buildSignedContribution(base, other.privateKey); // signed by other
    // wire.authorId is base.authorId (author), but bytes were signed by `other`
    const forged = { ...wire, authorId: base.authorId };
    expect(verifySignedContribution(forged).ok).toBe(false);
  });

  it('enforces expectedSenderId when provided (live-contribution path)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    expect(verifySignedContribution(wire, author.publicKey).ok).toBe(true);
    expect(verifySignedContribution(wire, 'someone-else').ok).toBe(false);
    expect(verifySignedContribution(wire, 'someone-else').reason).toBe('sender-mismatch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/contribution-signing.test.ts`
Expected: FAIL — `Cannot find module '../src/daemon/contribution-signing.js'`.

- [ ] **Step 3: Implement the helper**

Create `src/daemon/contribution-signing.ts`:

```ts
import { ulid } from 'ulid';
import { signCanonical, verifyCanonical } from '../shared/signing.js';
import type { ProjectContribution, AuthorIdentity } from './projects.js';

/** The exact field set covered by an author's signature. */
export interface CanonicalContribution {
  id: string;
  projectId: string;
  authorId: string;
  entryType: string;
  summary: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

/** Signed envelope that crosses the wire inside the project.contribute payload. */
export interface SignedContributionWire {
  id: string;
  authorId: string;
  timestamp: string;
  payloadStr: string;  // exact signed bytes of the CanonicalContribution
  signature: string;
}

export interface BuildParams {
  projectId: string;
  authorId: string;          // author's ed25519 public key hex
  entryType: string;
  summary: string;
  metadata?: Record<string, any>;
  authorIdentity?: AuthorIdentity;
}

export interface VerifyOutcome {
  ok: boolean;
  reason?: string;
  record?: ProjectContribution;
}

/**
 * Author side: mint a ULID, sign the canonical contribution, and return both the
 * storable record (verified:true) and the wire envelope to send.
 */
export function buildSignedContribution(
  params: BuildParams,
  privateKeyHex: string
): { record: ProjectContribution; wire: SignedContributionWire } {
  const id = ulid();
  const canonical: CanonicalContribution = {
    id,
    projectId: params.projectId,
    authorId: params.authorId,
    entryType: params.entryType,
    summary: params.summary,
    ...(params.metadata !== undefined && { metadata: params.metadata })
  } as CanonicalContribution;

  const env = signCanonical(canonical, privateKeyHex); // stamps timestamp, returns payloadStr+signature
  const timestamp = env.payload.timestamp;

  const record: ProjectContribution = {
    id,
    timestamp,
    authorId: params.authorId,
    authorIdentity: params.authorIdentity,
    entryType: params.entryType,
    topic: params.entryType,
    summary: params.summary,
    metadata: params.metadata,
    signature: env.signature,
    verified: true
  };

  const wire: SignedContributionWire = {
    id,
    authorId: params.authorId,
    timestamp,
    payloadStr: env.payloadStr,
    signature: env.signature
  };

  return { record, wire };
}

/**
 * Receiver side: verify a wire envelope. The stored record is derived from the
 * SIGNED bytes (payloadStr), never from unsigned siblings. When expectedSenderId
 * is provided (the live project.contribute path), the canonical authorId must
 * equal the federation-authenticated sender — relay is rejected here (Story B's
 * upsert handles relayed records separately).
 */
export function verifySignedContribution(
  wire: SignedContributionWire | undefined | null,
  expectedSenderId?: string
): VerifyOutcome {
  if (!wire || typeof wire !== 'object') return { ok: false, reason: 'missing-contribution' };
  const { payloadStr, signature } = wire;
  if (!payloadStr || !signature) return { ok: false, reason: 'missing-signed-fields' };

  let canonical: CanonicalContribution;
  try {
    canonical = JSON.parse(payloadStr) as CanonicalContribution;
  } catch {
    return { ok: false, reason: 'bad-payload' };
  }
  if (!canonical.authorId || !canonical.id || !canonical.projectId) {
    return { ok: false, reason: 'incomplete-canonical' };
  }

  const vr = verifyCanonical({ payloadStr, signature }, canonical.authorId);
  if (!vr.ok) return { ok: false, reason: vr.reason ?? 'bad-signature' };

  if (expectedSenderId !== undefined && canonical.authorId !== expectedSenderId) {
    return { ok: false, reason: 'sender-mismatch' };
  }

  const record: ProjectContribution = {
    id: canonical.id,
    timestamp: canonical.timestamp,
    authorId: canonical.authorId,
    entryType: canonical.entryType,
    topic: canonical.entryType,
    summary: canonical.summary,
    metadata: canonical.metadata,
    signature,
    verified: true
  };
  return { ok: true, record };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/contribution-signing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/contribution-signing.ts test/contribution-signing.test.ts
git commit -m "feat(bd-6twb): contribution-signing helper (build+verify, ULID, sender check)"
```

---

## Task 3: `upsertContribution` (idempotent, verifying, member-exception)

**Files:**
- Modify: `src/daemon/projects.ts` (add `upsertContribution`; keep `contributeToProject` for now)
- Test: `test/contribution-upsert.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/contribution-upsert.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution } from '../src/daemon/contribution-signing.js';
import {
  addProject, createProject, joinProject, getProject,
  upsertContribution, type Project
} from '../src/daemon/projects.js';

describe('upsertContribution', () => {
  let tempDir: string;
  const author = generateKeyPair();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-upsert-'));
    process.env.OGP_HOME = tempDir;
    const p: Project = createProject('proj', 'Proj');
    addProject(p);
    joinProject('proj', author.publicKey); // author is a member
  });
  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const mk = () => buildSignedContribution({
    projectId: 'proj', authorId: author.publicKey,
    entryType: 'note', summary: 'hello'
  }, author.privateKey).record;

  it('stores a verified record and is idempotent by id', () => {
    const rec = mk();
    expect(upsertContribution('proj', rec)).toBe('inserted');
    expect(upsertContribution('proj', rec)).toBe('duplicate'); // same id, no-op

    const proj = getProject('proj')!;
    const all = proj.topics.flatMap(t => t.contributions);
    expect(all.filter(c => c.id === rec.id)).toHaveLength(1);
    expect(all[0].verified).toBe(true);
  });

  it('rejects a record whose signature does not verify', () => {
    const rec = mk();
    rec.summary = 'tampered-after-signing';
    expect(upsertContribution('proj', rec)).toBe('rejected');
  });

  it('accepts a verified record from a NON-member author (the Story B hook)', () => {
    const stranger = generateKeyPair();
    const rec = buildSignedContribution({
      projectId: 'proj', authorId: stranger.publicKey,
      entryType: 'note', summary: 'relayed'
    }, stranger.privateKey).record;
    // stranger is NOT joined to 'proj'
    expect(upsertContribution('proj', rec)).toBe('inserted');
  });

  it('returns not-found for an unknown project', () => {
    expect(upsertContribution('nope', mk())).toBe('not-found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/contribution-upsert.test.ts`
Expected: FAIL — `upsertContribution` is not exported.

- [ ] **Step 3: Implement `upsertContribution`**

Add to `src/daemon/projects.ts` (after `contributeToProject`):

```ts
export type UpsertResult = 'inserted' | 'duplicate' | 'rejected' | 'not-found';

/**
 * Merge a fully-formed contribution into a project by id. Idempotent: a record
 * whose id already exists is a no-op ('duplicate'). A signed record is verified
 * before insert. Unlike contributeToProject, this does NOT require the author to
 * be a project member — a verified signature is sufficient provenance, which is
 * what lets bd-53c (Story B) merge relayed contributions. Records lacking a
 * signature are rejected here (only the migration path may store unsigned/legacy).
 */
export function upsertContribution(
  projectId: string,
  record: ProjectContribution
): UpsertResult {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return 'not-found';

  for (const topic of project.topics) {
    if (topic.contributions.some(c => c.id === record.id)) return 'duplicate';
  }

  if (!record.signature) return 'rejected';
  // Lazy import avoids a require cycle (contribution-signing imports projects types).
  const { verifySignedContribution } = require('./contribution-signing.js');
  const check = verifySignedContribution({
    id: record.id,
    authorId: record.authorId,
    timestamp: record.timestamp,
    payloadStr: JSON.stringify({
      id: record.id, projectId, authorId: record.authorId,
      entryType: record.entryType, summary: record.summary,
      ...(record.metadata !== undefined && { metadata: record.metadata }),
      timestamp: record.timestamp
    }),
    signature: record.signature
  });
  if (!check.ok) return 'rejected';

  const entryTypeName = record.entryType || record.topic || 'unknown';
  let topic = project.topics.find(t => t.name === entryTypeName);
  if (!topic) {
    topic = { name: entryTypeName, contributions: [], lastUpdated: record.timestamp };
    project.topics.push(topic);
  }
  topic.contributions.push({ ...record, verified: true });
  topic.lastUpdated = record.timestamp;
  project.updatedAt = new Date().toISOString();
  saveProjects(projects);
  return 'inserted';
}
```

> **Note on the re-serialization in `upsertContribution`:** it reconstructs the canonical `payloadStr` from the record's own fields to verify them. This works ONLY because `signCanonical` uses plain `JSON.stringify` with a fixed key insertion order. Task 2's helper and this reconstruction MUST list keys in the identical order: `id, projectId, authorId, entryType, summary, metadata, timestamp`. Keep them in sync. (Story B will pass the original `payloadStr` through instead, avoiding this reconstruction; Story A only needs it for the local self-contribute store path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/contribution-upsert.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/projects.ts test/contribution-upsert.test.ts
git commit -m "feat(bd-6twb): idempotent verifying upsertContribution (member-exception for relay)"
```

---

## Task 4: Legacy-tagging migration

**Files:**
- Modify: `src/daemon/projects.ts` (add `migrateLegacyContributions`)
- Test: `test/contribution-upsert.test.ts` (append a `describe`)

- [ ] **Step 1: Write the failing test**

Append to `test/contribution-upsert.test.ts`:

```ts
import { migrateLegacyContributions, saveProjects } from '../src/daemon/projects.js';

describe('migrateLegacyContributions', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-migrate-'));
    process.env.OGP_HOME = tempDir;
    const p = createProject('legacy', 'Legacy');
    p.topics = [{ name: 'note', lastUpdated: '2026-05-20T00:00:00Z', contributions: [
      { id: 'legacy-1', timestamp: '2026-05-20T00:00:00Z', authorId: 'a', summary: 'old', entryType: 'note' }
    ]}];
    addProject(p);
    saveProjects([p]);
  });
  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('tags unsigned records verified:false legacy:true and is idempotent', () => {
    expect(migrateLegacyContributions()).toBe(1); // one record changed
    const c = getProject('legacy')!.topics[0].contributions[0];
    expect(c.verified).toBe(false);
    expect(c.legacy).toBe(true);
    expect(c.id).toBe('legacy-1'); // id preserved, not re-minted

    expect(migrateLegacyContributions()).toBe(0); // idempotent: nothing left to change
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/contribution-upsert.test.ts`
Expected: FAIL — `migrateLegacyContributions` not exported.

- [ ] **Step 3: Implement the migration**

Add to `src/daemon/projects.ts`:

```ts
/**
 * One-time, idempotent migration: tag every contribution lacking a signature as
 * verified:false, legacy:true. Original ids are preserved (never re-minted).
 * Returns the count of records changed (0 when already migrated). Safe to run on
 * every daemon start.
 */
export function migrateLegacyContributions(): number {
  const projects = loadProjects();
  let changed = 0;
  for (const project of projects) {
    for (const topic of project.topics) {
      for (const c of topic.contributions) {
        if (!c.signature && (c.verified === undefined || c.legacy === undefined)) {
          c.verified = false;
          c.legacy = true;
          changed++;
        }
      }
    }
  }
  if (changed > 0) saveProjects(projects);
  return changed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/contribution-upsert.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/projects.ts test/contribution-upsert.test.ts
git commit -m "feat(bd-6twb): idempotent legacy-contribution tagging migration"
```

---

## Task 5: Receiver verifies + upserts (`handleProjectContribute`)

**Files:**
- Modify: `src/daemon/message-handler.ts` (~731–815)
- Test: `test/project-contribute-verify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/project-contribute-verify.test.ts`. Mirror the mock style of `test/project-contribute-sync-membership.test.ts` (hoisted mocks for `../src/daemon/projects.js`), but assert verify-then-upsert:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution } from '../src/daemon/contribution-signing.js';

const author = generateKeyPair();

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(() => ({ id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '' })),
  isProjectMember: vi.fn(() => true),
  ensureProjectTopic: vi.fn(),
  upsertContribution: vi.fn(() => 'inserted'),
  getPeer: vi.fn(() => undefined)
}));

vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject,
  isProjectMember: mocks.isProjectMember,
  ensureProjectTopic: mocks.ensureProjectTopic,
  upsertContribution: mocks.upsertContribution,
  getContributionEntryType: vi.fn()
}));
vi.mock('../src/daemon/peers.js', () => ({ getPeer: mocks.getPeer }));
vi.mock('../src/daemon/notify.js', () => ({ notifyOpenClaw: vi.fn(async () => {}) }));

// Import AFTER mocks
import { handleMessage } from '../src/daemon/message-handler.js';

// handleMessage(message, signature, messageStr) verifies the OUTER message signature
// against the sending peer first. Mock getPeer to return an approved peer and stub
// the outer-signature verification so these tests isolate the CONTRIBUTION gate.
// (See note below: confirm how message-handler verifies the outer signature and mock
// that path — e.g. vi.mock('../src/shared/signing.js') partial, keeping the
// contribution helper's real verify by importing it directly in the helper module.)

function contributeMsg(wire: any, from = author.publicKey) {
  const message = {
    from, nonce: 'n1', intent: 'project.contribute',
    payload: JSON.stringify({
      projectId: 'proj', entryType: 'note', topic: 'note',
      summary: 'hello', contribution: wire
    })
  };
  return message;
}

describe('handleProjectContribute signature gate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.upsertContribution.mockReturnValue('inserted'); });

  it('verifies a signed contribution and upserts it', async () => {
    const { wire } = buildSignedContribution(
      { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'hello' },
      author.privateKey
    );
    const msg = contributeMsg(wire);
    const res: any = await handleMessage(msg as any, 'outer-sig', msg.payload);
    expect(res.success).toBe(true);
    expect(mocks.upsertContribution).toHaveBeenCalledOnce();
  });

  it('rejects with 400 when the contribution envelope is absent (no grace window)', async () => {
    const msg = { from: author.publicKey, nonce: 'n2', intent: 'project.contribute',
      payload: JSON.stringify({ projectId: 'proj', entryType: 'note', summary: 'hi' }) };
    const res: any = await handleMessage(msg as any, 'outer-sig', msg.payload);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(mocks.upsertContribution).not.toHaveBeenCalled();
  });

  it('rejects with 401 when authorId != federation sender (relay blocked on live path)', async () => {
    const { wire } = buildSignedContribution(
      { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'hello' },
      author.privateKey
    );
    const msg = contributeMsg(wire, 'different-sender');
    const res: any = await handleMessage(msg as any, 'outer-sig', msg.payload);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
```

> **Verified during planning:** the dispatcher is `export async function handleMessage(message: FederationMessage, signature: string, messageStr?: string)` (message-handler.ts:88). It first verifies the sender is an approved peer and the **outer** message signature before dispatching to `handleProjectContribute`. The test must satisfy that outer gate — mock `getPeer` to return an approved peer (already in `mocks`) and stub the outer-signature check. Inspect lines ~88–130 to see exactly which `signing.js` function verifies the outer message, and mock **only** that call (e.g. via a partial `vi.mock('../src/shared/signing.js')` that keeps `signCanonical`/`verifyCanonical` real for the contribution helper but forces the outer `verify`/`verifyObject` to `true`). Do NOT weaken the contribution-envelope verification — that is the unit under test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/project-contribute-verify.test.ts`
Expected: FAIL — handler still calls `contributeToProject` / has no envelope gate.

- [ ] **Step 3: Rewrite the contribute body**

In `src/daemon/message-handler.ts`, in `handleProjectContribute`: after the existing project-exists (404) and member (403) checks, replace the `contributeToProject(...)` block (~769–797) with envelope verification:

```ts
  // Signed-contribution gate (bd-6twb). No grace window: unsigned live
  // contributions are rejected.
  const contribution = payload.contribution;
  if (!contribution || !contribution.payloadStr || !contribution.signature) {
    return {
      success: false, nonce: message.nonce,
      error: 'Missing signed contribution envelope (id/payloadStr/signature)',
      statusCode: 400
    };
  }

  const { verifySignedContribution } = await import('./contribution-signing.js');
  const verdict = verifySignedContribution(contribution, message.from);
  if (!verdict.ok || !verdict.record) {
    return {
      success: false, nonce: message.nonce,
      error: `Contribution signature rejected: ${verdict.reason ?? 'unknown'}`,
      statusCode: 401
    };
  }

  // Attach identity snapshot (payload → peer fallback) without mutating signed fields.
  let identity = authorIdentity;
  if (!identity) {
    const peer = getPeer(message.from);
    if (peer) {
      identity = {
        displayName: peer.displayName, humanName: peer.humanName,
        agentName: peer.agentName, organization: peer.organization, tags: peer.tags
      };
    }
  }
  const record = { ...verdict.record, authorIdentity: identity };

  ensureProjectTopic(projectId, record.entryType || entryType);
  const upsert = upsertContribution(projectId, record);
  if (upsert === 'rejected' || upsert === 'not-found') {
    return {
      success: false, nonce: message.nonce,
      error: `Contribution not stored: ${upsert}`, statusCode: 422
    };
  }
  const contributionId = record.id; // 'inserted' or 'duplicate' both succeed (idempotent)
```

Update the import line at the top of the file: replace `contributeToProject` with `upsertContribution` in the `./projects.js` import. Keep the existing `notifyOpenClaw(...)` block below unchanged (it already uses `contributionId`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/project-contribute-verify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/daemon/message-handler.ts test/project-contribute-verify.test.ts
git commit -m "feat(bd-6twb): receiver verifies signed contribution + upserts (strict 400)"
```

---

## Task 6: Author signs — `projectContribute` (local store + member fan-out share ONE envelope)

**Files:**
- Modify: `src/cli/project.ts` — `projectContribute` local store (~339–347) AND member fan-out payload (~366–373); also `projectSendContribution` single-peer path (~647–654).

> **CRITICAL invariant:** In `projectContribute`, the local store (line 340) and the per-peer fan-out payload (line 366) are built **separately** today. With signing, the author MUST build the signed envelope **ONCE** and use the **same** `record` for the local upsert and the **same** `wire` for every peer payload. If you build per-target, each copy gets a different ULID and federation-wide dedup-by-id (the entire point of bd-53c) breaks. Build once, reuse.

- [ ] **Step 1: Update imports**

In `src/cli/project.ts` add:
- `import { getPrivateKey, getPublicKey } from '../daemon/keypair.js';`
- `import { buildSignedContribution } from '../daemon/contribution-signing.js';`
- Ensure `upsertContribution` is added to the existing `'../daemon/projects.js'` import (alongside `contributeToProject`, which other call-sites may still use).

- [ ] **Step 2: Build the envelope ONCE in `projectContribute`, store locally via upsert**

Replace the local-store block (~339–347) so the envelope is built before both store and fan-out:

```ts
  // Build the signed contribution ONCE; reuse for local store AND every peer (shared id+sig).
  const { record, wire } = buildSignedContribution(
    { projectId, authorId: getPublicKey(), entryType, summary, metadata, authorIdentity },
    getPrivateKey()
  );
  const upsert = upsertContribution(projectId, record);
  const contributionId = (upsert === 'inserted' || upsert === 'duplicate') ? record.id : null;
```

> `authorId` is `getPublicKey()` (the ed25519 key the signature verifies against), NOT `config.email`. The local project may list the member by `config.email`; `upsertContribution`'s member-exception stores the verified record regardless, so no membership change is needed for Story A.

- [ ] **Step 3: Reuse the SAME `wire` in the member fan-out payload**

Replace the fan-out `payload` construction (~366–373) to embed the shared `wire`:

```ts
      const payload = JSON.stringify({
        projectId,
        entryType,
        topic: entryType,
        summary,
        authorIdentity,
        ...(metadata && { metadata }),
        contribution: wire   // SAME envelope as the local record — identical id+signature
      });
```

(The `federationSend(peer.id, 'project.contribute', payload, 5000, options.toAgent)` loop below is unchanged.)

- [ ] **Step 4: Update the single-peer `projectSendContribution` path**

In `projectSendContribution`, replace the `payload` construction (~647–654):

```ts
  const { wire } = buildSignedContribution(
    { projectId, authorId: getPublicKey(), entryType, summary, metadata, authorIdentity },
    getPrivateKey()
  );
  const payload = {
    projectId, entryType, topic: entryType, summary, authorIdentity,
    ...(metadata && { metadata }),
    contribution: wire
  };
```

(The `federationSend(peerId, 'project.contribute', JSON.stringify(payload), undefined, options.toAgent)` call stays.)

- [ ] **Step 5: Build + run the focused suites**

Run: `npx tsc --noEmit && npx vitest run test/contribution-signing.test.ts test/contribution-upsert.test.ts test/project-contribute-verify.test.ts`
Expected: tsc exit 0; all three suites PASS.

- [ ] **Step 6: Fix the pre-existing fan-out test**

`test/project-contribute-sync-membership.test.ts` mocks `contributeToProject` and asserts the fan-out `federationSend` payload `stringContaining('"entryType":"progress"')`. After this change:
- The local store now calls `upsertContribution` — add it to the `vi.mock('../src/daemon/projects.js', ...)` block (return `'inserted'`) and update the `beforeEach` (`mocks.upsertContribution.mockReturnValue('inserted')`).
- The fan-out payload still contains `"entryType":"progress"` (unchanged assertion holds) and now ALSO contains a `"contribution":{...}` envelope — the existing `stringContaining` assertion still passes (it's a substring match). The membership *routing* assertions (only member-peer, not non-member-peer) are unchanged.
- This test also needs `keypair.js` mocked (it calls `getPublicKey`/`getPrivateKey` now): `vi.mock('../src/daemon/keypair.js', () => ({ getPublicKey: () => '<hex>', getPrivateKey: () => '<hex>' }))` — use a real generated keypair so `buildSignedContribution` produces a valid signature.

Run: `npx vitest run test/project-contribute-sync-membership.test.ts`
Expected: PASS. Show the diff in the commit.

- [ ] **Step 7: Commit**

```bash
git add src/cli/project.ts test/project-contribute-sync-membership.test.ts
git commit -m "feat(bd-6twb): author mints ULID + signs contribution once (shared envelope: local + fan-out + single-peer)"
```

---

## Task 7: Run migration on daemon start

**Files:**
- Modify: `src/daemon/server.ts` (in `startServer`, after config/state init, before accepting requests)

- [ ] **Step 1: Locate the startup hook**

Run: `grep -n "function startServer\|app.listen\|server.listen" src/daemon/server.ts`
Expected (verified during planning): `export function startServer(config?, background = false): void` at line 348; `server = app.listen(cfg.daemonPort, ...)` at ~1060. `startServer` is **synchronous** — do NOT use `await import`. Add a top-of-file static import instead. Place the migration call just before `app.listen(...)`.

- [ ] **Step 2: Wire the migration call**

Add to the imports at the top of `src/daemon/server.ts` (the file already imports from `./message-handler.js`):

```ts
import { migrateLegacyContributions } from './projects.js';
```

Then, in `startServer`, immediately before `server = app.listen(cfg.daemonPort, ...)` (~line 1060), add:

```ts
  try {
    const migrated = migrateLegacyContributions();
    if (migrated > 0) console.log(`[OGP] Tagged ${migrated} legacy (unsigned) contribution(s)`);
  } catch (err) {
    console.error('[OGP] Legacy contribution migration failed (non-fatal):', err);
  }
```

(Non-fatal: a migration failure must not block daemon start — it retries next boot, idempotently. Synchronous call, no `await`.)

- [ ] **Step 3: Verify build + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0; full suite green (modulo the known pre-existing unrelated `EADDRINUSE:3000` flake noted in the bd-ffl commit — confirm any failure is that one, not a Story A regression).

- [ ] **Step 4: Commit**

```bash
git add src/daemon/server.ts
git commit -m "feat(bd-6twb): run legacy-contribution migration on daemon start"
```

---

## Task 8: Escalation note, build artifacts, PR (no merge)

**Files:**
- Create/Modify: `docs/escalations/2026-06-04-signed-contributions.md`
- Modify: `dist/**` (compiled outputs, per repo convention — see prior `build(dist)` commits)

- [ ] **Step 1: Write the escalation note**

Create `docs/escalations/2026-06-04-signed-contributions.md` summarizing: what changed on the signed-message-adjacent path, the trust model (per-contribution ed25519 over canonical bytes, verified against `authorId`), the no-grace-window decision, and the member-exception that Story B relies on. State explicitly that no new crypto primitive was introduced (reuses `signCanonical`/`verifyCanonical`).

- [ ] **Step 2: Compile dist**

Run: `npm run build`
Expected: `dist/` updated (the repo commits compiled outputs — see commits `eb3f5cf`, `651c7f1`).

- [ ] **Step 3: Commit the build + escalation**

```bash
git add docs/escalations/2026-06-04-signed-contributions.md dist
git commit -m "docs(bd-6twb): escalation note + build(dist): compile signed-contribution outputs"
```

- [ ] **Step 4: Push the branch + open PR (do NOT merge)**

```bash
git push -u origin <branch>
gh pr create --base main --title "bd-6twb: signed project contributions (ULID + ed25519, verify-on-contribute)" --body "<summary + link to spec + escalate-before-merge note>"
```

Expected: PR opened against `main`, left unmerged (propose-don't-deploy).

- [ ] **Step 5: Close the bead**

```bash
bd close bd-6twb --reason "Shipped as PR #<n> ... (signed contributions, ULID, migration, strict 400). Propose-don't-deploy: PR open, not merged. Unblocks bd-53c."
```

---

## Self-Review

**Spec coverage** (against `2026-06-04-signed-contributions-design.md`):
- §4 schema (signature/verified/legacy) → Task 1 ✓
- §4 ULID + canonical form → Task 1 (dep) + Task 2 (sign) ✓
- §5.1 author side → Task 6 ✓
- §5.2 receiver verify + store verbatim + no-mint + non-member 403 retained → Task 5 ✓
- §5.3 `upsertContribution` idempotent/verify/member-exception → Task 3 ✓
- §5.4 self-contribution signed path → Task 6 Step 2 ✓
- §5.5 idempotent migration, no re-mint → Task 4 + Task 7 ✓
- §6 error table (400 missing-sig, 401 bad-sig, duplicate no-op, legacy kept) → Tasks 3,5 ✓
- §7 tests 1–8 → distributed across Tasks 2,3,4,5 ✓ (replay-into-other-project covered by Task 2 "rejects when authorId does not own signature" + canonical `projectId` binding; clock-skew handled by `verifyCanonical` default, noted)
- §9 escalation + no grace window → Task 5 (400) + Task 8 ✓

**Placeholder scan:** No "TBD/TODO". Two steps say "confirm the real export name" (Task 5/7) — these are deliberate verification steps against live code (export names confirmed during planning: `contributeToProject`, `upsertContribution`, temp-dir via `OGP_HOME`), not placeholders.

**Type consistency:** `buildSignedContribution`/`verifySignedContribution`/`SignedContributionWire`/`CanonicalContribution`/`UpsertResult` used identically across Tasks 2,3,5,6. Canonical key order (`id, projectId, authorId, entryType, summary, metadata, timestamp`) is called out as a sync-point in Tasks 2 and 3. `upsertContribution(projectId, record) → UpsertResult` consistent in Tasks 3,5,6.

**Resolved during planning (verified against live code):**
- Dispatcher: `handleMessage(message, signature, messageStr?)` (message-handler.ts:88), async, verifies outer message sig first → Task 5 test passes `(msg, 'outer-sig', msg.payload)` and mocks the outer-sig path.
- `startServer(config?, background?): void` is **synchronous** (server.ts:348), `app.listen` ~1060 → Task 7 uses a static import + plain call (no `await`).
- `projectContribute` (project.ts:296) stores locally (line 340) AND fans out to member peers (line 366) with a **separately-built** payload → Task 6 mandates ONE shared envelope for both, else federation-wide dedup-by-id breaks.
- `contributeToProject` has exactly two callers (message-handler.ts:789 receiver, project.ts:340 local) → Tasks 5 and 6 replace both; `projectSendContribution` (single-peer, project.ts:603) is the third author path → Task 6 Step 4.
- Test idiom: store/migration tests use `process.env.OGP_HOME = mkdtempSync(...)`; handler/CLI tests use hoisted `vi.mock`. `getConfigDir()` reads `OGP_HOME` (config.ts:345).

**Still cheap to confirm at implementation time (not blockers):**
- Task 5: which `signing.js` function verifies the OUTER message — mock only that, keep contribution verify real.
- Task 6 Step 6: the pre-existing fan-out test needs `upsertContribution` + `keypair.js` mocks added.
