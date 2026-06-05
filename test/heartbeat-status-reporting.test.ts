import { describe, expect, it } from 'vitest';
import { getHeartbeatConfig, stopHeartbeat } from '../src/daemon/heartbeat.js';

/**
 * Regression guard for bd-d1l: `ogp status` reported "Heartbeat status: Stopped"
 * while the daemon's heartbeat loop was demonstrably running.
 *
 * Root cause: `getHeartbeatConfig().isRunning` is derived from a module-level
 * `heartbeatTimer` that only exists inside the long-lived daemon process. The
 * `ogp status` / `ogp config show` commands run in a SEPARATE, short-lived CLI
 * process where `startHeartbeat()` is never called, so `isRunning` is always
 * false there — regardless of the real daemon state.
 *
 * Fix: the CLI must report heartbeat run-state from the authoritative
 * cross-process signal (the daemon being up), NOT from this process-local flag.
 * This test pins the invariant so nobody re-wires a status reporter to the
 * in-process timer again.
 */
describe('getHeartbeatConfig().isRunning is process-local (bd-d1l)', () => {
  it('is false in a fresh process where startHeartbeat() was never called', () => {
    // Ensure no timer is set from any prior test in this file.
    stopHeartbeat();
    const cfg = getHeartbeatConfig();
    // This is exactly the value the CLI process would see — proving it cannot be
    // used as the daemon's heartbeat run-state.
    expect(cfg.isRunning).toBe(false);
  });

  it('still exposes the configuration fields the CLI legitimately displays', () => {
    const cfg = getHeartbeatConfig();
    expect(typeof cfg.intervalMs).toBe('number');
    expect(typeof cfg.timeoutMs).toBe('number');
    expect(typeof cfg.maxConsecutiveFailures).toBe('number');
  });
});
