import { describe, expect, it } from 'vitest';
import { buildPeerQueryJson } from '../src/cli/project.js';

describe('buildPeerQueryJson (bd-2n3)', () => {
  const projectId = 'aicoe-expert-network';

  it('projects wire contributions to a stable JSON shape with id + ISO timestamp', () => {
    const contributions = [
      {
        id: 'signal-tool-preference-1780444019671',
        timestamp: '2026-05-07T23:18:21.000Z',
        authorId: '302a300506032b657003210093297a1a',
        entryType: 'tool-preference',
        topic: 'tool-preference',
        summary: 'Prefers Portkey gateway for fallbacks',
        metadata: { tool: 'portkey', confidence: 'high' },
      },
    ];

    const out = buildPeerQueryJson(projectId, contributions);

    expect(out).toEqual([
      {
        id: 'signal-tool-preference-1780444019671',
        projectId: 'aicoe-expert-network',
        authorId: '302a300506032b657003210093297a1a',
        entryType: 'tool-preference',
        topic: 'tool-preference',
        summary: 'Prefers Portkey gateway for fallbacks',
        timestamp: '2026-05-07T23:18:21.000Z',
        metadata: { tool: 'portkey', confidence: 'high' },
      },
    ]);
  });

  it('normalizes a localized/non-ISO timestamp to ISO 8601', () => {
    const out = buildPeerQueryJson(projectId, [
      {
        id: 'c1',
        timestamp: '5/7/2026, 5:18:21 PM',
        authorId: 'a1',
        topic: 'progress',
        summary: 's',
      },
    ]);

    // Whatever the local parse yields, it must be a valid ISO 8601 string.
    expect(out[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(out[0].timestamp).toString()).not.toBe('Invalid Date');
  });

  it('falls back to topic when entryType is absent and tolerates missing metadata', () => {
    const out = buildPeerQueryJson(projectId, [
      {
        id: 'c2',
        timestamp: '2026-06-01T00:00:00.000Z',
        authorId: 'a2',
        topic: 'decision',
        summary: 'chose option B',
      },
    ]);

    expect(out[0].entryType).toBe('decision');
    expect(out[0].topic).toBe('decision');
    expect(out[0].metadata).toBeUndefined();
  });

  it('returns an empty array for no contributions', () => {
    expect(buildPeerQueryJson(projectId, [])).toEqual([]);
  });
});
