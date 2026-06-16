import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadReplayCache,
  getReplayResult,
  recordReplayResult,
  pruneReplayCache,
  clearReplayCache,
} from '../src/daemon/replay-dedup.js';

describe('replay-dedup', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-replay-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for unknown nonce', () => {
    expect(getReplayResult('unknown')).toBeNull();
  });

  it('records and returns a replay result', () => {
    recordReplayResult('n1', { success: true, response: { ok: true } });
    const cached = getReplayResult('n1');
    expect(cached).not.toBeNull();
    expect(cached?.success).toBe(true);
    expect(cached?.response).toEqual({ ok: true });
  });

  it('prunes expired entries', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const cache = loadReplayCache();
    cache.entries.push({ nonce: 'old', processedAt: old, success: true });
    cache.entries.push({ nonce: 'new', processedAt: new Date().toISOString(), success: true });
    saveReplayCache(cache, dir);
    const pruned = pruneReplayCache();
    expect(pruned.entries.map((e) => e.nonce)).toEqual(['new']);
  });

  it('prunes to max entries, keeping newest', () => {
    const cache = loadReplayCache();
    for (let i = 0; i < 5; i++) {
      cache.entries.push({
        nonce: `n${i}`,
        processedAt: new Date(Date.now() - i * 1000).toISOString(),
        success: true,
      });
    }
    saveReplayCache(cache, dir);
    const pruned = pruneReplayCache({ maxAgeDays: 7, maxEntries: 3 });
    expect(pruned.entries.map((e) => e.nonce)).toEqual(['n0', 'n1', 'n2']);
  });

  it('clears the cache', () => {
    recordReplayResult('n1', { success: true });
    clearReplayCache();
    expect(getReplayResult('n1')).toBeNull();
  });
});

function saveReplayCache(cache: ReturnType<typeof loadReplayCache>, baseDir: string) {
  fs.writeFileSync(path.join(baseDir, 'replay.json'), JSON.stringify(cache, null, 2));
}
