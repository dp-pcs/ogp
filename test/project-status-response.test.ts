import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { clearReplayCache } from '../src/daemon/replay-dedup.js';

const owner = generateKeyPair();

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectStatus: vi.fn(),
  isProjectMember: vi.fn(() => true),
  getTopicContributions: vi.fn(() => []),
  getAuthorContributions: vi.fn(() => []),
  getPeer: vi.fn(() => ({ id: 'p', publicKey: 'pk', status: 'approved', displayName: 'P' })),
  verifyObject: vi.fn(() => true),
  checkAccess: vi.fn(() => ({ allowed: true })),
  getIntent: vi.fn(() => ({ name: 'project' })),
}));

vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject,
  isProjectMember: mocks.isProjectMember,
  setProjectCreation: vi.fn(),
  addOwnerGrant: vi.fn(),
  createProject: vi.fn(),
  addProject: vi.fn(),
  ensureProjectTopic: vi.fn(),
  upsertContribution: vi.fn(),
  joinProject: vi.fn(),
  getTopicContributions: mocks.getTopicContributions,
  getAuthorContributions: mocks.getAuthorContributions,
  getProjectStatus: mocks.getProjectStatus,
  getContributionEntryType: vi.fn((c: any) => c?.entryType || c?.topic || 'unknown'),
}));

vi.mock('../src/daemon/peers.js', () => ({
  getPeer: mocks.getPeer,
  updatePeer: vi.fn(),
  listPeers: vi.fn(() => []),
}));

vi.mock('../src/shared/signing.js', async (orig) => {
  const real = (await orig()) as any;
  return { ...real, verifyObject: mocks.verifyObject };
});

vi.mock('../src/daemon/doorman.js', () => ({
  checkAccess: mocks.checkAccess,
}));

vi.mock('../src/daemon/intent-registry.js', () => ({
  getIntent: mocks.getIntent,
}));

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

const notifyOpenClaw = vi.fn(async () => {});
vi.mock('../src/daemon/notify.js', () => ({ notifyOpenClaw }));

const { handleMessage } = await import('../src/daemon/message-handler.js');

function msg(intent: string, payloadObj: any, from = owner.publicKey.substring(0, 32)) {
  const m = { from, to: 'us', nonce: 'n', timestamp: new Date().toISOString(), intent, payload: payloadObj };
  return { m, str: JSON.stringify(m) };
}

describe('project.query / project.status surface archived lifecycle status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReplayCache();
    mocks.isProjectMember.mockReturnValue(true);
    mocks.getPeer.mockReturnValue({ id: 'p', publicKey: 'pk', status: 'approved', displayName: 'P' });
    mocks.verifyObject.mockReturnValue(true);
    mocks.checkAccess.mockReturnValue({ allowed: true });
    mocks.getIntent.mockReturnValue({ name: 'project' });
  });

  it('project.query omits status for an active project', async () => {
    mocks.getProject.mockReturnValue({ id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '' });
    const { m, str } = msg('project.query', { projectId: 'proj' });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(res.response.status).toBeUndefined();
  });

  it('project.query includes status + statusReason for an archived project', async () => {
    mocks.getProject.mockReturnValue({
      id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '',
      status: 'archived', statusReason: 'test project, ignore'
    });
    const { m, str } = msg('project.query', { projectId: 'proj' });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(res.response.status).toBe('archived');
    expect(res.response.statusReason).toBe('test project, ignore');
  });

  it('project.query notification is prefixed "(archived)" for an archived project', async () => {
    mocks.getProject.mockReturnValue({
      id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '',
      status: 'archived', statusReason: 'stale'
    });
    const { m, str } = msg('project.query', { projectId: 'proj' });
    await handleMessage(m as any, 'outer', str);
    expect(notifyOpenClaw).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('(archived)')
    }));
  });

  it('project.status includes status + statusReason for an archived project', async () => {
    const project = {
      id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '',
      status: 'archived', statusReason: 'wound down'
    };
    mocks.getProjectStatus.mockReturnValue({ project, topics: [] });
    const { m, str } = msg('project.status', { projectId: 'proj' });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(res.response.project.status).toBe('archived');
    expect(res.response.project.statusReason).toBe('wound down');
  });

  it('project.status omits status for an active project', async () => {
    const project = { id: 'proj', name: 'Proj', members: [], topics: [], createdAt: '', updatedAt: '' };
    mocks.getProjectStatus.mockReturnValue({ project, topics: [] });
    const { m, str } = msg('project.status', { projectId: 'proj' });
    const res: any = await handleMessage(m as any, 'outer', str);
    expect(res.success).toBe(true);
    expect(res.response.project.status).toBeUndefined();
  });
});
