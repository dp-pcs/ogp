import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addPeer,
  createPendingPeerRecord,
  getPeer,
  rejectPeer,
  removePeer,
  type Peer
} from '../src/daemon/peers.js';

function createPeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: 'peer-1',
    alias: 'apollo',
    displayName: 'Apollo @ Hermes',
    email: 'apollo@example.com',
    gatewayUrl: 'https://apollo.example.com',
    publicKey: 'a'.repeat(64),
    status: 'approved',
    requestedAt: '2026-04-07T12:00:00.000Z',
    approvedAt: '2026-04-07T12:05:00.000Z',
    metadata: { source: 'test' },
    protocolVersion: '0.2.0',
    grantedScopes: {
      message: { allowed: true, rateLimit: { count: 10, windowSeconds: 60 } }
    },
    receivedScopes: {
      'agent-comms': { allowed: true, topics: ['general'], rateLimit: { count: 10, windowSeconds: 60 } }
    },
    offeredIntents: ['message', 'agent-comms'],
    responsePolicy: {
      general: { level: 'summary', notes: 'stale policy' }
    },
    defaultLevel: 'auto',
    agentId: 'main',
    ...overrides
  };
}

describe('peer tombstone persistence', () => {
  let tempDir: string;
  const originalOgpHome = process.env.OGP_HOME;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ogp-peers-test-'));
    process.env.OGP_HOME = tempDir;
  });

  afterEach(() => {
    if (originalOgpHome) {
      process.env.OGP_HOME = originalOgpHome;
    } else {
      delete process.env.OGP_HOME;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps only tombstone-safe fields when removing a peer', () => {
    addPeer(createPeer());

    expect(removePeer('peer-1')).toBe(true);

    const peer = getPeer('peer-1');
    expect(peer).toMatchObject({
      id: 'peer-1',
      displayName: 'Apollo @ Hermes',
      email: 'apollo@example.com',
      gatewayUrl: 'https://apollo.example.com',
      publicKey: 'a'.repeat(64),
      status: 'removed',
      requestedAt: '2026-04-07T12:00:00.000Z',
      approvedAt: '2026-04-07T12:05:00.000Z',
      agentId: 'main'
    });
    expect(peer?.removedAt).toBeTruthy();
    expect(peer?.alias).toBeUndefined();
    expect(peer?.metadata).toBeUndefined();
    expect(peer?.grantedScopes).toBeUndefined();
    expect(peer?.receivedScopes).toBeUndefined();
    expect(peer?.offeredIntents).toBeUndefined();
    expect(peer?.responsePolicy).toBeUndefined();
    expect(peer?.defaultLevel).toBeUndefined();
  });

  it('keeps only tombstone-safe fields when rejecting a peer', () => {
    addPeer(createPeer({ status: 'pending', approvedAt: undefined }));

    expect(rejectPeer('peer-1')).toBe(true);

    const peer = getPeer('peer-1');
    expect(peer).toMatchObject({
      id: 'peer-1',
      displayName: 'Apollo @ Hermes',
      email: 'apollo@example.com',
      gatewayUrl: 'https://apollo.example.com',
      publicKey: 'a'.repeat(64),
      status: 'rejected',
      requestedAt: '2026-04-07T12:00:00.000Z',
      agentId: 'main'
    });
    expect(peer?.rejectedAt).toBeTruthy();
    expect(peer?.alias).toBeUndefined();
    expect(peer?.metadata).toBeUndefined();
    expect(peer?.grantedScopes).toBeUndefined();
    expect(peer?.receivedScopes).toBeUndefined();
    expect(peer?.offeredIntents).toBeUndefined();
    expect(peer?.responsePolicy).toBeUndefined();
    expect(peer?.defaultLevel).toBeUndefined();
  });

  it('replaces a removed record with a fresh pending peer during refederation', () => {
    addPeer(createPeer());
    removePeer('peer-1');

    addPeer(createPendingPeerRecord({
      id: 'peer-1',
      displayName: 'Junior @ OpenClaw',
      email: 'junior@example.com',
      gatewayUrl: 'https://junior.example.com',
      publicKey: 'b'.repeat(64),
      offeredIntents: ['project.status'],
      agentId: 'main',
      requestedAt: '2026-04-09T09:00:00.000Z'
    }));

    const peer = getPeer('peer-1');
    expect(peer).toEqual({
      id: 'peer-1',
      displayName: 'Junior @ OpenClaw',
      email: 'junior@example.com',
      gatewayUrl: 'https://junior.example.com',
      publicKey: 'b'.repeat(64),
      status: 'pending',
      requestedAt: '2026-04-09T09:00:00.000Z',
      offeredIntents: ['project.status'],
      agentId: 'main'
    });
  });
});
