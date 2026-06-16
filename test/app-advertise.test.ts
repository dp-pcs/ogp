import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildWellKnownResponse } from '../src/daemon/server.js';
import { addApp, loadApps } from '../src/daemon/app-registry.js';
import { parsePeerRef } from '../src/cli/app.js';
import type { OGPConfig } from '../src/shared/config.js';

function baseConfig(): OGPConfig {
  return {
    displayName: 'Atlas',
    email: 'atlas@example.com',
    gatewayUrl: 'https://atlas.example.com',
    framework: 'openclaw',
  } as OGPConfig;
}

describe('P5: peer-advertised Apps', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-apps-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('parsePeerRef parses peer refs with and without appId', () => {
    expect(parsePeerRef('peer:cosmo')).toEqual({ peerId: 'cosmo' });
    expect(parsePeerRef('peer:cosmo/signal')).toEqual({ peerId: 'cosmo', appId: 'signal' });
    expect(parsePeerRef('file:/tmp/foo')).toBeNull();
  });

  it('buildWellKnownResponse omits apps when nothing is advertised', () => {
    const cfg = baseConfig();
    const response = buildWellKnownResponse({
      cfg,
      intentNames: ['message'],
      publicKey: 'deadbeef',
    });
    expect(response.capabilities.apps).toBeUndefined();
  });

  it('buildWellKnownResponse includes advertised apps', () => {
    addApp({
      id: 'signal',
      manifest: {
        schemaVersion: 1,
        id: 'signal',
        name: 'Signal',
        version: '1.0.0',
        uses_intents: ['project.contribute'],
        publisher: { name: 'AI CoE', key: 'pubkey1' },
      },
      source: 'file:/tmp/signal',
      installedAt: '2026-06-15T00:00:00.000Z',
      installedSkills: [],
      projectJoinStatus: {},
      advertised: true,
    });

    const cfg = baseConfig();
    const response = buildWellKnownResponse({
      cfg,
      intentNames: ['message'],
      publicKey: 'deadbeef',
    });

    expect(response.capabilities.apps).toHaveLength(1);
    expect(response.capabilities.apps![0].manifest.id).toBe('signal');
    expect(response.capabilities.apps![0].publisherKey).toBe('pubkey1');
  });

  it('buildWellKnownResponse does not include unadvertised apps', () => {
    addApp({
      id: 'signal',
      manifest: {
        schemaVersion: 1,
        id: 'signal',
        name: 'Signal',
        version: '1.0.0',
        uses_intents: ['project.contribute'],
      },
      source: 'file:/tmp/signal',
      installedAt: '2026-06-15T00:00:00.000Z',
      installedSkills: [],
      projectJoinStatus: {},
      advertised: false,
    });

    const cfg = baseConfig();
    const response = buildWellKnownResponse({
      cfg,
      intentNames: ['message'],
      publicKey: 'deadbeef',
    });

    expect(response.capabilities.apps).toBeUndefined();
  });
});
