import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * bd-ffl regression (c): a second `ogp start` must REFUSE to come up while a
 * live incumbent holds the stateDir lock — it must exit non-zero and must NOT
 * overwrite the incumbent's daemon.lock or fall back to a second port.
 *
 * This is the end-to-end guard for the TOCTOU bug fixed in server.ts: the old
 * background path did `acquireStateDirLock(stateDir).release()` in the parent
 * (unlinking the lockfile) and then forked a child that re-acquired it. A
 * concurrent start could slip into that window, letting a newcomer grab the
 * lock+port while a live incumbent got orphaned onto the EADDRINUSE fallback
 * port. Observed live 3× (2026-05-31, 06-03, 06-09).
 *
 * We simulate the live incumbent by writing a daemon.lock whose PID is the test
 * process itself (guaranteed alive) — no real port/network daemon required —
 * and drive the REAL built CLI so the actual startServer background path runs.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'dist', 'cli.js');

const hasBuiltCli = fs.existsSync(CLI);
const describeIfBuilt = hasBuiltCli ? describe : describe.skip;

describeIfBuilt('ogp start refuses a second daemon on a live stateDir lock (bd-ffl)', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-start-refusal-'));
    // Minimal config so requireConfig() doesn't bail before the lock check.
    const config = {
      daemonPort: 0, // never actually bound in this test path; refusal happens first
      openclawUrl: 'http://localhost:18789',
      openclawToken: 'test-token',
      gatewayUrl: 'http://localhost',
      displayName: 'Test Incumbent',
      email: 'test@example.com',
      stateDir: home,
      platform: 'standalone'
    };
    fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
    // Simulate a LIVE incumbent holding the lock: use this test process's PID,
    // which is guaranteed alive for the duration of the spawn.
    fs.writeFileSync(path.join(home, 'daemon.lock'), String(process.pid), 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('exits non-zero and leaves the incumbent lock untouched', () => {
    const res = spawnSync(process.execPath, [CLI, 'start', '--background'], {
      env: { ...process.env, OGP_HOME: home },
      encoding: 'utf-8',
      timeout: 20000
    });

    // 1) The newcomer must exit non-zero (refused), not succeed.
    expect(res.status).not.toBe(0);

    // 2) The incumbent's lockfile must be UNCHANGED (not overwritten/reclaimed).
    const lockAfter = fs.readFileSync(path.join(home, 'daemon.lock'), 'utf-8').trim();
    expect(lockAfter).toBe(String(process.pid));

    // 3) The refusal should be visible to the user (mentions the live holder).
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(out).toMatch(/already running|Refusing to start|PID/i);

    // 4) No pidfile should have been written for a successful background child.
    expect(fs.existsSync(path.join(home, 'daemon.pid'))).toBe(false);
  });
});
