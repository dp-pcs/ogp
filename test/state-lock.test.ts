import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireStateDirLock,
  StateDirLockedError
} from '../src/daemon/state-lock.js';

describe('stateDir daemon lock (bd-ffl)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-statelock-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('acquires a lock and writes the owning PID into daemon.lock', () => {
    const handle = acquireStateDirLock(tmp, { ownPid: 4242, isPidAlive: () => true });
    const lockPath = path.join(tmp, 'daemon.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(fs.readFileSync(lockPath, 'utf-8').trim()).toBe('4242');
    handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('refuses a second instance when the holder PID is alive', () => {
    acquireStateDirLock(tmp, { ownPid: 1111, isPidAlive: () => true });
    expect(() =>
      acquireStateDirLock(tmp, { ownPid: 2222, isPidAlive: () => true })
    ).toThrow(StateDirLockedError);
  });

  it('exposes the live holder PID on the error (for a clear refusal message)', () => {
    acquireStateDirLock(tmp, { ownPid: 1206, isPidAlive: () => true });
    try {
      acquireStateDirLock(tmp, { ownPid: 9999, isPidAlive: () => true });
      throw new Error('expected StateDirLockedError');
    } catch (err) {
      expect(err).toBeInstanceOf(StateDirLockedError);
      expect((err as StateDirLockedError).holderPid).toBe(1206);
      expect((err as StateDirLockedError).message).toContain('1206');
    }
  });

  it('reclaims a STALE lock when the holder PID is dead (the port-guard-miss case)', () => {
    // Simulate a crashed/killed prior daemon: lockfile exists, holder dead.
    fs.writeFileSync(path.join(tmp, 'daemon.lock'), '17668', 'utf-8');
    const handle = acquireStateDirLock(tmp, {
      ownPid: 5555,
      isPidAlive: (pid) => pid === 5555 // 17668 (the rogue dup) is dead
    });
    expect(fs.readFileSync(path.join(tmp, 'daemon.lock'), 'utf-8').trim()).toBe('5555');
    handle.release();
  });

  it('reclaims a garbage / non-numeric lockfile', () => {
    fs.writeFileSync(path.join(tmp, 'daemon.lock'), 'not-a-pid', 'utf-8');
    const handle = acquireStateDirLock(tmp, { ownPid: 7777, isPidAlive: () => true });
    expect(fs.readFileSync(path.join(tmp, 'daemon.lock'), 'utf-8').trim()).toBe('7777');
    handle.release();
  });

  it('release() does not clobber a successor that re-acquired the lock', () => {
    const first = acquireStateDirLock(tmp, { ownPid: 100, isPidAlive: (p) => p === 200 });
    // first's holder (100) is now "dead"; a successor reclaims it.
    const second = acquireStateDirLock(tmp, { ownPid: 200, isPidAlive: (p) => p === 200 });
    // Late release from the first owner must NOT delete the successor's lock.
    first.release();
    expect(fs.existsSync(path.join(tmp, 'daemon.lock'))).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'daemon.lock'), 'utf-8').trim()).toBe('200');
    second.release();
    expect(fs.existsSync(path.join(tmp, 'daemon.lock'))).toBe(false);
  });

  it('is idempotent on double release', () => {
    const handle = acquireStateDirLock(tmp, { ownPid: 321, isPidAlive: () => true });
    handle.release();
    expect(() => handle.release()).not.toThrow();
  });
});
