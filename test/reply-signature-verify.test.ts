import { describe, expect, it } from 'vitest';
import { generateKeyPair, signObject, verifyObject } from '../src/shared/signing.js';

/**
 * F-05: /federation/reply/:nonce POST verifies the reply signature against
 * one of the locally-approved peers' publicKeys (iterating until one matches).
 *
 * The cross-process tracker design (CLI tracks nonce → peer, daemon checks)
 * was abandoned because CLI and daemon are separate Node processes and don't
 * share memory. The simpler "any approved peer" verification still closes
 * F-05 because:
 *   1. Only an approved peer with their private key can produce a valid sig.
 *   2. The nonce is a random UUID known only to the peer we sent it to —
 *      other approved peers never see it in normal traffic.
 *
 * This test documents the verification contract using the same primitives
 * the handler uses (signObject + verifyObject).
 */
describe('reply signature verification (F-05)', () => {
  it('a reply signed by an approved peer verifies with their publicKey', () => {
    const peerKp = generateKeyPair();
    const reply = {
      nonce: 'abc-123',
      success: true,
      data: { text: 'hello back' },
      timestamp: '2026-04-27T12:00:00.000Z',
      from: peerKp.publicKey.substring(0, 32),
      to: 'us'
    };
    const { payload, payloadStr, signature } = signObject(reply, peerKp.privateKey);

    // Iterate "approved peers" — in this test, just one
    const approvedPeers = [{ publicKey: peerKp.publicKey }];
    let signed = false;
    for (const peer of approvedPeers) {
      if (verifyObject(payload, signature, peer.publicKey, payloadStr)) {
        signed = true;
        break;
      }
    }
    expect(signed).toBe(true);
  });

  it('a reply signed by an unknown key fails to verify against any approved peer', () => {
    const peerKp = generateKeyPair();
    const attackerKp = generateKeyPair();

    const reply = {
      nonce: 'abc-123',
      success: true,
      data: 'forged',
      timestamp: '2026-04-27T12:00:00.000Z'
    };
    const { payload, payloadStr, signature } = signObject(reply, attackerKp.privateKey);

    // Only the legit peer is approved
    const approvedPeers = [{ publicKey: peerKp.publicKey }];
    let signed = false;
    for (const peer of approvedPeers) {
      if (verifyObject(payload, signature, peer.publicKey, payloadStr)) {
        signed = true;
        break;
      }
    }
    expect(signed).toBe(false);
  });

  it('iteration finds the right peer when multiple are approved', () => {
    const aliceKp = generateKeyPair();
    const bobKp = generateKeyPair();
    const carolKp = generateKeyPair();

    // Bob signs a reply
    const reply = { nonce: 'xyz', success: true, timestamp: '2026-04-27T12:00:00.000Z' };
    const { payload, payloadStr, signature } = signObject(reply, bobKp.privateKey);

    const approvedPeers = [
      { id: 'alice', publicKey: aliceKp.publicKey },
      { id: 'bob', publicKey: bobKp.publicKey },
      { id: 'carol', publicKey: carolKp.publicKey }
    ];
    let signingPeerId: string | null = null;
    for (const peer of approvedPeers) {
      if (verifyObject(payload, signature, peer.publicKey, payloadStr)) {
        signingPeerId = peer.id;
        break;
      }
    }
    expect(signingPeerId).toBe('bob');
  });

  it('a tampered payloadStr fails verification', () => {
    const kp = generateKeyPair();
    const reply = { nonce: 'abc', success: true, data: 'original', timestamp: '2026-04-27T12:00:00.000Z' };
    const { payload, payloadStr, signature } = signObject(reply, kp.privateKey);

    const tamperedStr = payloadStr.replace('original', 'tampered');
    expect(verifyObject(payload, signature, kp.publicKey, tamperedStr)).toBe(false);
  });
});
