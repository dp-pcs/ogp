import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyOpenClawMock, signObjectMock } = vi.hoisted(() => ({
  notifyOpenClawMock: vi.fn(async () => true),
  signObjectMock: vi.fn(() => ({ signature: 'signed-rejection' }))
}));

const peerRecord = {
  id: 'apollo',
  status: 'approved',
  publicKey: 'apollo-public-key',
  protocolVersion: '0.2.0',
  grantedScopes: {
    scopes: [
      {
        intent: 'agent-comms',
        enabled: true
      }
    ],
    grantedAt: '2026-04-13T00:00:00Z'
  }
};

vi.mock('node:fs', () => ({
  default: {
    appendFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  },
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('../src/daemon/peers.js', () => ({
  getPeer: vi.fn((peerId: string) => (peerId === 'apollo' ? peerRecord : null)),
  getPeerByPublicKey: vi.fn(() => peerRecord)
}));

vi.mock('../src/shared/config.js', () => ({
  getConfigDir: vi.fn(() => '/tmp/ogp-test'),
  ensureConfigDir: vi.fn(),
  loadConfig: vi.fn(() => null),
  saveConfig: vi.fn()
}));

vi.mock('../src/shared/signing.js', () => ({
  verifyObject: vi.fn(() => true),
  signObject: signObjectMock
}));

vi.mock('../src/daemon/notify.js', () => ({
  notifyOpenClaw: notifyOpenClawMock
}));

vi.mock('../src/daemon/keypair.js', () => ({
  loadOrGenerateKeyPair: vi.fn(() => ({
    publicKey: 'local-public-key',
    privateKey: 'local-private-key'
  }))
}));

import { getEffectivePolicy } from '../src/daemon/agent-comms.js';
import { handleMessage, type FederationMessage } from '../src/daemon/message-handler.js';

describe('agent-comms default deny', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults unknown topics to off while keeping general allowed', () => {
    expect(getEffectivePolicy('apollo', 'general')).toEqual({ level: 'summary' });
    expect(getEffectivePolicy('apollo', 'testing')).toEqual({ level: 'full' });
    expect(getEffectivePolicy('apollo', 'finance')).toEqual({ level: 'off' });
  });

  it('returns a signed topic-not-permitted rejection for blocked topics', async () => {
    const message: FederationMessage = {
      intent: 'agent-comms',
      from: 'apollo',
      to: 'local',
      nonce: 'nonce-123',
      timestamp: '2026-04-13T00:00:00Z',
      payload: {
        topic: 'finance',
        message: 'share the budget'
      }
    };

    const result = await handleMessage(message, 'valid-signature');

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.response).toMatchObject({
      status: 'rejected',
      reason: 'topic-not-permitted',
      signature: 'signed-rejection'
    });
    expect(typeof result.error).toBe('string');
    expect(result.response?.message).toBe(result.error);
    expect(notifyOpenClawMock).toHaveBeenCalledOnce();
    expect(signObjectMock).toHaveBeenCalledOnce();
  });
});
