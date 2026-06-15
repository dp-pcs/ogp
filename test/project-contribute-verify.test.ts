import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution } from '../src/daemon/contribution-signing.js';
import { clearReplayCache } from '../src/daemon/replay-dedup.js';

const author = generateKeyPair();

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  isProjectMember: vi.fn(() => true),
  ensureProjectTopic: vi.fn(),
  upsertContribution: vi.fn(() => 'inserted'),
  getPeer: vi.fn(),
  verifyObject: vi.fn(() => true),
  checkAccess: vi.fn(() => ({ allowed: true })),
  getIntent: vi.fn(() => ({ name: 'project.contribute' })),
}));

// projects.js — store side. The handler under test uses upsertContribution
// (signed writes only); the old unsigned contributeToProject path was removed (bd-mrxy).
vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject,
  isProjectMember: mocks.isProjectMember,
  ensureProjectTopic: mocks.ensureProjectTopic,
  upsertContribution: mocks.upsertContribution,
  joinProject: vi.fn(),
  getTopicContributions: vi.fn(() => []),
  getAuthorContributions: vi.fn(() => []),
  getProjectStatus: vi.fn(),
  createProject: vi.fn(),
  addProject: vi.fn(),
  getContributionEntryType: vi.fn((c: any) => c?.entryType || c?.topic || 'unknown'),
}));

// peers.js — outer gate getPeer + identity fallback.
vi.mock('../src/daemon/peers.js', () => ({
  getPeer: mocks.getPeer,
  updatePeer: vi.fn(),
  listPeers: vi.fn(() => []),
}));

// signing.js — partial: force outer verifyObject true, keep canonical signing
// real so the contribution envelope verifies for real.
vi.mock('../src/shared/signing.js', async (orig) => {
  const real = (await orig()) as any;
  return { ...real, verifyObject: mocks.verifyObject };
});

// doorman.js — outer scope check.
vi.mock('../src/daemon/doorman.js', () => ({
  checkAccess: mocks.checkAccess,
}));

// intent-registry.js — intent must exist for dispatch to proceed.
vi.mock('../src/daemon/intent-registry.js', () => ({
  getIntent: mocks.getIntent,
}));

// config.js — persona resolution + loadConfig (used by handleProjectIntent).
vi.mock('../src/shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/config.js')>('../src/shared/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(() => ({ email: 'owner@example.com' })),
    requireConfig: vi.fn(() => ({ email: 'owner@example.com' })),
    synthesizePersonas: vi.fn(() => [{ id: 'main', role: 'primary' }]),
    resolveTargetPersona: vi.fn(() => ({ id: 'main', role: 'primary' })),
    effectiveHookAgentId: vi.fn(() => 'main'),
  };
});

vi.mock('../src/daemon/notify.js', () => ({ notifyOpenClaw: vi.fn(async () => {}) }));

const { handleMessage } = await import('../src/daemon/message-handler.js');

function msg(contribution: any, from = author.publicKey) {
  return {
    from,
    to: 'us',
    nonce: 'n',
    timestamp: new Date().toISOString(),
    intent: 'project.contribute',
    payload: {
      projectId: 'proj',
      entryType: 'note',
      topic: 'note',
      summary: 'hello',
      ...(contribution ? { contribution } : {}),
    },
  };
}

describe('handleProjectContribute signature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReplayCache();
    mocks.upsertContribution.mockReturnValue('inserted');
    mocks.getProject.mockReturnValue({
      id: 'proj', name: 'Proj', members: [author.publicKey],
      topics: [], createdAt: '', updatedAt: '',
    });
    mocks.isProjectMember.mockReturnValue(true);
    mocks.getPeer.mockReturnValue({
      id: author.publicKey, publicKey: author.publicKey, status: 'approved', displayName: 'P',
    });
    mocks.verifyObject.mockReturnValue(true);
    mocks.checkAccess.mockReturnValue({ allowed: true });
    mocks.getIntent.mockReturnValue({ name: 'project.contribute' });
  });

  it('verifies a signed contribution and upserts it', async () => {
    const { wire } = buildSignedContribution(
      { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'hello' },
      author.privateKey
    );
    const m = msg(wire);
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));
    expect(res.success).toBe(true);
    expect(mocks.upsertContribution).toHaveBeenCalledOnce();
  });

  it('rejects with 400 when the contribution envelope is absent', async () => {
    const m = msg(null);
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(mocks.upsertContribution).not.toHaveBeenCalled();
  });

  it('rejects with 401 when authorId != federation sender (relay blocked on live path)', async () => {
    const { wire } = buildSignedContribution(
      { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'hello' },
      author.privateKey
    );
    // sender differs from signed authorId → verifySignedContribution rejects.
    mocks.getPeer.mockReturnValue({
      id: 'different-sender', publicKey: 'different-sender', status: 'approved', displayName: 'X',
    });
    const m = msg(wire, 'different-sender');
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
