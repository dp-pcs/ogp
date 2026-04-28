import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProjectTopic: vi.fn(),
  contributeToProject: vi.fn(() => 'contrib-1'),
  getProject: vi.fn(() => ({
    id: 'apollo',
    name: 'Apollo',
    members: ['owner@example.com', 'member-peer'],
    topics: [],
    createdAt: '2026-04-13T00:00:00Z',
    updatedAt: '2026-04-13T00:00:00Z'
  })),
  isProjectMember: vi.fn(() => true),
  listProjectsForPeer: vi.fn((peerId: string) => peerId === 'member-peer' ? [{
    id: 'apollo',
    name: 'Apollo',
    members: ['owner@example.com', 'member-peer'],
    topics: [],
    createdAt: '2026-04-13T00:00:00Z',
    updatedAt: '2026-04-13T00:00:00Z'
  }] : []),
  listPeers: vi.fn(() => [
    { id: 'member-peer', status: 'approved' },
    { id: 'non-member-peer', status: 'approved' }
  ]),
  federationSend: vi.fn(async () => ({ success: true }))
}));

vi.mock('../src/daemon/projects.js', () => ({
  createProject: vi.fn(),
  addProject: vi.fn(),
  getProject: mocks.getProject,
  listProjects: vi.fn(),
  listProjectsForPeer: mocks.listProjectsForPeer,
  joinProject: vi.fn(),
  isProjectMember: mocks.isProjectMember,
  contributeToProject: mocks.contributeToProject,
  getTopicContributions: vi.fn(),
  getAuthorContributions: vi.fn(),
  searchContributions: vi.fn(),
  getProjectStatus: vi.fn(),
  updateProject: vi.fn(),
  ensureProjectTopic: mocks.ensureProjectTopic,
  getContributionEntryType: vi.fn()
}));

vi.mock('../src/shared/config.js', () => ({
  loadConfig: vi.fn(() => ({
    email: 'owner@example.com'
  }))
}));

vi.mock('../src/daemon/peers.js', () => ({
  listPeers: mocks.listPeers
}));

vi.mock('../src/cli/federation.js', () => ({
  federationSend: mocks.federationSend
}));

import { projectContribute } from '../src/cli/project.js';

describe('projectContribute membership-scoped sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({
      id: 'apollo',
      name: 'Apollo',
      members: ['owner@example.com', 'member-peer'],
      topics: [],
      createdAt: '2026-04-13T00:00:00Z',
      updatedAt: '2026-04-13T00:00:00Z'
    });
    mocks.isProjectMember.mockReturnValue(true);
    mocks.contributeToProject.mockReturnValue('contrib-1');
    mocks.listPeers.mockReturnValue([
      { id: 'member-peer', status: 'approved' },
      { id: 'non-member-peer', status: 'approved' }
    ]);
    mocks.listProjectsForPeer.mockImplementation((peerId: string) => peerId === 'member-peer' ? [{
      id: 'apollo',
      name: 'Apollo',
      members: ['owner@example.com', 'member-peer'],
      topics: [],
      createdAt: '2026-04-13T00:00:00Z',
      updatedAt: '2026-04-13T00:00:00Z'
    }] : []);
  });

  it('syncs only to approved peers who are project members', async () => {
    await projectContribute('apollo', 'progress', 'Finished the auth flow');

    expect(mocks.ensureProjectTopic).toHaveBeenCalledWith('apollo', 'progress');
    expect(mocks.federationSend).toHaveBeenCalledTimes(1);
    expect(mocks.federationSend).toHaveBeenCalledWith(
      'member-peer',
      'project.contribute',
      expect.stringContaining('"entryType":"progress"'),
      5000,
      undefined
    );
    expect(mocks.federationSend).not.toHaveBeenCalledWith(
      'non-member-peer',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
});
