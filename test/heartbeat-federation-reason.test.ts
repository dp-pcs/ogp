import { describe, expect, it } from 'vitest';
import { buildFederationStateReason } from '../src/daemon/heartbeat.js';

// bd-w6jm: the federation-state "degraded" reason previously hard-coded
// `outbound failures: ${failures}`, where `failures` is the heartbeat-probe
// (/.well-known/ogp) reachability counter. That counter is never incremented by
// the federation send path (src/cli/federation.ts), so a peer whose probe still
// succeeds while its message sends are 502-ing reported `outbound failures: 0` —
// a misleading label that under-reported real outbound trouble. The reason now
// reflects the granular healthState direction instead.
describe('buildFederationStateReason (bd-w6jm)', () => {
  it('reports inbound staleness, not "outbound failures: 0", for degraded-inbound', () => {
    const reason = buildFederationStateReason('degraded', 0, 0, 'degraded-inbound');
    expect(reason).toBe('inbound stale (probe reachable)');
    // Regression guard: never claim outbound failures when the probe is reachable
    // and the failure counter is zero.
    expect(reason).not.toContain('outbound failures: 0');
  });

  it('reports outbound probe failures with the count for degraded-outbound', () => {
    expect(buildFederationStateReason('degraded', 2, 3, 'degraded-outbound')).toBe(
      'outbound probe failures: 3'
    );
    expect(buildFederationStateReason('degraded', undefined, 0, 'degraded-outbound')).toBe(
      'outbound probe failing'
    );
  });

  it('falls back to a neutral partial-health reason when healthState is unknown', () => {
    expect(buildFederationStateReason('degraded', 0, 0, undefined)).toBe('partial health');
    expect(buildFederationStateReason('degraded', 0, 4, undefined)).toBe('probe failures: 4');
  });

  it('preserves established / down / twoWay reasons unchanged', () => {
    expect(buildFederationStateReason('established', 0, 0)).toBe('outbound + inbound healthy');
    // failures resolves to nextFailures ?? prevFailures ?? 0; a lingering prior
    // failure count (next undefined) yields the "failures cleared" wording.
    expect(buildFederationStateReason('established', 2, undefined)).toBe('failures cleared');
    expect(buildFederationStateReason('down', 0, 5)).toBe('5 consecutive failures');
    expect(buildFederationStateReason('down', 0, 0)).toBe('no recent contact');
    expect(buildFederationStateReason('twoWay', 0, 0)).toBe(
      'awaiting first bidirectional health check'
    );
  });
});
