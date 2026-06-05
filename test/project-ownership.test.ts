import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
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
import {
  addProject, createProject, getProject,
  setProjectCreation, addOwnerGrant, isOwner, resolvePendingGrants, type Project
} from '../src/daemon/projects.js';

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
    const g = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    const owners = deriveOwners(c, [g]);
    expect(owners.has(bob.publicKey.substring(0, 32))).toBe(false);
  });

  it('ignores a grant whose signature does not match grantedBy', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const g = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: creator.publicKey }, bob.privateKey);
    const owners = deriveOwners(c, [g]);
    expect(owners.has(alice.publicKey.substring(0, 32))).toBe(false);
  });

  it('returns empty owners when creation is absent', () => {
    expect(deriveOwners(undefined, []).size).toBe(0);
  });

  it('admits NEITHER party in a rootless cycle (A grants B, B grants A, no creator link)', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const gAB = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    const gBA = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: bob.publicKey }, bob.privateKey);
    const owners = deriveOwners(c, [gAB, gBA]);
    expect(owners.has(alice.publicKey.substring(0,32))).toBe(false);
    expect(owners.has(bob.publicKey.substring(0,32))).toBe(false);
    expect(owners.has(creator.publicKey.substring(0,32))).toBe(true); // creator unaffected
  });

  it('does not bootstrap a non-owner via self-grant', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const selfGrant = buildSignedGrant({ projectId: 'p', grantee: alice.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    expect(deriveOwners(c, [selfGrant]).has(alice.publicKey.substring(0,32))).toBe(false);
  });

  it('rejects a grant whose outer field was swapped after signing (field-mismatch)', () => {
    // valid grant alice->bob, then tamper the outer grantedBy to a real owner's key
    const g = buildSignedGrant({ projectId: 'p', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    const tampered = { ...g, grantedBy: creator.publicKey }; // claim creator granted it, but signed by alice over alice
    expect(verifySignedGrant(tampered).ok).toBe(false);
    expect(['bad-signature', 'field-mismatch']).toContain(verifySignedGrant(tampered).reason);
  });

  it('ignores a grant for a different project', () => {
    const c = buildSignedCreation({ projectId: 'p', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    const otherProjGrant = buildSignedGrant({ projectId: 'other', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
    expect(deriveOwners(c, [otherProjGrant]).has(alice.publicKey.substring(0,32))).toBe(false);
  });
});

describe('projects ownership storage + isOwner', () => {
  let tempDir: string;
  const creator = generateKeyPair();
  const alice = generateKeyPair();
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-own-'));
    process.env.OGP_HOME = tempDir;
    addProject(createProject('proj', 'Proj'));
  });
  afterEach(() => { delete process.env.OGP_HOME; fs.rmSync(tempDir, { recursive: true, force: true }); });

  it('isOwner: creator after setProjectCreation; non-owner otherwise', () => {
    expect(isOwner('proj', creator.publicKey)).toBe(false);
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    expect(setProjectCreation('proj', c)).toBe('set');
    expect(isOwner('proj', creator.publicKey)).toBe(true);
    expect(isOwner('proj', alice.publicKey)).toBe(false);
  });

  it('isOwner: grantee after a valid grant; idempotent grant', () => {
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

  it('setProjectCreation: not-found for unknown project; rejected for bad signature', () => {
    const c = buildSignedCreation({ projectId: 'nope', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    expect(setProjectCreation('nope', c)).toBe('not-found');
    const bad = { ...buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey), signature: 'deadbeef' };
    expect(setProjectCreation('proj', bad)).toBe('rejected');
  });
});

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
    const gAliceBob = buildSignedGrant({ projectId: 'proj', grantee: bob.publicKey, grantedBy: alice.publicKey }, alice.privateKey);
    expect(addOwnerGrant('proj', gAliceBob)).toBe('pending');
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: creator.publicKey, provenance: 'original' }, creator.privateKey);
    setProjectCreation('proj', c);
    const gCreatorAlice = buildSignedGrant({ projectId: 'proj', grantee: alice.publicKey, grantedBy: creator.publicKey }, creator.privateKey);
    expect(addOwnerGrant('proj', gCreatorAlice)).toBe('added');
    expect(isOwner('proj', bob.publicKey)).toBe(true);
  });
});
