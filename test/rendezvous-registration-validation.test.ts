import { describe, expect, it } from 'vitest';
import { validateSignedRegistration } from '../packages/rendezvous/src/index.js';
import { verifyCanonical as rendezvousVerify } from '../packages/rendezvous/src/verify.js';
import {
  generateKeyPair,
  signCanonical
} from '../src/shared/signing.js';

/**
 * F-02: rendezvous /register and /invite must require a proof-of-possession
 * signature so a caller cannot squat on someone else's pubkey.
 */
describe('validateSignedRegistration (F-02)', () => {
  // Default deps use the rendezvous package's vendored verifyCanonical (no
  // dependency on the main OGP package at runtime). We pass it explicitly
  // here to make the test isolation clear.
  const realDeps = (env: { payloadStr?: string; signature?: string }, pk: string) =>
    rendezvousVerify(env, pk);

  it('accepts a valid signed registration', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790 },
      kp.privateKey
    );

    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pubkey).toBe(kp.publicKey);
      expect(result.port).toBe(18790);
    }
  });

  it('passes through publicUrl when present', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, publicUrl: 'https://alice.test' },
      kp.privateKey
    );

    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publicUrl).toBe('https://alice.test');
    }
  });

  it('rejects a registration signed by the wrong key with 401', () => {
    const aliceKp = generateKeyPair();
    const attackerKp = generateKeyPair();

    // Attacker tries to register Alice's pubkey, but signs with their own key.
    const env = signCanonical(
      { pubkey: aliceKp.publicKey, port: 18790 },
      attackerKp.privateKey
    );

    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/Signature verification failed/);
    }
  });

  it('rejects missing payloadStr with 400', () => {
    const result = validateSignedRegistration(
      { signature: 'deadbeef' },
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects missing signature with 400', () => {
    const result = validateSignedRegistration(
      { payloadStr: '{}' },
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Missing payloadStr or signature'
    });
  });

  it('rejects malformed payloadStr with 400', () => {
    const result = validateSignedRegistration(
      { payloadStr: 'not-json{', signature: 'deadbeef' },
      realDeps
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'payloadStr is not valid JSON'
    });
  });

  it('rejects missing pubkey field in payload with 400', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { port: 18790 } as any,
      kp.privateKey
    );
    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/pubkey is required/);
    }
  });

  it('rejects out-of-range port with 400', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 99999 },
      kp.privateKey
    );
    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature },
      realDeps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/port is required/);
    }
  });

  it('rejects a stale registration with 401', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790 },
      kp.privateKey,
      { timestamp: '2020-01-01T00:00:00.000Z' }
    );
    const result = validateSignedRegistration(
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
      { pubkey: kp.publicKey, port: 18790 },
      kp.privateKey
    );
    const tamperedStr = env.payloadStr.replace('18790', '99999');
    const result = validateSignedRegistration(
      { payloadStr: tamperedStr, signature: env.signature },
      realDeps
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Could be either bad-signature (sig over original payload) or 400
      // (port out of range after tampering), depending on which check fires
      // first. Tampering is what matters.
      expect([400, 401]).toContain(result.status);
    }
  });
});

/**
 * Quick sanity check that the vendored verify helper in the rendezvous
 * package matches the main package's signCanonical. If signers and
 * verifiers ever diverge, all rendezvous registrations break — this test
 * is the canary.
 */
describe('rendezvous verify helper compatibility', () => {
  it('verifies an envelope produced by main signCanonical', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790 },
      kp.privateKey
    );

    const result = rendezvousVerify(
      { payloadStr: env.payloadStr, signature: env.signature },
      kp.publicKey
    );

    expect(result).toEqual({ ok: true });
  });

  it('returns the same VerifyReason codes as the main verifyCanonical', () => {
    expect(rendezvousVerify({ signature: 'x' }, 'pk').reason).toBe('missing-payload');
    expect(rendezvousVerify({}, 'pk').reason).toBe('missing-signature');
  });
});

/**
 * bd-b7em Phase 1: transport descriptor carried inside the signed registration.
 * The descriptor must be parsed ONLY from the signature-verified payload, so a
 * relay/iroh transport can never be injected by an unsigned sibling field.
 */
