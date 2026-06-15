import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProjectTopic: vi.fn(),
  upsertContribution: vi.fn(() => 'inserted'),
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
  upsertContribution: mocks.upsertContribution,
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

// Real keypair so buildSignedContribution produces a valid signature without touching disk.
vi.mock('../src/daemon/keypair.js', async () => {
  const { generateKeyPair } = await vi.importActual<typeof import('../src/shared/signing.js')>(
    '../src/shared/signing.js'
  );
  const kp = generateKeyPair();
  return { getPublicKey: () => kp.publicKey, getPrivateKey: () => kp.privateKey };
});

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

  it('syncs only to approved peers who are project members, with a 30s ack timeout (bd-egmt)', async () => {
    await projectContribute('apollo', 'progress', 'Finished the auth flow');

    expect(mocks.ensureProjectTopic).toHaveBeenCalledWith('apollo', 'progress');
    expect(mocks.federationSend).toHaveBeenCalledTimes(1);
    expect(mocks.federationSend).toHaveBeenCalledWith(
      'member-peer',
      'project.contribute',
      expect.stringContaining('"entryType":"progress"'),
      30000, // bd-egmt: raised from 5000 to match bd-ogwd query-peer parity (cross-gateway acks run 5-10s)
      undefined
    );
    expect(mocks.federationSend).not.toHaveBeenCalledWith(
      'non-member-peer',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('reports a confirmed sync when the peer acks (bd-egmt)', async () => {
    mocks.federationSend.mockResolvedValue({ success: true });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await projectContribute('apollo', 'progress', 'Auth done');
    const out = log.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).toMatch(/Synced to 1 peer/);
    log.mockRestore();
  });

  it('does NOT claim a confirmed sync when the ack times out / is unconfirmed (bd-egmt)', async () => {
    // federationSend returns null on timeout (it does not throw) — the write may have
    // landed, but we have no ack. We must NOT print "Synced" as if confirmed.
    mocks.federationSend.mockResolvedValue(null);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await projectContribute('apollo', 'progress', 'Auth done');
    const out = log.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).not.toMatch(/Synced to \d+ peer/);
    expect(out).toMatch(/unconfirmed|in.?flight|no ack/i);
    log.mockRestore();
  });

  it('reports a rejected sync distinctly from an unconfirmed one (bd-egmt)', async () => {
    mocks.federationSend.mockResolvedValue({ success: false, error: 'nope', statusCode: 401 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await projectContribute('apollo', 'progress', 'Auth done');
    const out = log.mock.calls.map(c => String(c[0])).join('\n');
    expect(out).not.toMatch(/Synced to \d+ peer/);
    expect(out).toMatch(/reject/i);
    log.mockRestore();
  });
});
