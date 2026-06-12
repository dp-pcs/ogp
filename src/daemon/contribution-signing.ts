import { ulid } from 'ulid';
import { signCanonical, verifyCanonical } from '../shared/signing.js';
import type { ProjectContribution, AuthorIdentity } from './projects.js';

// Peers are identified by a 32-char public-key prefix (BUILD-111). The federation
// transport sets message.from to this prefix, while a signed contribution's authorId
// is the full SPKI hex key. Normalize both to this canonical form before comparing
// sender identity. Kept as a local constant (must equal CANONICAL_PEER_ID_LENGTH in
// peers.ts) to avoid coupling this signing module to the peer store for one number;
// the comment is the guard against silent drift if peers.ts ever changes the length.
const CANONICAL_PEER_ID_LENGTH = 32;
function canonicalPeerId(key: string): string {
  return key.length > CANONICAL_PEER_ID_LENGTH ? key.substring(0, CANONICAL_PEER_ID_LENGTH) : key;
}

/**
 * Contributions are durable artifacts, not ephemeral handshake messages, so we
 * disable verifyCanonical's default 5-minute max-age check by passing an
 * effectively unbounded maxAgeMs. Signature verification is unchanged.
 */
const CONTRIBUTION_MAX_AGE_MS = Number.MAX_SAFE_INTEGER;

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

/**
 * Reconstruct the EXACT canonical bytes an author signed for a stored contribution
 * record. `signCanonical` serializes `{ ...canonical, timestamp }` via JSON.stringify
 * (buildSignedContribution: id, projectId, authorId, entryType, summary, [metadata]);
 * signCanonical appends `timestamp` last. This MUST match that order/shape byte-for-
 * byte or the signature won't verify — a single shared helper used by the signer-side
 * upsert AND the query responder (bd-53c) eliminates drift. Guarded by a round-trip
 * test (the emitted payloadStr re-verifies against the stored signature).
 */
export function canonicalPayloadStr(
  record: Pick<ProjectContribution, 'id' | 'authorId' | 'entryType' | 'topic' | 'summary' | 'metadata' | 'timestamp'>,
  projectId: string
): string {
  return JSON.stringify({
    id: record.id,
    projectId,
    authorId: record.authorId,
    entryType: record.entryType ?? record.topic,
    summary: record.summary,
    ...(record.metadata !== undefined && { metadata: record.metadata }),
    timestamp: record.timestamp
  });
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
  expectedSenderId?: string,
  expectedProjectId?: string
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

  const vr = verifyCanonical(
    { payloadStr, signature },
    canonical.authorId,
    { maxAgeMs: CONTRIBUTION_MAX_AGE_MS }
  );
  if (!vr.ok) return { ok: false, reason: vr.reason ?? 'bad-signature' };

  if (
    expectedSenderId !== undefined &&
    canonicalPeerId(canonical.authorId) !== canonicalPeerId(expectedSenderId)
  ) {
    return { ok: false, reason: 'sender-mismatch' };
  }

  if (expectedProjectId !== undefined && canonical.projectId !== expectedProjectId) {
    return { ok: false, reason: 'project-mismatch' };
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
