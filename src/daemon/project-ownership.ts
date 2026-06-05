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
  creatorKey: string;
  createdAt: string;
  provenance: 'original' | 'legacy-claim';
  signature: string;
  payloadStr: string;
}

export interface OwnerGrant {
  id: string;
  projectId: string;
  grantee: string;
  grantedBy: string;
  grantedAt: string;
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
