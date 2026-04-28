import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyOpenClawMock, signObjectMock } = vi.hoisted(() => ({
  notifyOpenClawMock: vi.fn(async () => true),
  signObjectMock: vi.fn(() => ({ signature: 'signed-rejection' }))
}));

const peerRecord = {
  id: 'peer-1',
  status: 'approved',
  publicKey: 'peer-1-pubkey',
  displayName: 'Stan',
  protocolVersion: '0.7.0',
  grantedScopes: {
    scopes: [
      { intent: 'message', enabled: true },
      { intent: 'agent-comms', enabled: true },
      { intent: 'project.contribute', enabled: true }
    ],
    grantedAt: '2026-04-28T00:00:00Z'
  }
};

const multiPersonaConfig = {
  daemonPort: 18790,
  openclawUrl: '',
  openclawToken: '',
  gatewayUrl: 'https://test.example.com',
  displayName: 'Test',
  email: 'test@example.com',
  stateDir: '/tmp/ogp-test',
  agents: [
    { id: 'junior', displayName: 'Junior', role: 'primary' as const, hookAgentId: 'main' },
    { id: 'sterling', displayName: 'Sterling', role: 'specialist' as const, hookAgentId: 'sterling-bot' },
    { id: 'apollo', displayName: 'Apollo', role: 'specialist' as const }
  ]
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
  getPeer: vi.fn((peerId: string) => (peerId === 'peer-1' ? peerRecord : null)),
  getPeerByPublicKey: vi.fn(() => peerRecord),
  updatePeer: vi.fn()
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
    publicKey: 'local-pubkey',
    privateKey: 'local-privkey'
  })),
  getPublicKey: vi.fn(() => 'local-pubkey')
}));

// Mock config to return our multi-persona config from requireConfig/loadConfig
vi.mock('../src/shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/config.js')>('../src/shared/config.js');
  return {
    ...actual,
    requireConfig: vi.fn(() => multiPersonaConfig),
    loadConfig: vi.fn(() => multiPersonaConfig),
    getConfigDir: vi.fn(() => '/tmp/ogp-test'),
    ensureConfigDir: vi.fn(),
    saveConfig: vi.fn()
  };
});

import { handleMessage, type FederationMessage } from '../src/daemon/message-handler.js';

function buildMessage(extra: Partial<FederationMessage> = {}): FederationMessage {
  return {
    intent: 'message',
    from: 'peer-1',
    to: 'me',
    nonce: `nonce-${Math.random()}`,
    timestamp: new Date().toISOString(),
    payload: { text: 'hello' },
    ...extra
  };
}

describe('handleMessage — multi-agent persona routing (B0032 P3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to primary when toAgent is omitted', async () => {
    const message = buildMessage();
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(true);
    expect(notifyOpenClawMock).toHaveBeenCalled();
    const passedPayload = notifyOpenClawMock.mock.calls[0][0];
    // Primary persona is 'junior' with hookAgentId='main'
    expect(passedPayload.hookAgentId).toBe('main');
  });

  it('routes to specialist when toAgent matches a configured persona id', async () => {
    const message = buildMessage({ toAgent: 'sterling' });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(true);
    expect(notifyOpenClawMock).toHaveBeenCalled();
    const passedPayload = notifyOpenClawMock.mock.calls[0][0];
    // Sterling has explicit hookAgentId='sterling-bot'
    expect(passedPayload.hookAgentId).toBe('sterling-bot');
  });

  it('uses persona id as hookAgentId when specialist has no explicit hookAgentId', async () => {
    const message = buildMessage({ toAgent: 'apollo' });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(true);
    expect(notifyOpenClawMock).toHaveBeenCalled();
    const passedPayload = notifyOpenClawMock.mock.calls[0][0];
    // Apollo has no hookAgentId — falls back to id 'apollo'
    expect(passedPayload.hookAgentId).toBe('apollo');
  });

  it('returns 404 with unknown-agent error when toAgent does not match any persona', async () => {
    const message = buildMessage({ toAgent: 'nonexistent' });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(404);
    expect(response.error).toMatch(/unknown.+agent.+nonexistent|nonexistent.+(unknown|not found)/i);
    // Bridge should NOT have been called
    expect(notifyOpenClawMock).not.toHaveBeenCalled();
  });

  it('routes empty-string toAgent to primary (treat as omitted)', async () => {
    const message = buildMessage({ toAgent: '' });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(true);
    const passedPayload = notifyOpenClawMock.mock.calls[0][0];
    expect(passedPayload.hookAgentId).toBe('main');
  });

  it('routes correctly for project.contribute intent (project handler path)', async () => {
    // We don't fully test the project handler — just that the persona resolution
    // happens before the dispatch and unknown personas get rejected uniformly.
    const message = buildMessage({
      intent: 'project.contribute',
      toAgent: 'unknown-persona',
      payload: { projectId: 'test', topic: 'general', summary: 'x' }
    });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(404);
  });

  it('routes correctly for agent-comms intent (agent-comms handler path)', async () => {
    const message = buildMessage({
      intent: 'agent-comms',
      toAgent: 'unknown-persona',
      payload: { topic: 'general', text: 'hello' }
    });
    const response = await handleMessage(message, 'sig');

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(404);
  });
});
