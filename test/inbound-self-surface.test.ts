// test/inbound-self-surface.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

describe('daemon startup merges on-disk config rather than overwriting it', () => {
  let tmpDir: string;
  let originalOgpHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-test-'));
    originalOgpHome = process.env.OGP_HOME;
  });

  afterEach(() => {
    if (originalOgpHome !== undefined) {
      process.env.OGP_HOME = originalOgpHome;
    } else {
      delete process.env.OGP_HOME;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('daemon startup merges on-disk config rather than overwriting it', async () => {
    // Write a config where agentComms only has activityLog set to false
    // (simulating a user who ran `ogp agent-comms logging off`). The default
    // for activityLog in DEFAULT_AGENT_COMMS_CONFIG is true, so if the loader
    // clobbers with defaults the value resets to true — the bug bd-r369.
    const config = {
      agentId: 'test-agent',
      agentComms: { activityLog: false }  // partial — no globalPolicy / defaultLevel
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    process.env.OGP_HOME = tmpDir;

    // Dynamic import bypasses module-level caching of the config path.
    const { loadAgentCommsConfig } = await import('../src/daemon/agent-comms.js');
    const result = loadAgentCommsConfig();

    // On-disk activityLog: false must survive — not be clobbered by the default true.
    expect(result.activityLog).toBe(false);
    // Defaults fill in missing fields so the object is always complete.
    expect(result.defaultLevel).toBe('off');
    expect(result.globalPolicy).toBeDefined();
  });
});

describe('logging status reads config from the correct framework', () => {
  let tmpDir: string;
  let originalOgpHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-test-'));
    originalOgpHome = process.env.OGP_HOME;
  });

  afterEach(() => {
    if (originalOgpHome !== undefined) {
      process.env.OGP_HOME = originalOgpHome;
    } else {
      delete process.env.OGP_HOME;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logging status reads config from the correct framework', async () => {
    // Write a framework config with activityLog: true into a temp dir
    const config = {
      agentId: 'test-agent',
      agentComms: { globalPolicy: {}, defaultLevel: 'off', activityLog: true }
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));

    // Point OGP_HOME at the temp dir (simulating --for resolving to this framework)
    process.env.OGP_HOME = tmpDir;

    // Import loadAgentCommsConfig after OGP_HOME is set — use dynamic import to
    // bypass module-level caching of the config path.
    const { loadAgentCommsConfig } = await import('../src/daemon/agent-comms.js');
    const result = loadAgentCommsConfig();

    expect(result.activityLog).toBe(true);
  });
});
