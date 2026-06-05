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
});