describe('transport descriptor (bd-b7em)', () => {
  const realDeps = (env: { payloadStr?: string; signature?: string }, pk: string) =>
    rendezvousVerify(env, pk);

  it('absent transport ⇒ direct (no descriptor on result)', () => {
    const kp = generateKeyPair();
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790 }, kp.privateKey);
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transport).toBeUndefined();
  });

  it('stores a signed relay descriptor', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, transport: { transport: 'relay', relayUrl: 'wss://relay.test/relay' } },
      kp.privateKey
    );
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transport).toEqual({ transport: 'relay', relayUrl: 'wss://relay.test/relay' });
  });

  it('stores a signed iroh descriptor (field carried, not consumed in Phase 1)', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, transport: { transport: 'iroh', nodeId: 'node-abc', relayUrl: 'https://iroh.test' } },
      kp.privateKey
    );
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transport).toEqual({ transport: 'iroh', nodeId: 'node-abc', relayUrl: 'https://iroh.test' });
  });

  it('rejects relay descriptor missing relayUrl with 400', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, transport: { transport: 'relay' } },
      kp.privateKey
    );
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/relayUrl is required/);
    }
  });

  it('rejects an unknown transport mode with 400', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, transport: { transport: 'carrier-pigeon' } },
      kp.privateKey
    );
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('TRUST: a transport field OUTSIDE the signed payload is ignored', () => {
    // Sign a plain direct registration (no transport in the signed bytes)...
    const kp = generateKeyPair();
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790 }, kp.privateKey);
    // ...then an attacker bolts a relay transport onto the OUTER body. Since the
    // validator only parses the verified payloadStr, this must be ignored.
    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature, transport: { transport: 'relay', relayUrl: 'wss://evil.test/relay' } } as any,
      realDeps
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transport).toBeUndefined(); // attacker's transport not honored
  });

  // ── bd-maas: multi-transport list + signed identity card ──────────────────

  it('accepts a signed transport LIST and returns it', () => {
    const kp = generateKeyPair();
    const transports = [
      { transport: 'direct', gatewayUrl: 'https://me.example' },
      { transport: 'relay', relayUrl: 'wss://r/relay' }
    ];
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790, transports }, kp.privateKey);
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transports).toEqual(transports);
  });

  it('rejects a transport LIST with a malformed entry', () => {
    const kp = generateKeyPair();
    const env = signCanonical(
      { pubkey: kp.publicKey, port: 18790, transports: [{ transport: 'relay' /* no relayUrl */ }] },
      kp.privateKey
    );
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('TRUST: a transports field OUTSIDE the signed payload is ignored', () => {
    const kp = generateKeyPair();
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790 }, kp.privateKey);
    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature, transports: [{ transport: 'relay', relayUrl: 'wss://evil/relay' }] } as any,
      realDeps
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transports).toBeUndefined();
  });

  it('accepts a signed identity card whose publicKey matches the registration', () => {
    const kp = generateKeyPair();
    const card = { displayName: 'Me', email: 'me@x.com', publicKey: kp.publicKey, offeredIntents: ['message'] };
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790, card }, kp.privateKey);
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card).toEqual(card);
  });

  it('TRUST: rejects a card whose publicKey differs from the registration pubkey', () => {
    const kp = generateKeyPair();
    const other = generateKeyPair();
    // The signer holds kp, but the card claims a DIFFERENT identity (other's key).
    const card = { displayName: 'Imposter', publicKey: other.publicKey };
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790, card }, kp.privateKey);
    const result = validateSignedRegistration({ payloadStr: env.payloadStr, signature: env.signature }, realDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('TRUST: a card field OUTSIDE the signed payload is ignored', () => {
    const kp = generateKeyPair();
    const env = signCanonical({ pubkey: kp.publicKey, port: 18790 }, kp.privateKey);
    const result = validateSignedRegistration(
      { payloadStr: env.payloadStr, signature: env.signature, card: { displayName: 'Evil', publicKey: kp.publicKey } } as any,
      realDeps
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card).toBeUndefined();
  });
});
