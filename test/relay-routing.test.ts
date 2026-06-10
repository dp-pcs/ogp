import { describe, expect, it } from 'vitest';
import { RelayCore, type RelayWS, type RelayCoreDeps } from '../packages/relay-dev/src/relay-core.js';

function fakeSocket(id: number): RelayWS & { sent: any[]; closed: boolean } {
  const sent: any[] = [];
  return {
    id, sent, closed: false,
    send(data: string) { sent.push(JSON.parse(data)); },
    close() { (this as any).closed = true; },
  };
}

// Auth bypass for routing tests: stub verify to always pass, then drive the real
// onConnection/onMessage('auth') path so routing state is populated authentically.
function makeCore(): RelayCore {
  const deps: RelayCoreDeps = {
    verifyCanonical: () => ({ ok: true }),
    now: () => 1_000_000,
    randomId: () => 'chal',
    randomNonce: () => 'nonce',
  };
  return new RelayCore(deps);
}

function authAs(core: RelayCore, sock: RelayWS & { sent: any[] }, pubkey: string, role: 'receiver' | 'sender' = 'receiver') {
  core.onConnection(sock);
  const challenge = sock.sent.find((f) => f.type === 'challenge');
  const payloadStr = JSON.stringify({ pubkey, challengeId: challenge.challengeId, nonce: challenge.nonce, role });
  core.onMessage(sock, JSON.stringify({ type: 'auth', pubkey, challengeId: challenge.challengeId, payloadStr, signature: 'x' }));
}

describe('RelayCore routing', () => {
  it('routes a deliver to the destination receiver socket', () => {
    const core = makeCore();
    const a = fakeSocket(1); const b = fakeSocket(2);
    authAs(core, a, 'pkA'); authAs(core, b, 'pkB');

    core.onMessage(a, JSON.stringify({ type: 'deliver', reqId: 'r1', to: 'pkB', frame: { messageStr: 'm', signature: 's' } }));

    const fwd = b.sent.find((f) => f.type === 'deliver');
    expect(fwd).toBeTruthy();
    expect(fwd.reqId).toBe('r1');
    expect(fwd.from).toBe('pkA');
    expect(fwd.frame).toEqual({ messageStr: 'm', signature: 's' });
  });

  it('errors peer-not-connected when destination has no socket', () => {
    const core = makeCore();
    const a = fakeSocket(1);
    authAs(core, a, 'pkA');

    core.onMessage(a, JSON.stringify({ type: 'deliver', reqId: 'r2', to: 'pkGHOST', frame: { messageStr: 'm', signature: 's' } }));

    const err = a.sent.find((f) => f.type === 'error');
    expect(err.code).toBe('peer-not-connected');
    expect(err.reqId).toBe('r2');
  });

  it('routes the response back to the original sender by reqId', () => {
    const core = makeCore();
    const a = fakeSocket(1); const b = fakeSocket(2);
    authAs(core, a, 'pkA'); authAs(core, b, 'pkB');

    core.onMessage(a, JSON.stringify({ type: 'deliver', reqId: 'r3', to: 'pkB', frame: { messageStr: 'm', signature: 's' } }));
    core.onMessage(b, JSON.stringify({ type: 'response', reqId: 'r3', result: { success: true, nonce: 'n' } }));

    const resp = a.sent.find((f) => f.type === 'response');
    expect(resp.reqId).toBe('r3');
    expect(resp.result).toEqual({ success: true, nonce: 'n' });
  });

  it('rejects deliver from an unauthenticated socket', () => {
    const core = makeCore();
    const a = fakeSocket(1);
    core.onConnection(a); // no auth
    core.onMessage(a, JSON.stringify({ type: 'deliver', reqId: 'r4', to: 'pkB', frame: { messageStr: 'm', signature: 's' } }));

    const err = a.sent.find((f) => f.type === 'error');
    expect(err.code).toBe('unauthorized');
  });

  it('removes a receiver from routing on socket close', () => {
    const core = makeCore();
    const b = fakeSocket(2);
    authAs(core, b, 'pkB');
    expect(core.routing.get('pkB')).toBe(b);

    core.onClose(b);
    expect(core.routing.has('pkB')).toBe(false);
  });

  it('last-writer-wins: a new receiver socket for the same pubkey replaces and closes the old one', () => {
    const core = makeCore();
    const b1 = fakeSocket(2); const b2 = fakeSocket(3);
    authAs(core, b1, 'pkB');
    authAs(core, b2, 'pkB');

    expect(core.routing.get('pkB')).toBe(b2);
    expect(b1.closed).toBe(true);
  });

  it('rejects oversized frames', () => {
    const core = makeCore();
    const a = fakeSocket(1);
    authAs(core, a, 'pkA');
    const huge = 'x'.repeat(256 * 1024 + 1);
    core.onMessage(a, huge);
    expect(a.sent.some((f) => f.type === 'error' && f.code === 'payload-too-large')).toBe(true);
  });
});
