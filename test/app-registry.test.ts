import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadApps,
  saveApps,
  addApp,
  updateApp,
  removeApp,
  getApp,
  isAppInstalled,
  setAppAdvertised,
  listApps,
  getAppsFile,
  type RegisteredApp,
} from '../src/daemon/app-registry.js';
import type { AppManifest } from '../src/shared/app-manifest.js';

function manifest(id: string): AppManifest {
  return {
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    uses_intents: ['project.query'],
    uses_projects: [id],
  };
}

function registered(id: string): RegisteredApp {
  return {
    id,
    manifest: manifest(id),
    source: `file:/tmp/${id}`,
    installedAt: '2026-06-13T00:00:00.000Z',
    installedSkills: [`${id}-skill`],
    projectJoinStatus: { [id]: 'not-joined' },
  };
}

describe('app-registry (~/.ogp/apps.json)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-apps-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty registry when the file is absent (no migration)', () => {
    expect(fs.existsSync(getAppsFile())).toBe(false);
    expect(loadApps()).toEqual([]);
  });

  it('round-trips apps through save/load', () => {
    saveApps([registered('signal'), registered('entropy')]);
    const loaded = loadApps();
    expect(loaded.map((a) => a.id)).toEqual(['signal', 'entropy']);
    expect(loaded[0].manifest.uses_intents).toEqual(['project.query']);
  });

  it('writes apps.json under getConfigDir() with { apps: [...] } shape', () => {
    addApp(registered('signal'));
    const onDisk = JSON.parse(fs.readFileSync(getAppsFile(), 'utf-8'));
    expect(onDisk).toHaveProperty('apps');
    expect(onDisk.apps[0].id).toBe('signal');
  });

  it('addApp rejects a duplicate id rather than overwriting', () => {
    expect(addApp(registered('signal'))).toBe('added');
    expect(addApp(registered('signal'))).toBe('duplicate');
    expect(loadApps()).toHaveLength(1);
  });

  it('getApp / isAppInstalled find by id', () => {
    addApp(registered('signal'));
    expect(getApp('signal')?.id).toBe('signal');
    expect(getApp('nope')).toBeNull();
    expect(isAppInstalled('signal')).toBe(true);
    expect(isAppInstalled('nope')).toBe(false);
  });

  it('updateApp replaces in place, returns false for unknown id', () => {
    addApp(registered('signal'));
    const upgraded = { ...registered('signal'), installedSkills: ['signal-v2'] };
    expect(updateApp(upgraded)).toBe(true);
    expect(getApp('signal')?.installedSkills).toEqual(['signal-v2']);
    expect(updateApp(registered('ghost'))).toBe(false);
  });

  it('removeApp deletes by id and reports presence', () => {
    addApp(registered('signal'));
    expect(removeApp('signal')).toBe(true);
    expect(removeApp('signal')).toBe(false);
    expect(loadApps()).toEqual([]);
  });

  it('setAppAdvertised toggles the flag, false for unknown id', () => {
    addApp(registered('signal'));
    expect(setAppAdvertised('signal', true)).toBe(true);
    expect(getApp('signal')?.advertised).toBe(true);
    expect(setAppAdvertised('signal', false)).toBe(true);
    expect(getApp('signal')?.advertised).toBe(false);
    expect(setAppAdvertised('ghost', true)).toBe(false);
  });

  it('listApps returns all installed apps', () => {
    addApp(registered('a'));
    addApp(registered('b'));
    expect(listApps().map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('treats a corrupt apps.json as empty rather than throwing', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getAppsFile(), '{ not valid json', 'utf-8');
    expect(loadApps()).toEqual([]);
  });
});
