import { describe, it, expect } from 'vitest';
import { peersToJson } from '../src/cli/federation.js';
import type { Peer } from '../src/daemon/peers.js';

const basePeer = (over: Partial<Peer>): Peer => ({
  id: 'p1',
  displayName: 'Cosmo',
  email: 'c@x.com',
  gatewayUrl: 'https://cosmo.example.com',
  publicKey: 'abcdef0011223344',
  status: 'approved',
  requestedAt: '2026-06-01T00:00:00Z',
  ...over,
});

describe('peersToJson', () => {
  it('projects peers to a stable wire shape', () => {
    const peers: Peer[] = [
      basePeer({
        id: 'p1',
        alias: 'cosmo',
        status: 'approved',
        healthState: 'established',
        healthy: true,
      }),
      basePeer({ id: 'p2', displayName: 'Apollo', status: 'pending' }),
    ];

    const out = peersToJson(peers);

    expect(out).toEqual([
      {
        id: 'p1',
        alias: 'cosmo',
        displayName: 'Cosmo',
        status: 'approved',
        gatewayUrl: 'https://cosmo.example.com',
        publicKey: 'abcdef0011223344',
        healthState: 'established',
        healthy: true,
        grantedScopes: undefined,
        offeredIntents: undefined,
        lastSeenAt: undefined,
        tags: undefined,
      },
      {
        id: 'p2',
        alias: undefined,
        displayName: 'Apollo',
        status: 'pending',
        gatewayUrl: 'https://cosmo.example.com',
        publicKey: 'abcdef0011223344',
        healthState: undefined,
        healthy: undefined,
        grantedScopes: undefined,
        offeredIntents: undefined,
        lastSeenAt: undefined,
        tags: undefined,
      },
    ]);
  });
});
