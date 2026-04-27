import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveKeychain } from '../src/cli/keychain.js';

const tmpRoot = path.join(os.tmpdir(), 'ogp-keychain-resolve');
const configDir = path.join(tmpRoot, 'config');
const configFile = path.join(configDir, 'config.json');

function writeConfig(extra: Record<string, unknown>): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      daemonPort: 18790,
      openclawUrl: '',
      openclawToken: '',
      gatewayUrl: '',
      displayName: 'Test',
      email: '',
      stateDir: configDir,
      ...extra
    }),
    'utf-8'
  );
}

describe('resolveKeychain precedence', () => {
  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(configDir, { recursive: true });
    process.env.OGP_HOME = configDir;
    delete process.env.OGP_KEYCHAIN_PATH;
    delete process.env.OGP_KEYCHAIN_PASSWORD_FILE;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    delete process.env.OGP_KEYCHAIN_PATH;
    delete process.env.OGP_KEYCHAIN_PASSWORD_FILE;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns sane defaults under <config>/ when nothing is set', () => {
    const r = resolveKeychain({});
    expect(r.source).toBe('default');
    expect(r.path).toBe(path.join(configDir, 'ogp.keychain-db'));
    expect(r.passwordFile).toBe(path.join(configDir, 'keychain-password'));
  });

  it('honors env vars over default paths', () => {
    process.env.OGP_KEYCHAIN_PATH = '/tmp/env-kc.keychain-db';
    process.env.OGP_KEYCHAIN_PASSWORD_FILE = '/tmp/env-kc-password';
    const r = resolveKeychain({});
    expect(r.source).toBe('env');
    expect(r.path).toBe('/tmp/env-kc.keychain-db');
    expect(r.passwordFile).toBe('/tmp/env-kc-password');
  });

  it('honors config fields when env vars are absent', () => {
    writeConfig({
      keychainPath: '/var/ogp/cfg.keychain-db',
      keychainPasswordFile: '/var/ogp/cfg-password'
    });
    const r = resolveKeychain({});
    expect(r.source).toBe('config');
    expect(r.path).toBe('/var/ogp/cfg.keychain-db');
  });

  it('env beats config when both are present', () => {
    writeConfig({
      keychainPath: '/from/config.keychain-db',
      keychainPasswordFile: '/from/config-password'
    });
    process.env.OGP_KEYCHAIN_PATH = '/from/env.keychain-db';
    process.env.OGP_KEYCHAIN_PASSWORD_FILE = '/from/env-password';
    const r = resolveKeychain({});
    expect(r.source).toBe('env');
    expect(r.path).toBe('/from/env.keychain-db');
  });

  it('explicit flags beat both env and config', () => {
    writeConfig({
      keychainPath: '/from/config.keychain-db',
      keychainPasswordFile: '/from/config-password'
    });
    process.env.OGP_KEYCHAIN_PATH = '/from/env.keychain-db';
    process.env.OGP_KEYCHAIN_PASSWORD_FILE = '/from/env-password';
    const r = resolveKeychain({
      path: '/from/flag.keychain-db',
      passwordFile: '/from/flag-password'
    });
    expect(r.source).toBe('flags');
    expect(r.path).toBe('/from/flag.keychain-db');
  });

  it('expands ~ in flag paths', () => {
    const r = resolveKeychain({ path: '~/kc.db', passwordFile: '~/kcpw' });
    expect(r.path).toBe(path.join(os.homedir(), 'kc.db'));
    expect(r.passwordFile).toBe(path.join(os.homedir(), 'kcpw'));
  });
});
