import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { logActivity, readActivityJsonl } from '../src/daemon/agent-comms.js';

describe('activity JSONL store', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-activity-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists a full (untruncated) entry to activity.jsonl', () => {
    const longMsg = 'x'.repeat(250); // exceeds the 100-char text-log preview cap
    logActivity({
      direction: 'in',
      peerId: 'atlas',
      peerName: 'Atlas',
      topic: 'status-update',
      message: longMsg,
      level: 'summary',
    });

    const entries = readActivityJsonl();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe(longMsg); // not truncated in the structured store
    expect(entries[0].peerId).toBe('atlas');
    expect(entries[0].topic).toBe('status-update');
    expect(entries[0].level).toBe('summary');
    expect(entries[0].direction).toBe('in');
    expect(typeof entries[0].timestamp).toBe('string');
  });

  it('filters by peer (peerId or peerName) and limits to last N', () => {
    logActivity({ direction: 'in', peerId: 'atlas', peerName: 'Atlas', topic: 't', message: 'a' });
    logActivity({ direction: 'in', peerId: 'nova', peerName: 'Nova', topic: 't', message: 'b' });
    logActivity({ direction: 'out', peerId: 'atlas', peerName: 'Atlas', topic: 't', message: 'c' });

    expect(readActivityJsonl({ peerId: 'atlas' })).toHaveLength(2);
    expect(readActivityJsonl({ peerId: 'Nova' })).toHaveLength(1); // by display name
    expect(readActivityJsonl({ last: 1 })[0].message).toBe('c'); // newest kept
  });

  it('returns [] when no store exists', () => {
    expect(readActivityJsonl()).toEqual([]);
  });

  it('tolerates a malformed line without throwing', () => {
    logActivity({ direction: 'in', peerId: 'atlas', peerName: 'Atlas', topic: 't', message: 'ok' });
    // Corrupt the store with a partial line (e.g. interrupted append)
    fs.appendFileSync(path.join(dir, 'activity.jsonl'), '{"timestamp":"broken"\n', 'utf-8');

    const entries = readActivityJsonl();
    expect(entries).toHaveLength(1); // the valid entry survives; bad line skipped
    expect(entries[0].message).toBe('ok');
  });
});
