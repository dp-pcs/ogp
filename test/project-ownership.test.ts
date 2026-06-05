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
});
