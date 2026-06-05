import { ulid } from 'ulid';
import { signCanonical, verifyCanonical } from '../shared/signing.js';
/**
 * Contributions are durable artifacts, not ephemeral handshake messages, so we
 * disable verifyCanonical's default 5-minute max-age check by passing an
 * effectively unbounded maxAgeMs. Signature verification is unchanged.
 */
const CONTRIBUTION_MAX_AGE_MS = Number.MAX_SAFE_INTEGER;
/**
 * Author side: mint a ULID, sign the canonical contribution, and return both the
 * storable record (verified:true) and the wire envelope to send.
 */
export function buildSignedContribution(params, privateKeyHex) {
    const id = ulid();
    const canonical = {
        id,
        projectId: params.projectId,
        authorId: params.authorId,
        entryType: params.entryType,
        summary: params.summary,
        ...(params.metadata !== undefined && { metadata: params.metadata })
    };
    const env = signCanonical(canonical, privateKeyHex); // stamps timestamp, returns payloadStr+signature
    const timestamp = env.payload.timestamp;
    const record = {
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
    const wire = {
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
export function verifySignedContribution(wire, expectedSenderId, expectedProjectId) {
    if (!wire || typeof wire !== 'object')
        return { ok: false, reason: 'missing-contribution' };
    const { payloadStr, signature } = wire;
    if (!payloadStr || !signature)
        return { ok: false, reason: 'missing-signed-fields' };
    let canonical;
    try {
        canonical = JSON.parse(payloadStr);
    }
    catch {
        return { ok: false, reason: 'bad-payload' };
    }
    if (!canonical.authorId || !canonical.id || !canonical.projectId) {
        return { ok: false, reason: 'incomplete-canonical' };
    }
    const vr = verifyCanonical({ payloadStr, signature }, canonical.authorId, { maxAgeMs: CONTRIBUTION_MAX_AGE_MS });
    if (!vr.ok)
        return { ok: false, reason: vr.reason ?? 'bad-signature' };
    if (expectedSenderId !== undefined && canonical.authorId !== expectedSenderId) {
        return { ok: false, reason: 'sender-mismatch' };
    }
    if (expectedProjectId !== undefined && canonical.projectId !== expectedProjectId) {
        return { ok: false, reason: 'project-mismatch' };
    }
    const record = {
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
//# sourceMappingURL=contribution-signing.js.map