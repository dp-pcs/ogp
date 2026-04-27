import { describe, expect, it, vi } from 'vitest';
import { validateSignedApproval } from '../src/daemon/server.js';
import {
  generateKeyPair,
  signCanonical,
  verifyCanonical
} from '../src/shared/signing.js';

/**
 * F-01: /federation/approve must verify the body signature against the
 * publicKey already stored for the pending peer (set during /federation/request),
 * NOT against any publicKey supplied in the body. The handler must also reject
 * any attempt to claim a different publicKey for the pending peer — that's
 * the publicKey-replacement hijack vector.
 */
describe('validateSignedApproval (F-01)', () => {
  const realDeps = { verifyEnvelope: verifyCanonical };

  it('accepts a body signed by the stored peer publicKey', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      {
        fromGatewayUrl: 'https://alice.test',
        fromDisplayName: 'Alice',
        fromPublicKey: kp.publicKey,
        protocolVersion: '0.2.0'
      },
      kp.privateKey
    );

    const result = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      kp.publicKey,
      realDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.fromGatewayUrl).toBe('https://alice.test');
      expect(result.parsed.fromPublicKey).toBe(kp.publicKey);
    }
  });

  it('rejects a body signed by an attacker (wrong key) with 401', () => {
    const aliceKp = generateKeyPair();
    const attackerKp = generateKeyPair();

    // Attacker signs a body claiming to BE Alice (fromPublicKey = Alice's),
    // but signs with their own privateKey.
    const env = signCanonical(
      {
        fromGatewayUrl: 'https://attacker.test',
        fromPublicKey: aliceKp.publicKey,
        protocolVersion: '0.2.0'
      },
      attackerKp.privateKey
    );

    const result = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      aliceKp.publicKey,
      realDeps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/Signature verification failed/);
    }
  });

  it('rejects publicKey replacement (fromPublicKey != stored) with 403', () => {
    const aliceKp = generateKeyPair();
    const attackerKp = generateKeyPair();

    // Attacker signs a body with their own privateKey AND claims their own
    // publicKey via fromPublicKey. The signature itself is valid for the
    // attacker's key — but the stored peer publicKey is Alice's. The handler
    // must reject because a successful approval here would overwrite Alice's
    // stored publicKey with the attacker's.
    const env = signCanonical(
      {
        fromGatewayUrl: 'https://attacker.test',
        fromPublicKey: attackerKp.publicKey,
        protocolVersion: '0.2.0'
      },
      attackerKp.privateKey
    );

    // Test path 1: signature verifies against stored Alice's key? No — it
    // was signed by attacker. So this naturally falls through to the
    // bad-signature branch first. Document that for clarity.
    const result1 = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      aliceKp.publicKey,
      realDeps
    );
    expect(result1.ok).toBe(false);
    if (!result1.ok) expect(result1.status).toBe(401);

    // Test path 2: simulate a (hypothetical) world where the attacker has
    // somehow obtained a valid signature for the stored key but is still
    // trying to swap publicKey. Use a stub verifier that always returns ok
    // to isolate the fromPublicKey-mismatch rule.
    const stubDeps = { verifyEnvelope: () => ({ ok: true }) };
    const result2 = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      aliceKp.publicKey,
      stubDeps
    );
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.status).toBe(403);
      expect(result2.error).toMatch(/fromPublicKey does not match/);
    }
  });

  it('accepts when fromPublicKey matches the stored publicKey', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      {
        fromGatewayUrl: 'https://alice.test',
        fromPublicKey: kp.publicKey, // matches stored
        protocolVersion: '0.2.0'
      },
      kp.privateKey
    );

    const result = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      kp.publicKey,
      realDeps
    );

    expect(result.ok).toBe(true);
  });

  it('accepts when fromPublicKey is omitted', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      {
        fromGatewayUrl: 'https://alice.test',
        protocolVersion: '0.2.0'
        // no fromPublicKey
      },
      kp.privateKey
    );

    const result = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      kp.publicKey,
      realDeps
    );

    expect(result.ok).toBe(true);
  });

  it('rejects a missing payloadStr with 400', () => {
    const result = validateSignedApproval(
      { signature: 'deadbeef' },
      'somekey',
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects a missing signature with 400', () => {
    const result = validateSignedApproval(
      { payloadStr: '{}' },
      'somekey',
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects a malformed payloadStr with 400', () => {
    const result = validateSignedApproval(
      { payloadStr: 'not-json{', signature: 'deadbeef' },
      'somekey',
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'payloadStr is not valid JSON'
    });
  });

  it('rejects a stale-timestamp envelope with 401', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { fromGatewayUrl: 'https://alice.test' },
      kp.privateKey,
      { timestamp: '2020-01-01T00:00:00.000Z' } // very stale
    );
    const result = validateSignedApproval(
      { payloadStr: env.payloadStr, signature: env.signature },
      kp.publicKey,
      realDeps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/stale-timestamp/);
    }
  });
});
