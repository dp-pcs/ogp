import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addProject,
  getContributionEntryType,
  getTopicContributions,
  searchContributions,
  type Project
} from '../src/daemon/projects.js';

describe('project entry type compatibility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-project-entry-type-'));
    process.env.OGP_HOME = tempDir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads both legacy topic fields and new entryType fields', () => {
    const project: Project = {
      id: 'apollo',
      name: 'Apollo',
      createdAt: '2026-04-13T00:00:00Z',
      updatedAt: '2026-04-13T00:00:00Z',
      members: ['alice@example.com'],
      topics: [
        {
          name: 'progress',
          contributions: [
            {
              id: 'legacy-1',
              timestamp: '2026-04-13T01:00:00Z',
              authorId: 'alice@example.com',
              topic: 'progress',
              summary: 'Legacy contribution'
            },
            {
              id: 'modern-1',
              timestamp: '2026-04-13T02:00:00Z',
              authorId: 'alice@example.com',
              entryType: 'progress',
              summary: 'Modern contribution'
            }
          ],
          lastUpdated: '2026-04-13T02:00:00Z'
        }
      ]
    };

    addProject(project);

    const contributions = getTopicContributions('apollo', 'progress');
    expect(contributions.map(contribution => contribution.id)).toEqual(['modern-1', 'legacy-1']);
    expect(contributions.map(contribution => getContributionEntryType(contribution))).toEqual(['progress', 'progress']);

    const searchResults = searchContributions('apollo', 'progress');
    expect(searchResults.map(contribution => contribution.id)).toEqual(['modern-1', 'legacy-1']);
  });
});
