import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { federationSend, resolveFederationSendCommandOutcome } from '../src/cli/federation.js';
import { loadOutbox, getQueueSummary } from '../src/daemon/outbox.js';
import * as delivery from '../src/daemon/federation-delivery.js';
import * as peers from '../src/daemon/peers.js';
import * as keypair from '../src/daemon/keypair.js';
import * as config from '../src/shared/config.js';
import * as crypto from 'node:crypto';

const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBKEY } = (() => {
  const kp = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex'),
    publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
  };
})();

describe('durable federation send', () => {
  let dir: string;
  let deliverSpy: any;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-durable-'));
    process.env.OGP_HOME = dir;
    vi.spyOn(config, 'requireConfig').mockReturnValue({
      displayName: 'Test',
      email: 'test@example.com',
      gatewayUrl: 'https://test.example.com',
      daemonPort: 18790,
    } as any);
    vi.spyOn(config, 'loadConfig').mockReturnValue({
      displayName: 'Test',
      email: 'test@example.com',
      gatewayUrl: 'https://test.example.com',
      daemonPort: 18790,
      federation: { durableDelivery: true },
    } as any);
    vi.spyOn(peers, 'getPeer').mockReturnValue({
      id: 'peer-1',
      displayName: 'Peer One',
      status: 'approved',
      gatewayUrl: 'https://peer.example.com',
      publicKey: TEST_PUBKEY,
    } as any);
    vi.spyOn(peers, 'loadPeers').mockReturnValue([]);
    vi.spyOn(keypair, 'loadOrGenerateKeyPair').mockReturnValue({
      publicKey: TEST_PUBKEY,
      privateKey: TEST_PRIVATE_KEY,
    } as any);
    vi.spyOn(keypair, 'getPrivateKey').mockReturnValue(TEST_PRIVATE_KEY);
    vi.spyOn(peers, 'updatePeer').mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('queues on delivery failure when durable', async () => {
    deliverSpy = vi.spyOn(delivery, 'deliverFederationMessage').mockResolvedValue({
      ok: false,
      status: 503,
      result: { error: 'peer unreachable' },
    });
    const result = await federationSend('peer-1', 'message', JSON.stringify({ text: 'hi' }), undefined, undefined, true);
    expect(result).toMatchObject({ success: false, queued: true, nonce: expect.any(String) });
    const summary = getQueueSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].count).toBe(1);
  });

  it('does not queue on failure when best-effort', async () => {
    deliverSpy = vi.spyOn(delivery, 'deliverFederationMessage').mockResolvedValue({
      ok: false,
      status: 503,
      result: { error: 'peer unreachable' },
    });
    const result = await federationSend('peer-1', 'message', JSON.stringify({ text: 'hi' }), undefined, undefined, false);
    expect(result).toMatchObject({ success: false, error: 'peer unreachable', statusCode: 503 });
    expect(result).not.toHaveProperty('queued');
    expect(getQueueSummary()).toHaveLength(0);
  });

  it('does not queue on success', async () => {
    deliverSpy = vi.spyOn(delivery, 'deliverFederationMessage').mockResolvedValue({
      ok: true,
      result: { received: true },
    });
    const result = await federationSend('peer-1', 'message', JSON.stringify({ text: 'hi' }), undefined, undefined, true);
    expect(result).toMatchObject({ received: true });
    expect(getQueueSummary()).toHaveLength(0);
  });
});

describe('federation send CLI outcome', () => {
  it('reports a durable queue acceptance with its nonce as shell success', () => {
    expect(resolveFederationSendCommandOutcome({
      success: false,
      queued: true,
      nonce: 'nonce-123',
    }, 'peer-1')).toEqual({
      exitCode: 0,
      message: '⚠ Delivery deferred; message queued for retry (nonce: nonce-123)',
    });
  });

  it('turns a transport failure into shell failure', () => {
    expect(resolveFederationSendCommandOutcome(null, 'peer-1')).toEqual({ exitCode: 1 });
  });

  it('turns a peer rejection into shell failure without duplicating its logged error', () => {
    expect(resolveFederationSendCommandOutcome({
      success: false,
      error: 'intent not granted',
    }, 'peer-1')).toEqual({ exitCode: 1 });
  });

  it('confirms successful delivery', () => {
    expect(resolveFederationSendCommandOutcome({ success: true }, 'peer-1')).toEqual({
      exitCode: 0,
      message: '✓ Message delivered to peer-1',
    });
  });
});
