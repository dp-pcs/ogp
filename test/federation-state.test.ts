import { describe, expect, it } from 'vitest';
import { deriveFederationState } from '../src/daemon/peers.js';
import type { Peer } from '../src/daemon/peers.js';

function basePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: 'peer-1',
    displayName: 'Apollo',
    email: 'apollo@example.com',
    gatewayUrl: 'https://apollo.example.com',
    publicKey: 'a'.repeat(64),
    status: 'approved',
    requestedAt: '2026-04-01T00:00:00.000Z',
    ...overrides
  };
}

describe('deriveFederationState (Issue #4)', () => {
  it('returns init for pending peers', () => {
    expect(deriveFederationState(basePeer({ status: 'pending' }))).toBe('init');
  });

  it('returns tombstoned for rejected and removed peers', () => {
    expect(deriveFederationState(basePeer({ status: 'rejected' }))).toBe('tombstoned');
    expect(deriveFederationState(basePeer({ status: 'removed' }))).toBe('tombstoned');
  });

  it('returns twoWay for fresh approved peers with no contact history', () => {
    expect(deriveFederationState(basePeer())).toBe('twoWay');
  });

  it('returns twoWay for approved peers with history but no healthState yet (warming up)', () => {
    expect(
      deriveFederationState(basePeer({
        lastOutboundCheckAt: '2026-04-02T00:00:00.000Z'
      }))
    ).toBe('twoWay');
  });

  it('mirrors established healthState', () => {
    expect(
      deriveFederationState(basePeer({
        healthState: 'established',
        lastOutboundCheckAt: '2026-04-02T00:00:00.000Z'
      }))
    ).toBe('established');
  });

  it('collapses degraded-outbound and degraded-inbound to degraded', () => {
    expect(
      deriveFederationState(basePeer({
        healthState: 'degraded-outbound',
        lastOutboundCheckAt: '2026-04-02T00:00:00.000Z'
      }))
    ).toBe('degraded');
    expect(
      deriveFederationState(basePeer({
        healthState: 'degraded-inbound',
        lastOutboundCheckAt: '2026-04-02T00:00:00.000Z'
      }))
    ).toBe('degraded');
  });

  it('mirrors down healthState', () => {
    expect(
      deriveFederationState(basePeer({
        healthState: 'down',
        lastOutboundCheckFailedAt: '2026-04-02T00:00:00.000Z'
      }))
    ).toBe('down');
  });
});
