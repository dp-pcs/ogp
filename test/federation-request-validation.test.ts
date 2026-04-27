import { describe, expect, it } from 'vitest';
import { validateSignedRequest } from '../src/daemon/server.js';
import {
  generateKeyPair,
  signCanonical,
  verifyCanonical
} from '../src/shared/signing.js';

/**
 * F-04: /federation/request must verify the body signature against the
 * publicKey supplied in the body — that proves the caller holds the matching
 * private key. The previous code destructured `signature` but never verified.
 */
describe('validateSignedRequest (F-04)', () => {
  const realDeps = { verifyEnvelope: verifyCanonical };

  function buildPeer(publicKey: string) {
    return {
      displayName: 'Alice',
      email: 'alice@test',
      gatewayUrl: 'https://alice.test',
      publicKey,
      humanName: 'Alice Human',
      agentName: 'Alice Agent',
      organization: 'Test Org'
    };
  }

  it('accepts a valid signed request with peer + offeredIntents', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      {
        peer: buildPeer(kp.publicKey),
        offeredIntents: ['message', 'agent-comms']
      },
      kp.privateKey
    );

    const result = validateSignedRequest(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.peer.publicKey).toBe(kp.publicKey);
      expect(result.parsed.peer.displayName).toBe('Alice');
      expect(result.parsed.peer.humanName).toBe('Alice Human');
      expect(result.parsed.offeredIntents).toEqual(['message', 'agent-comms']);
    }
  });

  it('rejects a request signed by the wrong key with 401', () => {
    const aliceKp = generateKeyPair();
    const attackerKp = generateKeyPair();

    // Attacker claims to be Alice (peer.publicKey = Alice's) but signs with
    // their own private key.
    const env = signCanonical(
      { peer: buildPeer(aliceKp.publicKey) },
      attackerKp.privateKey
    );

    const result = validateSignedRequest(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/Signature verification failed/);
    }
  });

  it('rejects a request missing payloadStr with 400', () => {
    const result = validateSignedRequest({ signature: 'deadbeef' }, realDeps);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects a request missing signature with 400', () => {
    const result = validateSignedRequest({ payloadStr: '{}' }, realDeps);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects a request missing peer.publicKey with 400', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { peer: { displayName: 'Alice' /* no publicKey */ } },
      kp.privateKey
    );
    const result = validateSignedRequest(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Missing peer\.publicKey/);
    }
  });

  it('rejects a stale request with 401', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { peer: buildPeer(kp.publicKey) },
      kp.privateKey,
      { timestamp: '2020-01-01T00:00:00.000Z' }
    );

    const result = validateSignedRequest(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/stale-timestamp/);
    }
  });

  it('rejects a tampered payloadStr with 401', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { peer: buildPeer(kp.publicKey) },
      kp.privateKey
    );
    // Tamper: change displayName after signing
    const tamperedStr = env.payloadStr.replace('Alice', 'EvilAlice');
    const result = validateSignedRequest(
      { payloadStr: tamperedStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/bad-signature/);
    }
  });

  it('coerces missing optional identity fields to empty strings', () => {
    const kp = generateKeyPair();
    // Minimal peer — only publicKey
    const env = signCanonical(
      { peer: { publicKey: kp.publicKey } },
      kp.privateKey
    );

    const result = validateSignedRequest(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.peer.displayName).toBe('');
      expect(result.parsed.peer.email).toBe('');
      expect(result.parsed.peer.gatewayUrl).toBe('');
      expect(result.parsed.peer.publicKey).toBe(kp.publicKey);
      expect(result.parsed.peer.humanName).toBeUndefined();
    }
  });
});
