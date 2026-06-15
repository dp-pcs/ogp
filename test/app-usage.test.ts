import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { computeAppUsage, type AppUsageEntry } from '../src/cli/app.js';
import { type RegisteredApp } from '../src/daemon/app-registry.js';
import { type ActivityEntry } from '../src/daemon/agent-comms.js';

function makeApp(
  id: string,
  usesIntents: string[],
  usesProjects?: string[]
): RegisteredApp {
  return {
    id,
    manifest: {
      schemaVersion: 1,
      id,
      name: id,
      version: '1.0.0',
      uses_intents: usesIntents,
      uses_projects: usesProjects,
      installs_skills: [],
    },
    source: `file:/tmp/${id}`,
    installedAt: '2026-06-15T00:00:00.000Z',
    installedSkills: [],
    projectJoinStatus: {},
  };
}

function makeActivity(
  intent: string,
  projectId?: string,
  timestamp?: string
): ActivityEntry {
  return {
    timestamp: timestamp ?? '2026-06-15T12:00:00.000Z',
    direction: 'in',
    peerId: 'cosmo',
    peerName: 'Cosmo',
    topic: intent,
    message: 'test',
    intent,
    projectId,
  };
}

describe('computeAppUsage', () => {
  it('attributes a single intent to a single app', () => {
    const apps = [makeApp('signal', ['project.contribute'])];
    const activities = [
      makeActivity('project.contribute', 'signal'),
      makeActivity('project.contribute', 'signal'),
    ];
    const usage = computeAppUsage(apps, activities);
    expect(usage).toHaveLength(1);
    expect(usage[0].totalCalls).toBe(2);
    expect(usage[0].byIntent['project.contribute']).toBe(2);
    expect(usage[0].ambiguous).toBe(false);
  });

  it('returns zero usage when no activities match', () => {
    const apps = [makeApp('signal', ['project.contribute'])];
    const usage = computeAppUsage(apps, []);
    expect(usage[0].totalCalls).toBe(0);
    expect(usage[0].earliestAttributable).toBeNull();
  });

  it('disambiguates shared intents by projectId', () => {
    const apps = [
      makeApp('signal', ['project.contribute'], ['signal']),
      makeApp('other', ['project.contribute'], ['other']),
    ];
    const activities = [
      makeActivity('project.contribute', 'signal'),
      makeActivity('project.contribute', 'other'),
    ];
    const usage = computeAppUsage(apps, activities);
    expect(usage.find((u) => u.id === 'signal')!.totalCalls).toBe(1);
    expect(usage.find((u) => u.id === 'other')!.totalCalls).toBe(1);
    expect(usage.every((u) => !u.ambiguous)).toBe(true);
  });

  it('flags ambiguous when two apps share an intent and projectId is absent', () => {
    const apps = [
      makeApp('signal', ['project.contribute']),
      makeApp('other', ['project.contribute']),
    ];
    const activities = [makeActivity('project.contribute')];
    const usage = computeAppUsage(apps, activities);
    expect(usage[0].ambiguous).toBe(true);
    expect(usage[0].sharedIntents).toContain('project.contribute');
    expect(usage[1].ambiguous).toBe(true);
    expect(usage[0].totalCalls).toBe(1);
    expect(usage[1].totalCalls).toBe(1);
  });

  it('reports earliest and latest attributable timestamps', () => {
    const apps = [makeApp('signal', ['project.contribute'])];
    const activities = [
      makeActivity('project.contribute', 'signal', '2026-06-15T10:00:00.000Z'),
      makeActivity('project.contribute', 'signal', '2026-06-15T14:00:00.000Z'),
      makeActivity('project.contribute', 'signal', '2026-06-15T12:00:00.000Z'),
    ];
    const usage = computeAppUsage(apps, activities);
    expect(usage[0].earliestAttributable).toBe('2026-06-15T10:00:00.000Z');
    expect(usage[0].latestAttributable).toBe('2026-06-15T14:00:00.000Z');
  });

  it('filters out entries without an intent', () => {
    const apps = [makeApp('signal', ['project.contribute'])];
    const activities = [
      { ...makeActivity('project.contribute'), intent: undefined },
      makeActivity('project.contribute'),
    ];
    const usage = computeAppUsage(apps, activities as ActivityEntry[]);
    expect(usage[0].totalCalls).toBe(1);
  });
});
