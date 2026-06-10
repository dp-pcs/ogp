import { describe, expect, it } from 'vitest';
import {
  parseFrame,
  isChallengeFrame,
  isAuthFrame,
  isDeliverFrame,
  isResponseFrame,
  MAX_FRAME_BYTES,
  HEARTBEAT_MS,
} from '../src/shared/relay-protocol.js';

describe('relay-protocol frame parsing/guards', () => {
  it('parses a well-formed frame', () => {
    const f = parseFrame('{"type":"ping"}');
    expect(f).toEqual({ type: 'ping' });
  });

  it('returns null for non-JSON', () => {
    expect(parseFrame('not json')).toBeNull();
  });

  it('returns null for JSON without a string type', () => {
    expect(parseFrame('{"foo":1}')).toBeNull();
    expect(parseFrame('123')).toBeNull();
    expect(parseFrame('{"type":42}')).toBeNull();
  });

  it('isChallengeFrame requires challengeId + nonce', () => {
    expect(isChallengeFrame({ type: 'challenge', challengeId: 'a', nonce: 'b', serverTime: 't' } as never)).toBe(true);
    expect(isChallengeFrame({ type: 'challenge' } as never)).toBe(false);
  });

  it('isAuthFrame requires pubkey/challengeId/payloadStr/signature', () => {
    expect(isAuthFrame({ type: 'auth', pubkey: 'p', challengeId: 'c', payloadStr: '{}', signature: 's' } as never)).toBe(true);
    expect(isAuthFrame({ type: 'auth', pubkey: 'p' } as never)).toBe(false);
  });

  it('isDeliverFrame requires reqId + frame with messageStr/signature', () => {
    expect(isDeliverFrame({ type: 'deliver', reqId: 'r', frame: { messageStr: 'm', signature: 's' } } as never)).toBe(true);
    expect(isDeliverFrame({ type: 'deliver', reqId: 'r' } as never)).toBe(false);
  });

  it('isResponseFrame requires reqId', () => {
    expect(isResponseFrame({ type: 'response', reqId: 'r', result: {} } as never)).toBe(true);
    expect(isResponseFrame({ type: 'response' } as never)).toBe(false);
  });

  it('exposes sane protocol constants', () => {
    expect(MAX_FRAME_BYTES).toBe(256 * 1024);
    expect(HEARTBEAT_MS).toBeLessThan(60_000); // must stay under ALB 60s idle
  });
});
