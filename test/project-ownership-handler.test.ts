import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedGrant, buildSignedCreation } from '../src/daemon/project-ownership.js';

const owner = generateKeyPair();
const stranger = generateKeyPair();

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(() => ({ id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '' })),
  isProjectMember: vi.fn(() => true),
  setProjectCreation: vi.fn(() => 'set'),
  addOwnerGrant: vi.fn(() => 'added'),
  createProject: vi.fn((id: string, name: string) => ({ id, name, members: [], topics: [], createdAt: '', updatedAt: '' })),
  addProject: vi.fn(),
  getPeer: vi.fn(() => ({ id: 'p', publicKey: 'pk', status: 'approved', displayName: 'P' })),
  verifyObject: vi.fn(() => true),
  checkAccess: vi.fn(() => ({ allowed: true })),
  getIntent: vi.fn(() => ({ name: 'project' })),
}));

// projects.js — store side. Expose the ownership store methods plus the
// contribution helpers other handlers reference.
vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject,
  isProjectMember: mocks.isProjectMember,
  setProjectCreation: mocks.setProjectCreation,
  addOwnerGrant: mocks.addOwnerGrant,
  createProject: mocks.createProject,
  addProject: mocks.addProject,
  ensureProjectTopic: vi.fn(),
  upsertContribution: vi.fn(() => 'inserted'),
  contributeToProject: vi.fn(),
  joinProject: vi.fn(),
  getTopicContributions: vi.fn(() => []),
  getAuthorContributions: vi.fn(() => []),
  getProjectStatus: vi.fn(),
  getContributionEntryType: vi.fn((c: any) => c?.entryType || c?.topic || 'unknown'),
}));

// peers.js — outer gate getPeer + identity fallback.
vi.mock('../src/daemon/peers.js', () => ({
  getPeer: mocks.getPeer,
  updatePeer: vi.fn(),
  listPeers: vi.fn(() => []),
}));

// signing.js — partial: force outer verifyObject true, keep canonical signing
// real so the grant/creation envelopes verify for real.
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
vi.mock('../src/shared/config.js', () => ({
  loadConfig: vi.fn(() => ({ email: 'owner@example.com' })),
  requireConfig: vi.fn(() => ({ email: 'owner@example.com' })),
  synthesizePersonas: vi.fn(() => [{ id: 'main', role: 'primary' }]),
  resolveTargetPersona: vi.fn(() => ({ id: 'main', role: 'primary' })),
  effectiveHookAgentId: vi.fn(() => 'main'),
}));

vi.mock('../src/daemon/notify.js', () => ({ notifyOpenClaw: vi.fn(async () => {}) }));

const { handleMessage } = await import('../src/daemon/message-handler.js');

function msg(intent: string, payloadObj: any, from = owner.publicKey.substring(0, 32)) {
  const m = { from, to: 'us', nonce: 'n', timestamp: new Date().toISOString(), intent, payload: payloadObj };
  return { m, str: JSON.stringify(m) };
}

describe('ownership handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isProjectMember.mockReturnValue(true);
    mocks.addOwnerGrant.mockReturnValue('added');
    mocks.setProjectCreation.mockReturnValue('set');
    mocks.getProject.mockReturnValue({ id: 'proj', name: 'Proj', members: [owner.publicKey, owner.publicKey.substring(0, 32)], topics: [], createdAt: '', updatedAt: '' });
    mocks.getPeer.mockReturnValue({ id: 'p', publicKey: 'pk', status: 'approved', displayName: 'P' });
    mocks.verifyObject.mockReturnValue(true);
    mocks.checkAccess.mockReturnValue({ allowed: true });
    mocks.getIntent.mockReturnValue({ name: 'project' });
  });

  it('accepts project.grant-owner and stores it', async () => {
    const g = buildSignedGrant({ projectId: 'proj', grantee: stranger.publicKey, grantedBy: owner.publicKey }, owner.privateKey);
    const { m, str } = msg('project.grant-owner', { projectId: 'proj', grant: g });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(mocks.addOwnerGrant).toHaveBeenCalledOnce();
  });

  it('rejects a grant the store deems non-owner (403)', async () => {
    mocks.addOwnerGrant.mockReturnValue('rejected');
    const g = buildSignedGrant({ projectId: 'proj', grantee: stranger.publicKey, grantedBy: stranger.publicKey }, stranger.privateKey);
    const { m, str } = msg('project.grant-owner', { projectId: 'proj', grant: g });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a legacy-claim from a non-member (403)', async () => {
    // project members do NOT include stranger
    mocks.getProject.mockReturnValue({ id: 'proj', name: 'Proj', members: [owner.publicKey], topics: [], createdAt: '', updatedAt: '' });
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: stranger.publicKey, provenance: 'legacy-claim' }, stranger.privateKey);
    const { m, str } = msg('project.create', { projectId: 'proj', creation: c }, stranger.publicKey.substring(0, 32));
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(mocks.setProjectCreation).not.toHaveBeenCalled();
  });

  it('accepts a legacy-claim from a member', async () => {
    mocks.getProject.mockReturnValue({ id: 'proj', name: 'Proj', members: [owner.publicKey.substring(0, 32)], topics: [], createdAt: '', updatedAt: '' });
    const c = buildSignedCreation({ projectId: 'proj', creatorKey: owner.publicKey, provenance: 'legacy-claim' }, owner.privateKey);
    const { m, str } = msg('project.create', { projectId: 'proj', creation: c }, owner.publicKey.substring(0, 32));
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(mocks.setProjectCreation).toHaveBeenCalledOnce();
  });
});
