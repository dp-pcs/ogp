import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution, canonicalPayloadStr, verifySignedContribution } from '../src/daemon/contribution-signing.js';
import { backfillContributionsFromPeer } from '../src/daemon/contribution-backfill.js';
import { clearReplayCache } from '../src/daemon/replay-dedup.js';

/**
 * bd-53c end-to-end at the unit level: the project.query RESPONDER emits the signed
 * envelope, the backfill CONSUMER rebuilds it and union-merges via upsertContribution.
 * This pins the full convergence loop without two live daemons.
 */
const author = generateKeyPair();

// A stored signed contribution on the responder side (as upsertContribution stores it).
const { record: storedA } = buildSignedContribution(
  { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'alpha' }, author.privateKey
);
const { record: storedB } = buildSignedContribution(
  { projectId: 'proj', authorId: author.publicKey, entryType: 'note', summary: 'beta', metadata: { k: 1 } }, author.privateKey
);

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  isProjectMember: vi.fn(() => true),
  getTopicContributions: vi.fn(() => []),
  getAuthorContributions: vi.fn(() => []),
  getPeer: vi.fn(),
  verifyObject: vi.fn(() => true),
  checkAccess: vi.fn(() => ({ allowed: true })),
  getIntent: vi.fn(() => ({ name: 'project.query' })),
}));

vi.mock('../src/daemon/projects.js', () => ({
  getProject: mocks.getProject,
  isProjectMember: mocks.isProjectMember,
  getTopicContributions: mocks.getTopicContributions,
  getAuthorContributions: mocks.getAuthorContributions,
  getProjectStatus: vi.fn(),
  contributeToProject: vi.fn(),
  upsertContribution: vi.fn(() => 'inserted'),
  joinProject: vi.fn(),
  createProject: vi.fn(),
  addProject: vi.fn(),
  getContributionEntryType: vi.fn((c: any) => c?.entryType || c?.topic || 'unknown'),
}));
vi.mock('../src/daemon/peers.js', () => ({ getPeer: mocks.getPeer, updatePeer: vi.fn(), listPeers: vi.fn(() => []) }));
vi.mock('../src/shared/signing.js', async (orig) => {
  const real = (await orig()) as any;
  return { ...real, verifyObject: mocks.verifyObject };
});
vi.mock('../src/daemon/doorman.js', () => ({ checkAccess: mocks.checkAccess }));
vi.mock('../src/daemon/intent-registry.js', () => ({ getIntent: mocks.getIntent }));
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

function queryMsg() {
  return {
    from: author.publicKey, to: 'us', nonce: 'q1', timestamp: new Date().toISOString(),
    intent: 'project.query', payload: { projectId: 'proj' },
  };
}

describe('project.query responder emits the signed envelope (bd-53c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReplayCache();
    mocks.getProject.mockReturnValue({
      id: 'proj', name: 'Proj', members: [author.publicKey],
      topics: [{ name: 'note', contributions: [storedA, storedB], lastUpdated: storedB.timestamp }],
      createdAt: '', updatedAt: '',
    });
    mocks.isProjectMember.mockReturnValue(true);
    mocks.getPeer.mockReturnValue({ id: author.publicKey, publicKey: author.publicKey, status: 'approved', displayName: 'P' });
  });

  it('includes { signature, payloadStr } per signed contribution, and the bytes re-verify', async () => {
    const m = queryMsg();
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));
    expect(res.success).toBe(true);
    const contributions = res.response.contributions;
    expect(contributions).toHaveLength(2);
    for (const c of contributions) {
      expect(typeof c.signature).toBe('string');
      expect(typeof c.payloadStr).toBe('string');
      // The emitted envelope re-verifies against the author's key.
      expect(verifySignedContribution({ id: c.id, authorId: c.authorId, timestamp: c.timestamp, payloadStr: c.payloadStr, signature: c.signature }).ok).toBe(true);
    }
  });

  it('full loop: responder output → backfill consumer → real upsert merges the union', async () => {
    const m = queryMsg();
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));

    // Consumer side: a local store that already has storedA but NOT storedB (disjoint).
    const localIds = new Set<string>([storedA.id]);
    const realishUpsert = (_pid: string, rec: any): 'inserted' | 'duplicate' | 'rejected' => {
      // Re-verify exactly as projects.upsertContribution does (trust preserved).
      const check = verifySignedContribution({
        id: rec.id, authorId: rec.authorId, timestamp: rec.timestamp,
        payloadStr: canonicalPayloadStr(rec, 'proj'), signature: rec.signature,
      });
      if (!check.ok) return 'rejected';
      if (localIds.has(rec.id)) return 'duplicate';
      localIds.add(rec.id); return 'inserted';
    };

    const result = await backfillContributionsFromPeer('peerX', 'proj', {
      query: async () => res,
      upsert: realishUpsert,
    });

    expect(result.pulled).toBe(2);
    expect(result.duplicate).toBe(1); // storedA already had
    expect(result.inserted).toBe(1);  // storedB newly merged → union reached
    expect(localIds.has(storedB.id)).toBe(true);
  });

  it('a tampered contribution from the responder is rejected by the consumer (trust holds)', async () => {
    const m = queryMsg();
    const res: any = await handleMessage(m as any, 'outer-sig', JSON.stringify(m));
    // Corrupt one contribution's summary AFTER the responder signed it.
    res.response.contributions[0].summary = 'tampered';
    res.response.contributions[0].payloadStr = res.response.contributions[0].payloadStr.replace('alpha', 'tampered');

    const result = await backfillContributionsFromPeer('peerX', 'proj', {
      query: async () => res,
      upsert: (_pid, rec) => {
        const check = verifySignedContribution({ id: rec.id, authorId: rec.authorId, timestamp: rec.timestamp, payloadStr: rec.payloadStr ?? canonicalPayloadStr(rec, 'proj'), signature: rec.signature });
        return check.ok ? 'inserted' : 'rejected';
      },
    });
    expect(result.rejected).toBeGreaterThanOrEqual(1);
  });
});
