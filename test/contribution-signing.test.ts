import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import {
  buildSignedContribution,
  verifySignedContribution
} from '../src/daemon/contribution-signing.js';

describe('contribution-signing', () => {
  const author = generateKeyPair();
  const base = {
    projectId: 'aicoe-expert-network',
    authorId: author.publicKey,
    entryType: 'tool-preference',
    summary: 'Use Opus 4.8 for planning',
    metadata: { tool: 'claude' }
  };

  it('builds a record + wire envelope that verifies', () => {
    const { record, wire } = buildSignedContribution(base, author.privateKey);

    expect(record.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(record.verified).toBe(true);
    expect(record.signature).toBe(wire.signature);
    expect(wire.payloadStr).toContain('"projectId":"aicoe-expert-network"');

    const res = verifySignedContribution(wire);
    expect(res.ok).toBe(true);
    expect(res.record?.summary).toBe('Use Opus 4.8 for planning');
    expect(res.record?.verified).toBe(true);
  });

  it('rejects a tampered summary', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const parsed = JSON.parse(wire.payloadStr);
    parsed.summary = 'malicious';
    const tampered = { ...wire, payloadStr: JSON.stringify(parsed) };
    expect(verifySignedContribution(tampered).ok).toBe(false);
  });

  it('rejects when authorId in payload does not own the signature', () => {
    const other = generateKeyPair();
    const { wire } = buildSignedContribution(base, other.privateKey); // signed by other
    const forged = { ...wire, authorId: base.authorId };
    expect(verifySignedContribution(forged).ok).toBe(false);
  });

  it('enforces expectedSenderId when provided (live-contribution path)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    expect(verifySignedContribution(wire, author.publicKey).ok).toBe(true);
    expect(verifySignedContribution(wire, 'someone-else').ok).toBe(false);
    expect(verifySignedContribution(wire, 'someone-else').reason).toBe('sender-mismatch');
  });

  it('rejects tampered metadata', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const parsed = JSON.parse(wire.payloadStr);
    parsed.metadata = { tool: 'evil' };
    const tampered = { ...wire, payloadStr: JSON.stringify(parsed) };
    expect(verifySignedContribution(tampered).ok).toBe(false);
  });

  it('fails closed on malformed input', () => {
    expect(verifySignedContribution(null).ok).toBe(false);
    expect(verifySignedContribution(null).reason).toBe('missing-contribution');
    expect(verifySignedContribution(undefined).ok).toBe(false);

    const { wire } = buildSignedContribution(base, author.privateKey);
    expect(verifySignedContribution({ ...wire, payloadStr: '' }).reason).toBe('missing-signed-fields');
    expect(verifySignedContribution({ ...wire, signature: '' }).reason).toBe('missing-signed-fields');
    expect(verifySignedContribution({ ...wire, payloadStr: 'not json' }).reason).toBe('bad-payload');
  });

  it('relay path (no expectedSenderId) accepts a valid author signature; strict path with wrong sender rejects', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    expect(verifySignedContribution(wire).ok).toBe(true);                       // relay: no sender binding
    expect(verifySignedContribution(wire, author.publicKey).ok).toBe(true);     // strict: correct sender
    expect(verifySignedContribution(wire, 'wrong-key').reason).toBe('sender-mismatch'); // strict: wrong sender
  });

  it('rejects a forged payloadStr (mutated signed bytes)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const forged = { ...wire, payloadStr: wire.payloadStr.replace('hello', 'HELLO') };
    // 'hello' may not appear; mutate a stable character instead if so:
    const reallyForged = forged.payloadStr === wire.payloadStr
      ? { ...wire, payloadStr: wire.payloadStr.slice(0, -2) + (wire.payloadStr.slice(-2, -1) === 'a' ? 'b' : 'a') + wire.payloadStr.slice(-1) }
      : forged;
    expect(verifySignedContribution(reallyForged).ok).toBe(false);
  });

  it('rejects a contribution signed for a different project (project-mismatch)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey); // base.projectId === 'aicoe-expert-network'
    expect(verifySignedContribution(wire, undefined, 'aicoe-expert-network').ok).toBe(true);
    const res = verifySignedContribution(wire, undefined, 'some-other-project');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('project-mismatch');
  });

  it('accepts when expectedSenderId is the 32-char canonical prefix of the author key (real wire path)', () => {
    // federationSend sends message.from = keypair.publicKey.substring(0, 32);
    // the receiver passes that as expectedSenderId. The signed authorId is the full key.
    const { wire } = buildSignedContribution(base, author.privateKey);
    const wireSenderId = author.publicKey.substring(0, 32); // what transport actually presents
    const res = verifySignedContribution(wire, wireSenderId);
    expect(res.ok).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('still rejects a genuine cross-peer relay (different author vs sender)', () => {
    const other = generateKeyPair();
    const { wire } = buildSignedContribution(base, author.privateKey); // signed by author
    const otherSenderId = other.publicKey.substring(0, 32);            // transport says someone else
    const res = verifySignedContribution(wire, otherSenderId);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('sender-mismatch');
  });

  it('still accepts when expectedSenderId is the full author key (local self path)', () => {
    const { wire } = buildSignedContribution(base, author.privateKey);
    const res = verifySignedContribution(wire, author.publicKey); // full key, not prefix
    expect(res.ok).toBe(true);
  });
});
