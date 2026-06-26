import { describe, expect, it } from 'vitest';
import { selectBackfillWork } from '../src/daemon/heartbeat.js';

/**
 * bd-ydjk: the anti-entropy backfill must NOT fan out
 * project.query to peers we can't reach. Before the fix, a 'down' peer (e.g. one
 * whose tunnel/origin returns 502) stayed in every project's member list and was
 * queried on every heartbeat tick, producing an unbounded "Send failed: 502"
 * storm (observed: 14k+ in a single day against a single dead peer).
 *
 * selectBackfillWork is the pure selector; the caller passes only the peers it
 * considers reachable (approved AND healthState !== 'down').
 */
describe('selectBackfillWork — down-peer skip + caps', () => {
  const projects = [
    { id: 'signal', members: ['self', 'alive', 'dead'] },
    { id: 'lantern', members: ['self', 'dead'] },
  ];

  it('excludes a down (unreachable) peer from the work list', () => {
    // 'dead' omitted from the reachable set → it must never be queried.
    const reachable = new Set(['alive']);
    const work = selectBackfillWork(projects, reachable, 'self', 10);
    expect(work).toEqual([{ projectId: 'signal', peerId: 'alive' }]);
    expect(work.some((w) => w.peerId === 'dead')).toBe(false);
  });

  it('skips self even when self is in the reachable set', () => {
    const reachable = new Set(['self', 'alive']);
    const work = selectBackfillWork(projects, reachable, 'self', 10);
    expect(work.every((w) => w.peerId !== 'self')).toBe(true);
    expect(work).toEqual([{ projectId: 'signal', peerId: 'alive' }]);
  });

  it('honors the maxPeers cap across projects', () => {
    const many = [
      { id: 'p1', members: ['a', 'b'] },
      { id: 'p2', members: ['c', 'd'] },
    ];
    const reachable = new Set(['a', 'b', 'c', 'd']);
    const work = selectBackfillWork(many, reachable, 'self', 3);
    expect(work).toHaveLength(3);
  });

  it('returns an empty list when no member is reachable', () => {
    const reachable = new Set<string>(); // everyone down/unapproved
    const work = selectBackfillWork(projects, reachable, 'self', 10);
    expect(work).toEqual([]);
  });
});
