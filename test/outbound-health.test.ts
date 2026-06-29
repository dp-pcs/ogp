import { describe, expect, it, vi } from 'vitest';
import { OutboundHealthWatchdog } from '../src/daemon/outbound-health.js';

describe('OutboundHealthWatchdog (bd-kclo)', () => {
  it('(a) flips outboundHealthy=false after N cross-host failures and (b) invokes the recovery hook on trip', () => {
    const recovery = vi.fn();
    let clock = 1_000;
    const w = new OutboundHealthWatchdog({
      failureThreshold: 5,
      minDistinctHosts: 2,
      recovery,
      now: () => clock
    });

    expect(w.isHealthy()).toBe(true);

    // 5 consecutive failures spanning 2 distinct hosts (rendezvous + ipify).
    expect(w.recordFailure('rendezvous.example.com')).toBe(false);
    expect(w.recordFailure('rendezvous.example.com')).toBe(false);
    expect(w.recordFailure('api.ipify.org')).toBe(false);
    expect(w.recordFailure('rendezvous.example.com')).toBe(false);
    expect(w.isHealthy()).toBe(true);
    expect(recovery).not.toHaveBeenCalled();

    // 5th consecutive failure (still >= 2 distinct hosts) trips the watchdog.
    expect(w.recordFailure('api.ipify.org')).toBe(true);
    expect(w.isHealthy()).toBe(false);
    expect(recovery).toHaveBeenCalledTimes(1);

    const snap = w.snapshot();
    expect(snap.outboundHealthy).toBe(false);
    expect(snap.tripCount).toBe(1);
    expect(snap.lastTripAt).toBe(new Date(1_000).toISOString());
  });

  it('(c) flips outboundHealthy=true again after a subsequent success', () => {
    const recovery = vi.fn();
    let clock = 5_000;
    const w = new OutboundHealthWatchdog({
      failureThreshold: 3,
      minDistinctHosts: 2,
      recovery,
      now: () => clock
    });

    w.recordFailure('host-a.example.com');
    w.recordFailure('host-b.example.com');
    expect(w.recordFailure('host-a.example.com')).toBe(true);
    expect(w.isHealthy()).toBe(false);

    clock = 9_000;
    w.recordSuccess('host-a.example.com');
    expect(w.isHealthy()).toBe(true);

    const snap = w.snapshot();
    expect(snap.outboundHealthy).toBe(true);
    expect(snap.consecutiveFailures).toBe(0);
    expect(snap.failingHosts).toEqual([]);
    expect(snap.lastOutboundSuccess['host-a.example.com']).toBe(new Date(9_000).toISOString());
  });

  it('(d) does NOT trip on repeated single-host failures (no false positive from one dead peer)', () => {
    const recovery = vi.fn();
    const w = new OutboundHealthWatchdog({
      failureThreshold: 5,
      minDistinctHosts: 2,
      recovery
    });

    // 10 failures, all to the SAME host (e.g. one dead peer being polled).
    for (let i = 0; i < 10; i++) {
      expect(w.recordFailure('dead-peer.example.com')).toBe(false);
    }

    expect(w.isHealthy()).toBe(true);
    expect(recovery).not.toHaveBeenCalled();
    expect(w.snapshot().failingHosts).toEqual(['dead-peer.example.com']);
  });

  it('does not re-run recovery while already unhealthy until a success resets the streak', () => {
    const recovery = vi.fn();
    const w = new OutboundHealthWatchdog({ failureThreshold: 2, minDistinctHosts: 2, recovery });

    w.recordFailure('a.example.com');
    expect(w.recordFailure('b.example.com')).toBe(true);
    expect(recovery).toHaveBeenCalledTimes(1);

    // More failures while unhealthy must not re-trip recovery.
    w.recordFailure('c.example.com');
    w.recordFailure('d.example.com');
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(w.isHealthy()).toBe(false);
  });

  it('recovery hook errors do not propagate into the caller', () => {
    const w = new OutboundHealthWatchdog({
      failureThreshold: 2,
      minDistinctHosts: 2,
      recovery: () => { throw new Error('boom'); }
    });
    w.recordFailure('a.example.com');
    expect(() => w.recordFailure('b.example.com')).not.toThrow();
    expect(w.isHealthy()).toBe(false);
  });

  it('async recovery rejection is swallowed and trip still completes', async () => {
    const w = new OutboundHealthWatchdog({
      failureThreshold: 2,
      minDistinctHosts: 2,
      recovery: async () => { throw new Error('async boom'); }
    });
    w.recordFailure('a.example.com');
    expect(w.recordFailure('b.example.com')).toBe(true);
    expect(w.isHealthy()).toBe(false);
    // Let the rejected promise settle so it doesn't leak as an unhandled rejection.
    await new Promise((r) => setTimeout(r, 0));
  });
});
