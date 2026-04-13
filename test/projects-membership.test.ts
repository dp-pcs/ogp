import { describe, expect, it } from 'vitest';
import { listProjectsForPeer, type Project } from '../src/daemon/projects.js';

describe('listProjectsForPeer', () => {
  it('returns only projects where the peer is an explicit member', () => {
    const projects: Project[] = [
      {
        id: 'synapse',
        name: 'Synapse',
        createdAt: '2026-04-13T00:00:00Z',
        updatedAt: '2026-04-13T00:00:00Z',
        members: ['david@example.com', 'apollo-peer'],
        topics: []
      },
      {
        id: 'secret-project',
        name: 'Secret Project',
        createdAt: '2026-04-13T00:00:00Z',
        updatedAt: '2026-04-13T00:00:00Z',
        members: ['david@example.com', 'stan-peer'],
        topics: []
      }
    ];

    expect(listProjectsForPeer('apollo-peer', projects).map(project => project.id)).toEqual(['synapse']);
    expect(listProjectsForPeer('clawporate-peer', projects)).toEqual([]);
  });
});
