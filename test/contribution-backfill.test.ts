import { describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution, canonicalPayloadStr } from '../src/daemon/contribution-signing.js';
import { backfillContributionsFromPeer, type QueriedContribution, type BackfillDeps } from '../src/daemon/contribution-backfill.js';

/**
 * bd-53c: the backfill helper pulls a peer's contributions and union-merges by id.
 * It must rely on the injected upsert for trust+dedupe (never verify by hand) and
 * tally inserted/duplicate/rejected/skipped correctly. DI mirrors the relay tests.
 */
const author = generateKeyPair();
const PROJECT = 'aicoe-expert-network';

/** Build a query-response contribution carrying the signed envelope (bd-53c). */
function signedQueried(summary: string): QueriedContribution {
  const { record, wire } = buildSignedContribution(
    { projectId: PROJECT, authorId: author.publicKey, entryType: 'note', summary }, author.privateKey
  );
  return {
    id: record.id, timestamp: record.timestamp, authorId: record.authorId,
    entryType: 'note', summary, signature: wire.signature, payloadStr: canonicalPayloadStr(record, PROJECT)
  };
}

function makeDeps(contributions: QueriedContribution[], upsertImpl?: BackfillDeps['upsert']): BackfillDeps {
  return {
    query: vi.fn(async () => ({ success: true, response: { projectId: PROJECT, contributions } })),
    upsert: upsertImpl ?? vi.fn(() => 'inserted' as const),
  };
}

describe('backfillContributionsFromPeer (bd-53c)', () => {
  it('merges signed contributions and tallies inserted', async () => {
    const deps = makeDeps([signedQueried('a'), signedQueried('b')]);
    const res = await backfillContributionsFromPeer('peerX', PROJECT, deps);
    expect(res.pulled).toBe(2);
    expect(res.inserted).toBe(2);
    expect(res.skipped).toBe(0);
    expect(deps.upsert).toHaveBeenCalledTimes(2);
  });

  it('skips unsigned (legacy) contributions — never trust-merges them', async () => {
    const unsigned: QueriedContribution = { id: 'legacy1', timestamp: '2026-01-01T00:00:00Z', authorId: author.publicKey, summary: 'old', entryType: 'note' };
    const deps = makeDeps([signedQueried('fresh'), unsigned]);
    const res = await backfillContributionsFromPeer('peerX', PROJECT, deps);
    expect(res.pulled).toBe(2);
    expect(res.inserted).toBe(1);
    expect(res.skipped).toBe(1);
    expect(deps.upsert).toHaveBeenCalledTimes(1); // unsigned never reaches upsert
  });

  it('counts upsert outcomes: duplicate + rejected', async () => {
    const items = [signedQueried('x'), signedQueried('y'), signedQueried('z')];
    const upsert = vi.fn()
      .mockReturnValueOnce('inserted')
      .mockReturnValueOnce('duplicate')
      .mockReturnValueOnce('rejected');
    const res = await backfillContributionsFromPeer('peerX', PROJECT, makeDeps(items, upsert));
    expect(res.inserted).toBe(1);
    expect(res.duplicate).toBe(1);
    expect(res.rejected).toBe(1);
  });

  it('is idempotent: a second pass over the same data is all duplicates', async () => {
    const items = [signedQueried('a'), signedQueried('b')];
    const seen = new Set<string>();
    // A realistic upsert: first time inserted, thereafter duplicate by id.
    const upsert: BackfillDeps['upsert'] = (_pid, rec) => {
      if (seen.has(rec.id)) return 'duplicate';
      seen.add(rec.id); return 'inserted';
    };
    const first = await backfillContributionsFromPeer('peerX', PROJECT, makeDeps(items, upsert));
    const second = await backfillContributionsFromPeer('peerX', PROJECT, makeDeps(items, upsert));
    expect(first.inserted).toBe(2);
    expect(second.inserted).toBe(0);
    expect(second.duplicate).toBe(2);
  });

  it('best-effort: a null response sets error and merges nothing (never throws)', async () => {
    const deps: BackfillDeps = { query: vi.fn(async () => null), upsert: vi.fn(() => 'inserted' as const) };
    const res = await backfillContributionsFromPeer('peerX', PROJECT, deps);
    expect(res.error).toBeTruthy();
    expect(res.inserted).toBe(0);
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it('best-effort: a rejected query (403 non-member) sets error, no throw', async () => {
    const deps: BackfillDeps = {
      query: vi.fn(async () => ({ success: false, error: 'You are not a member of this project' })),
      upsert: vi.fn(() => 'inserted' as const),
    };
    const res = await backfillContributionsFromPeer('peerX', PROJECT, deps);
    expect(res.error).toContain('not a member');
    expect(res.inserted).toBe(0);
  });

  it('best-effort: a thrown query (peer offline) is caught and reported', async () => {
    const deps: BackfillDeps = {
      query: vi.fn(async () => { throw new Error('peer-not-connected'); }),
      upsert: vi.fn(() => 'inserted' as const),
    };
    const res = await backfillContributionsFromPeer('peerX', PROJECT, deps);
    expect(res.error).toContain('peer-not-connected');
  });
});
