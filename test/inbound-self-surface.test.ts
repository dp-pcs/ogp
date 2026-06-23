// test/inbound-self-surface.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// We test the note-text shaping logic. The function we'll add is:
//   injectInboundSyncNote(
//     displayName: string,
//     topic: string,
//     messageText: string,
//     level: 'full' | 'summary' | 'escalate',
//     injectFn: (sessionKey: string, text: string) => Promise<boolean>,
//     sessionKey: string
//   ): Promise<void>
//
// It calls injectFn once with shaped text, never throws.

// We import by path so we can test before implementation exists.
// This will fail until message-handler.ts exports the function.
import { injectInboundSyncNote } from '../src/daemon/message-handler.js';

describe('injectInboundSyncNote', () => {
  let injected: { key: string; text: string }[];
  let injectFn: (key: string, text: string) => Promise<boolean>;

  beforeEach(() => {
    injected = [];
    injectFn = async (key, text) => { injected.push({ key, text }); return true; };
  });

  it('injects a full note when level is full', async () => {
    await injectInboundSyncNote('Cosmo', 'testing', 'loud and clear', 'full', injectFn, 'agent:main');
    expect(injected).toHaveLength(1);
    expect(injected[0].key).toBe('agent:main');
    expect(injected[0].text).toContain('[OGP Inbound]');
    expect(injected[0].text).toContain('Cosmo');
    expect(injected[0].text).toContain('testing');
    expect(injected[0].text).toContain('loud and clear');
  });

  it('injects a preview note when level is summary', async () => {
    const longMsg = 'a'.repeat(200);
    await injectInboundSyncNote('Cosmo', 'general', longMsg, 'summary', injectFn, 'agent:main');
    expect(injected).toHaveLength(1);
    expect(injected[0].text).toContain('[OGP Inbound]');
    // Summary truncates to 80 chars + ellipsis
    expect(injected[0].text).toContain('…');
    expect(injected[0].text).not.toContain(longMsg);
  });

  it('injects even when level is escalate (treat like summary)', async () => {
    await injectInboundSyncNote('Cosmo', 'alerts', 'urgent thing', 'escalate', injectFn, 'agent:main');
    expect(injected).toHaveLength(1);
    expect(injected[0].text).toContain('[OGP Inbound]');
    expect(injected[0].text).toContain('urgent thing');
  });

  it('does not throw when injectFn returns false', async () => {
    const failFn = async () => false;
    await expect(
      injectInboundSyncNote('Cosmo', 'testing', 'msg', 'full', failFn, 'agent:main')
    ).resolves.not.toThrow();
  });

  it('does not throw when injectFn throws', async () => {
    const throwFn = async () => { throw new Error('bridge down'); };
    await expect(
      injectInboundSyncNote('Cosmo', 'testing', 'msg', 'full', throwFn, 'agent:main')
    ).resolves.not.toThrow();
  });
});
