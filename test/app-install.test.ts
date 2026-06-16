import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  installApp,
  uninstallApp,
  resolveSource,
  readManifest,
  describeInstallPlan,
  AppInstallError,
} from '../src/cli/app.js';
import { getApp, loadApps } from '../src/daemon/app-registry.js';

const NOW = () => '2026-06-13T12:00:00.000Z';

/** Write a fixture App dir with an ogp-app.json + install scripts. */
function makeFixtureApp(root: string, overrides: Record<string, unknown> = {}): string {
  const dir = path.join(root, 'fixture-app');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    id: 'fixture',
    name: 'Fixture App',
    version: '1.0.0',
    uses_intents: ['project.query'],
    uses_projects: ['fixture-proj'],
    installs_skills: [{ name: 'fixture-skill', install: 'install.sh' }],
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'ogp-app.json'), JSON.stringify(manifest), 'utf-8');
  fs.writeFileSync(path.join(dir, 'install.sh'), '#!/bin/sh\necho installed\n', { mode: 0o755 });
  return dir;
}

describe('ogp app install/remove', () => {
  let home: string;
  let appsRoot: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-apphome-'));
    appsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-appsrc-'));
    process.env.OGP_HOME = home;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(appsRoot, { recursive: true, force: true });
  });

  it('installs from a file: ref: runs scripts, registers, records ran skills', async () => {
    const dir = makeFixtureApp(appsRoot);
    const ran: string[] = [];
    const result = await installApp(`file:${dir}`, {}, {
      confirm: async () => true,
      runScript: (p) => ran.push(p),
      now: NOW,
    });
    expect(result.status).toBe('installed');
    expect(ran).toEqual([path.join(dir, 'install.sh')]);
    const stored = getApp('fixture');
    expect(stored?.installedSkills).toEqual(['fixture-skill']);
    expect(stored?.projectJoinStatus).toEqual({ 'fixture-proj': 'not-joined' });
    expect(stored?.source).toBe(`file:${dir}`);
  });

  it('declined consent is a no-op: no scripts run, nothing registered', async () => {
    const dir = makeFixtureApp(appsRoot);
    const ran: string[] = [];
    const result = await installApp(`file:${dir}`, {}, {
      confirm: async () => false,
      runScript: (p) => ran.push(p),
      now: NOW,
    });
    expect(result.status).toBe('declined');
    expect(ran).toEqual([]);
    expect(loadApps()).toEqual([]);
  });

  it('--yes bypasses the consent prompt', async () => {
    const dir = makeFixtureApp(appsRoot);
    let confirmCalled = false;
    const result = await installApp(`file:${dir}`, { assumeYes: true }, {
      confirm: async () => { confirmCalled = true; return false; },
      runScript: () => {},
      now: NOW,
    });
    expect(confirmCalled).toBe(false);
    expect(result.status).toBe('installed');
  });

  it('a failing install script throws and leaves NOTHING registered', async () => {
    const dir = makeFixtureApp(appsRoot);
    await expect(
      installApp(`file:${dir}`, { assumeYes: true }, {
        confirm: async () => true,
        runScript: () => { throw new Error('script blew up'); },
        now: NOW,
      })
    ).rejects.toThrow('script blew up');
    expect(loadApps()).toEqual([]);
  });

  it('installing an already-installed id is a no-op (no double run)', async () => {
    const dir = makeFixtureApp(appsRoot);
    const deps = { confirm: async () => true, runScript: () => {}, now: NOW };
    await installApp(`file:${dir}`, {}, deps);
    const ran: string[] = [];
    const second = await installApp(`file:${dir}`, {}, {
      confirm: async () => true,
      runScript: (p) => ran.push(p),
      now: NOW,
    });
    expect(second.status).toBe('already-installed');
    expect(ran).toEqual([]);
    expect(loadApps()).toHaveLength(1);
  });

  it('installs a pure-reference App (no installs_skills)', async () => {
    const dir = makeFixtureApp(appsRoot, { installs_skills: [] });
    const result = await installApp(`file:${dir}`, { assumeYes: true }, {
      confirm: async () => true,
      runScript: () => { throw new Error('should not run'); },
      now: NOW,
    });
    expect(result.status).toBe('installed');
    expect(getApp('fixture')?.installedSkills).toEqual([]);
  });

  it('remove reverses installed skills then unregisters', async () => {
    const dir = makeFixtureApp(appsRoot);
    await installApp(`file:${dir}`, { assumeYes: true }, {
      confirm: async () => true, runScript: () => {}, now: NOW,
    });
    const removed: string[] = [];
    const r = uninstallApp('fixture', { removeSkill: (n) => removed.push(n) });
    expect(r.status).toBe('removed');
    expect(removed).toEqual(['fixture-skill']);
    expect(getApp('fixture')).toBeNull();
  });

  it('remove of an unknown id reports not-installed', () => {
    expect(uninstallApp('ghost').status).toBe('not-installed');
  });
});

describe('ogp app: source + manifest resolution', () => {
  let appsRoot: string;
  beforeEach(() => { appsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-appsrc2-')); });
  afterEach(() => { fs.rmSync(appsRoot, { recursive: true, force: true }); });

  it('rejects github:/peer: refs in P3 with a helpful message', () => {
    expect(() => resolveSource('github:dp-pcs/signal')).toThrow(AppInstallError);
    expect(() => resolveSource('peer:cosmo/signal')).toThrow(/not supported yet/);
  });

  it('rejects a missing directory', () => {
    expect(() => resolveSource(`file:${path.join(appsRoot, 'nope')}`)).toThrow(/not found/);
  });

  it('rejects a dir with no ogp-app.json', () => {
    expect(() => readManifest(appsRoot)).toThrow(/No ogp-app.json/);
  });

  it('rejects an invalid manifest with the validation errors', () => {
    fs.writeFileSync(path.join(appsRoot, 'ogp-app.json'), JSON.stringify({ id: 'Bad Id' }), 'utf-8');
    expect(() => readManifest(appsRoot)).toThrow(/Invalid manifest/);
  });

  it('describeInstallPlan flags scripts as arbitrary shell and projects as soft', () => {
    const dir = makeFixtureApp(appsRoot);
    const plan = describeInstallPlan(readManifest(dir), dir);
    expect(plan).toMatch(/arbitrary shell/);
    expect(plan).toMatch(/will NOT join/i);
  });
});
