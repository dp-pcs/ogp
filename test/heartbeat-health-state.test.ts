import { describe, expect, it } from 'vitest';
import { deriveHealthState } from '../src/daemon/heartbeat.js';

const RECENCY_MS = 10 * 60 * 1000;

function isoMinutesAgo(now: number, minutes: number): string {
  return new Date(now - minutes * 60 * 1000).toISOString();
}

describe('deriveHealthState (Issue #3)', () => {
  const now = Date.now();

  it('returns established when outbound healthy and inbound recent', () => {
    expect(
      deriveHealthState(
        { healthy: true, lastInboundContactAt: isoMinutesAgo(now, 2) },
        now,
        RECENCY_MS
      )
    ).toBe('established');
  });

  it('returns degraded-inbound when outbound healthy but inbound stale', () => {
    expect(
      deriveHealthState(
        { healthy: true, lastInboundContactAt: isoMinutesAgo(now, 30) },
        now,
        RECENCY_MS
      )
    ).toBe('degraded-inbound');
  });

  it('returns degraded-outbound when outbound failing but inbound recent', () => {
    expect(
      deriveHealthState(
        { healthy: false, lastInboundContactAt: isoMinutesAgo(now, 2) },
        now,
        RECENCY_MS
      )
    ).toBe('degraded-outbound');
  });

  it('returns down when both directions failing', () => {
    expect(
      deriveHealthState(
        { healthy: false, lastInboundContactAt: isoMinutesAgo(now, 30) },
        now,
        RECENCY_MS
      )
    ).toBe('down');
  });

  it('falls back to outbound-only when no inbound history (fresh peer)', () => {
    expect(
      deriveHealthState({ healthy: true, lastInboundContactAt: undefined }, now, RECENCY_MS)
    ).toBe('established');
    expect(
      deriveHealthState({ healthy: false, lastInboundContactAt: undefined }, now, RECENCY_MS)
    ).toBe('down');
  });

  it('treats undefined healthy as healthy (matches existing legacy semantics)', () => {
    expect(
      deriveHealthState(
        { healthy: undefined, lastInboundContactAt: isoMinutesAgo(now, 2) },
        now,
        RECENCY_MS
      )
    ).toBe('established');
  });

  describe('Issue #5: authoritative inbound report wins over inferred lastInboundContactAt', () => {
    it('uses report.healthy=true to flip degraded-inbound back to established', () => {
      // Inferred signal would say degraded-inbound (no recent contact),
      // but the peer just told us they can reach us — trust them.
      expect(
        deriveHealthState(
          {
            healthy: true,
            lastInboundContactAt: isoMinutesAgo(now, 30),
            inboundHealthReport: {
              healthy: true,
              receivedAt: isoMinutesAgo(now, 1)
            }
          },
          now,
          RECENCY_MS
        )
      ).toBe('established');
    });

    it('uses report.healthy=false to flip established to degraded-inbound', () => {
      // Inferred signal would say established (recent contact),
      // but the peer says they can't reach us — trust them.
      expect(
        deriveHealthState(
          {
            healthy: true,
            lastInboundContactAt: isoMinutesAgo(now, 1),
            inboundHealthReport: {
              healthy: false,
              receivedAt: isoMinutesAgo(now, 1)
            }
          },
          now,
          RECENCY_MS
        )
      ).toBe('degraded-inbound');
    });

    it('falls back to inferred signal when report is stale', () => {
      // Report is older than recencyMs → don't trust it; inferred wins.
      expect(
        deriveHealthState(
          {
            healthy: true,
            lastInboundContactAt: isoMinutesAgo(now, 1),
            inboundHealthReport: {
              healthy: false,
              receivedAt: isoMinutesAgo(now, 60)
            }
          },
          now,
          RECENCY_MS
        )
      ).toBe('established');
    });
  });
});
