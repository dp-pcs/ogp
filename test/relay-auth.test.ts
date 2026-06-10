import { describe, expect, it } from 'vitest';
import { generateKeyPair, signCanonical, verifyCanonical } from '../src/shared/signing.js';
import { RelayCore, type RelayWS, type RelayCoreDeps } from '../packages/relay-dev/src/relay-core.js';

// Fake socket capturing sent frames.
function fakeSocket(id: number): RelayWS & { sent: any[]; closed: boolean } {
  const sent: any[] = [];
  return {
    id,
    sent,
    closed: false,
    send(data: string) { sent.push(JSON.parse(data)); },
    close() { (this as any).closed = true; },
  };
}

function makeCore(now = () => 1_000_000): { core: RelayCore; deps: RelayCoreDeps } {
  let nonceN = 0;
  let idN = 0;
  const deps: RelayCoreDeps = {
    verifyCanonical,
    now,
    randomId: () => `chal-${++idN}`,
    randomNonce: () => `nonce-${++nonceN}`.padEnd(64, '0'),
  };
  return { core: new RelayCore(deps), deps };
}

/** Drive onConnection → grab challenge → return a correctly-signed auth frame. */
function signedAuth(
  core: RelayCore, sock: RelayWS & { sent: any[] },
  kp: { publicKey: string; privateKey: string },
  role: 'receiver' | 'sender' = 'receiver',
  tsNow?: number,
) {
  core.onConnection(sock);
  const challenge = sock.sent.find((f) => f.type === 'challenge');
  const { payloadStr, signature } = signCanonical(
    { pubkey: kp.publicKey, challengeId: challenge.challengeId, nonce: challenge.nonce, role },
    kp.privateKey,
    tsNow ? { timestamp: new Date(tsNow).toISOString() } : {},
  );
  return { type: 'auth', pubkey: kp.publicKey, challengeId: challenge.challengeId, payloadStr, signature };
}

describe('RelayCore auth handshake', () => {
  it('accepts a correctly signed challenge response and registers a receiver', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    const auth = signedAuth(core, sock, kp, 'receiver');
    core.onMessage(sock, JSON.stringify(auth));

    expect(sock.sent.some((f) => f.type === 'auth-ok' && f.pubkey === kp.publicKey)).toBe(true);
    expect(core.routing.get(kp.publicKey)).toBe(sock);
  });

  it('does NOT register a sender-role socket in the routing table', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    core.onMessage(sock, JSON.stringify(signedAuth(core, sock, kp, 'sender')));

    expect(sock.sent.some((f) => f.type === 'auth-ok')).toBe(true);
    expect(core.routing.has(kp.publicKey)).toBe(false);
  });

  it('rejects a wrong nonce (replayed signature against a fresh challenge)', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    core.onConnection(sock);
    const challenge = sock.sent.find((f) => f.type === 'challenge');
    // Sign with a DIFFERENT nonce than the server issued.
    const { payloadStr, signature } = signCanonical(
      { pubkey: kp.publicKey, challengeId: challenge.challengeId, nonce: 'attacker-nonce', role: 'receiver' },
      kp.privateKey,
    );
    core.onMessage(sock, JSON.stringify({ type: 'auth', pubkey: kp.publicKey, challengeId: challenge.challengeId, payloadStr, signature }));

    expect(sock.sent.some((f) => f.type === 'auth-err' && f.reason === 'challenge-mismatch')).toBe(true);
    expect(core.routing.size).toBe(0);
  });

  it('rejects an unknown / expired challengeId', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    core.onConnection(sock); // issues chal-1
    const { payloadStr, signature } = signCanonical(
      { pubkey: kp.publicKey, challengeId: 'chal-DOES-NOT-EXIST', nonce: 'x', role: 'receiver' },
      kp.privateKey,
    );
    core.onMessage(sock, JSON.stringify({ type: 'auth', pubkey: kp.publicKey, challengeId: 'chal-DOES-NOT-EXIST', payloadStr, signature }));

    expect(sock.sent.some((f) => f.type === 'auth-err' && f.reason === 'challenge-expired')).toBe(true);
  });

  it('rejects a stale timestamp (outside the 5-min window)', () => {
    const now = 10_000_000;
    const { core } = makeCore(() => now);
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    // Sign with a timestamp 10 minutes in the past.
    const auth = signedAuth(core, sock, kp, 'receiver', now - 10 * 60 * 1000);
    core.onMessage(sock, JSON.stringify(auth));

    expect(sock.sent.some((f) => f.type === 'auth-err' && f.reason === 'stale-timestamp')).toBe(true);
    expect(core.routing.size).toBe(0);
  });

  it('rejects when the auth pubkey disagrees with the signed payload pubkey', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const other = generateKeyPair();
    const sock = fakeSocket(1);
    const auth = signedAuth(core, sock, kp, 'receiver');
    // Attacker swaps the OUTER pubkey to someone else's.
    core.onMessage(sock, JSON.stringify({ ...auth, pubkey: other.publicKey }));

    expect(sock.sent.some((f) => f.type === 'auth-err')).toBe(true);
    expect(core.routing.size).toBe(0);
  });

  it('rejects a tampered payloadStr (signature no longer matches)', () => {
    const { core } = makeCore();
    const kp = generateKeyPair();
    const sock = fakeSocket(1);
    const auth = signedAuth(core, sock, kp, 'receiver');
    const tampered = { ...auth, payloadStr: auth.payloadStr.replace('receiver', 'sender') };
    core.onMessage(sock, JSON.stringify(tampered));

    // mismatch is caught either as challenge-mismatch (role differs) or bad-signature
    expect(sock.sent.some((f) => f.type === 'auth-err')).toBe(true);
    expect(core.routing.size).toBe(0);
  });
});
