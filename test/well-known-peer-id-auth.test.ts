import { describe, expect, it } from 'vitest';
import { verifySignedPeerIdHeader } from '../src/daemon/server.js';
import { generateKeyPair, sign, verify } from '../src/shared/signing.js';

/**
 * F-12: GET /.well-known/ogp returns `peerStatus` only if the requester
 * supplies a signed (peerId, timestamp) header set whose signature verifies
 * against the requester's stored publicKey. The previous version trusted the
 * unsigned X-OGP-Peer-ID header, exposing per-peer health to anyone who
 * supplied a known peerId.
 */
describe('verifySignedPeerIdHeader (F-12)', () => {
  function buildSignedHeaders(peerId: string, privateKey: string, timestamp: string) {
    const message = JSON.stringify({ peerId, timestamp });
    const signature = sign(message, privateKey);
    return { peerId, timestamp, signature };
  }

  it('accepts a fresh signed header for the matching publicKey', () => {
    const kp = generateKeyPair();
    const ts = new Date().toISOString();
    const headers = buildSignedHeaders('alice-peer-id', kp.privateKey, ts);
    expect(verifySignedPeerIdHeader(headers, kp.publicKey, verify)).toBe(true);
  });

  it('rejects a header signed by the wrong key', () => {
    const aliceKp = generateKeyPair();
    const attackerKp = generateKeyPair();
    const ts = new Date().toISOString();
    const headers = buildSignedHeaders('alice-peer-id', attackerKp.privateKey, ts);
    expect(verifySignedPeerIdHeader(headers, aliceKp.publicKey, verify)).toBe(false);
  });

  it('rejects a stale timestamp (beyond maxAgeMs)', () => {
    const kp = generateKeyPair();
    const stale = '2026-04-27T10:00:00.000Z';
    const headers = buildSignedHeaders('alice', kp.privateKey, stale);
    const now = new Date('2026-04-27T12:00:00.000Z').getTime();
    expect(verifySignedPeerIdHeader(headers, kp.publicKey, verify, { now })).toBe(false);
  });

  it('rejects a future timestamp beyond maxAgeMs (clock skew protection)', () => {
    const kp = generateKeyPair();
    const future = '2026-04-27T14:00:00.000Z';
    const headers = buildSignedHeaders('alice', kp.privateKey, future);
    const now = new Date('2026-04-27T12:00:00.000Z').getTime();
    expect(verifySignedPeerIdHeader(headers, kp.publicKey, verify, { now })).toBe(false);
  });

  it('rejects a malformed timestamp', () => {
    const kp = generateKeyPair();
    const headers = {
      peerId: 'alice',
      timestamp: 'not-a-date',
      signature: 'deadbeef'
    };
    expect(verifySignedPeerIdHeader(headers, kp.publicKey, verify)).toBe(false);
  });

  it('rejects when peerId is empty', () => {
    const kp = generateKeyPair();
    const ts = new Date().toISOString();
    const headers = buildSignedHeaders('', kp.privateKey, ts);
    expect(verifySignedPeerIdHeader(headers, kp.publicKey, verify)).toBe(false);
  });

  it('rejects when signature is empty', () => {
    expect(
      verifySignedPeerIdHeader(
        { peerId: 'alice', timestamp: new Date().toISOString(), signature: '' },
        'pubkey',
        verify
      )
    ).toBe(false);
  });

  it('rejects when publicKey is empty', () => {
    const kp = generateKeyPair();
    const ts = new Date().toISOString();
    const headers = buildSignedHeaders('alice', kp.privateKey, ts);
    expect(verifySignedPeerIdHeader(headers, '', verify)).toBe(false);
  });

  it('rejects a tampered peerId (signature was for a different id)', () => {
    const kp = generateKeyPair();
    const ts = new Date().toISOString();
    // Sign for "alice" but claim to be "bob"
    const original = buildSignedHeaders('alice', kp.privateKey, ts);
    const tampered = { ...original, peerId: 'bob' };
    expect(verifySignedPeerIdHeader(tampered, kp.publicKey, verify)).toBe(false);
  });
});
