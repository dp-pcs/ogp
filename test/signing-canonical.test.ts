import { describe, expect, it } from 'vitest';
import {
  generateKeyPair,
  signCanonical,
  verifyCanonical
} from '../src/shared/signing.js';

describe('signCanonical / verifyCanonical', () => {
  const kp = generateKeyPair();
  const otherKp = generateKeyPair();

  it('round-trips a signed envelope', () => {
    const env = signCanonical({ peerId: 'abc', port: 18790 }, kp.privateKey);

    expect(env.signature).toMatch(/^[0-9a-f]+$/);
    expect(env.payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.payloadStr).toContain('"peerId":"abc"');
    expect(env.payloadStr).toContain('"timestamp":');

    const result = verifyCanonical(env, kp.publicKey);
    expect(result).toEqual({ ok: true });
  });

  it('respects an explicit timestamp passed via opts', () => {
    const fixed = '2026-04-27T12:00:00.000Z';
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey, { timestamp: fixed });
    expect(env.payload.timestamp).toBe(fixed);
  });

  it('preserves an existing timestamp on the payload when opts is empty', () => {
    const env = signCanonical(
      { peerId: 'abc', timestamp: '2026-04-27T12:00:00.000Z' },
      kp.privateKey
    );
    expect(env.payload.timestamp).toBe('2026-04-27T12:00:00.000Z');
  });

  it('rejects a missing signature', () => {
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey);
    const tampered = { ...env, signature: undefined as unknown as string };
    expect(verifyCanonical(tampered, kp.publicKey)).toEqual({
      ok: false,
      reason: 'missing-signature'
    });
  });

  it('rejects a missing payload', () => {
    expect(
      verifyCanonical({ signature: 'deadbeef' }, kp.publicKey)
    ).toEqual({ ok: false, reason: 'missing-payload' });
  });

  it('rejects a missing timestamp', () => {
    // Hand-build an envelope whose payload omits timestamp.
    const payloadStr = JSON.stringify({ peerId: 'abc' });
    const sig = signCanonical({ peerId: 'abc' }, kp.privateKey).signature;
    const result = verifyCanonical(
      { payloadStr, signature: sig },
      kp.publicKey
    );
    expect(result).toEqual({ ok: false, reason: 'missing-timestamp' });
  });

  it('rejects a bad timestamp string', () => {
    const payloadStr = JSON.stringify({ peerId: 'abc', timestamp: 'not-a-date' });
    const env = {
      payloadStr,
      signature: signCanonical({ peerId: 'abc', timestamp: 'not-a-date' }, kp.privateKey).signature
    };
    expect(verifyCanonical(env, kp.publicKey)).toEqual({
      ok: false,
      reason: 'bad-timestamp'
    });
  });

  it('rejects a stale timestamp (beyond maxAgeMs)', () => {
    const stale = '2026-04-27T10:00:00.000Z';
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey, { timestamp: stale });
    const now = new Date('2026-04-27T12:00:00.000Z').getTime();
    expect(verifyCanonical(env, kp.publicKey, { now, maxAgeMs: 5 * 60 * 1000 })).toEqual({
      ok: false,
      reason: 'stale-timestamp'
    });
  });

  it('rejects a future timestamp beyond maxAgeMs (clock skew protection)', () => {
    const future = '2026-04-27T14:00:00.000Z';
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey, { timestamp: future });
    const now = new Date('2026-04-27T12:00:00.000Z').getTime();
    expect(verifyCanonical(env, kp.publicKey, { now, maxAgeMs: 5 * 60 * 1000 })).toEqual({
      ok: false,
      reason: 'stale-timestamp'
    });
  });

  it('rejects a signature from the wrong key', () => {
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey);
    expect(verifyCanonical(env, otherKp.publicKey)).toEqual({
      ok: false,
      reason: 'bad-signature'
    });
  });

  it('rejects a tampered payload (payloadStr mutated post-sign)', () => {
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey);
    const tampered = {
      ...env,
      payloadStr: env.payloadStr.replace('abc', 'xyz')
    };
    expect(verifyCanonical(tampered, kp.publicKey)).toEqual({
      ok: false,
      reason: 'bad-signature'
    });
  });

  it('uses payloadStr as the canonical message when both payload and payloadStr are present', () => {
    // Sign with one shape, then send a different `payload` field but the
    // original `payloadStr` — verification should still pass because the
    // bytes that were signed are what we verify.
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey);
    const trickyEnvelope = {
      payload: { peerId: 'xyz', timestamp: env.payload.timestamp },
      payloadStr: env.payloadStr,
      signature: env.signature
    };
    expect(verifyCanonical(trickyEnvelope, kp.publicKey)).toEqual({ ok: true });
  });

  it('parses timestamp from payloadStr, not from the convenience payload field', () => {
    // Same tricky envelope as above, but payload.timestamp is stale while
    // payloadStr.timestamp is fresh — verification should pass because we
    // trust the signed bytes' timestamp, not the loose payload.
    const env = signCanonical({ peerId: 'abc' }, kp.privateKey);
    const trickyEnvelope = {
      payload: { peerId: 'abc', timestamp: '2020-01-01T00:00:00.000Z' },
      payloadStr: env.payloadStr,
      signature: env.signature
    };
    expect(verifyCanonical(trickyEnvelope, kp.publicKey)).toEqual({ ok: true });
  });
});
