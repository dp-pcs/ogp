import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  isOwner: vi.fn(),
  setProjectStatus: vi.fn()
}));

vi.mock('../src/daemon/projects.js', () => ({
  createProject: vi.fn(),
  addProject: vi.fn(),
  getProject: mocks.getProject,
  listProjects: vi.fn(),
  listProjectsForPeer: vi.fn(),
  joinProject: vi.fn(),
  isProjectMember: vi.fn(),
  upsertContribution: vi.fn(),
  getTopicContributions: vi.fn(),
  getAuthorContributions: vi.fn(),
  searchContributions: vi.fn(),
  getProjectStatus: vi.fn(),
  updateProject: vi.fn(),
  ensureProjectTopic: vi.fn(),
  getContributionEntryType: vi.fn(),
  setProjectCreation: vi.fn(),
  addOwnerGrant: vi.fn(),
  isOwner: mocks.isOwner,
  setProjectStatus: mocks.setProjectStatus
}));

vi.mock('../src/shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/config.js')>('../src/shared/config.js');
  return { ...actual, loadConfig: vi.fn(() => ({ email: 'owner@example.com' })) };
});

vi.mock('../src/daemon/keypair.js', () => ({
  getPublicKey: () => 'owner-key',
  getPrivateKey: () => 'owner-private-key'
}));

import { projectArchive, projectReactivate } from '../src/cli/project.js';

describe('project archive/reactivate CLI (owner-gating)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ id: 'proj', name: 'Proj', members: [], topics: [] });
  });

  it('projectArchive rejects a non-owner and does not call setProjectStatus', async () => {
    mocks.isOwner.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(projectArchive('proj', 'nope')).rejects.toThrow('exit');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('not an owner'));
    expect(mocks.setProjectStatus).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('projectArchive sets archived status for an owner', async () => {
    mocks.isOwner.mockReturnValue(true);
    await projectArchive('proj', 'stale test project');
    expect(mocks.setProjectStatus).toHaveBeenCalledWith('proj', 'archived', 'stale test project');
  });

  it('projectReactivate rejects a non-owner', async () => {
    mocks.isOwner.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(projectReactivate('proj')).rejects.toThrow('exit');
    expect(mocks.setProjectStatus).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('projectReactivate sets active status for an owner', async () => {
    mocks.isOwner.mockReturnValue(true);
    await projectReactivate('proj');
    expect(mocks.setProjectStatus).toHaveBeenCalledWith('proj', 'active');
  });
});
