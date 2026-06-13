import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  isSafeRelativePath,
  APP_MANIFEST_SCHEMA_VERSION,
  type AppManifest,
} from '../src/shared/app-manifest.js';

/** The real Signal manifest from the spec — the canonical "valid" case. */
function signalManifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'signal',
    name: 'Signal',
    description: 'Federated AI-CoE knowledge hub',
    version: '1.0.0',
    uses_intents: ['project.contribute', 'project.query'],
    uses_projects: ['signal'],
    installs_skills: [
      { name: 'signal-contribute', install: 'scripts/install-signal-contribute.sh' },
    ],
    published_output: 'https://aicoe.elelem.expert',
    status_endpoint: null,
    publisher: { name: 'AI CoE', key: 'a1b2c3d4e5f6' },
  };
}

describe('validateManifest — valid', () => {
  it('accepts the canonical Signal manifest', () => {
    const r = validateManifest(signalManifest());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.manifest?.id).toBe('signal');
  });

  it('accepts a minimal manifest (only required fields)', () => {
    const r = validateManifest({
      schemaVersion: 1,
      id: 'minimal',
      name: 'Minimal',
      version: '0.1.0',
      uses_intents: ['message'],
    });
    expect(r.ok).toBe(true);
  });

  it('preserves unknown top-level fields opaquely (forward-compat)', () => {
    const r = validateManifest({ ...signalManifest(), futureField: { nested: true } });
    expect(r.ok).toBe(true);
    expect((r.manifest as AppManifest).futureField).toEqual({ nested: true });
  });

  it('exposes the schema version it supports', () => {
    expect(APP_MANIFEST_SCHEMA_VERSION).toBe(1);
  });
});

describe('validateManifest — type guards', () => {
  it('rejects a non-object', () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest('x').ok).toBe(false);
    expect(validateManifest([]).ok).toBe(false);
  });
});

describe('validateManifest — per-rule failures', () => {
  const bad = (mut: (m: Record<string, unknown>) => void, needle: string) => {
    const m = signalManifest();
    mut(m);
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes(needle))).toBe(true);
  };

  it('schemaVersion missing', () => bad((m) => delete m.schemaVersion, 'schemaVersion'));
  it('schemaVersion unsupported', () => bad((m) => (m.schemaVersion = 99), 'unsupported schemaVersion'));
  it('id missing', () => bad((m) => delete m.id, 'id is required'));
  it('id not kebab-case', () => bad((m) => (m.id = 'Not_Kebab'), 'kebab-case'));
  it('id too long', () => bad((m) => (m.id = 'a'.repeat(65)), '<= 64'));
  it('name missing', () => bad((m) => delete m.name, 'name is required'));
  it('version missing', () => bad((m) => delete m.version, 'version is required'));
  it('uses_intents missing', () => bad((m) => delete m.uses_intents, 'uses_intents is required'));
  it('uses_intents empty', () => bad((m) => (m.uses_intents = []), 'uses_intents is required'));
  it('uses_intents non-string', () => bad((m) => (m.uses_intents = [1]), 'non-empty strings'));
  it('uses_projects wrong type', () => bad((m) => (m.uses_projects = 'signal'), 'uses_projects must be an array'));
  it('installs_skills not array', () => bad((m) => (m.installs_skills = {}), 'installs_skills must be an array'));
  it('installs_skills missing name', () =>
    bad((m) => (m.installs_skills = [{ install: 'scripts/x.sh' }]), '.name is required'));
  it('installs_skills missing install', () =>
    bad((m) => (m.installs_skills = [{ name: 'x' }]), '.install is required'));
  it('installs_skills path escapes repo (..)', () =>
    bad((m) => (m.installs_skills = [{ name: 'x', install: '../evil.sh' }]), 'repo-relative path'));
  it('installs_skills absolute path', () =>
    bad((m) => (m.installs_skills = [{ name: 'x', install: '/etc/evil.sh' }]), 'repo-relative path'));
  it('published_output wrong type', () => bad((m) => (m.published_output = 42), 'published_output must be a string'));
  it('publisher missing key', () => bad((m) => (m.publisher = { name: 'X' }), 'publisher.key is required'));
  it('publisher non-hex key', () => bad((m) => (m.publisher = { name: 'X', key: 'zzz!' }), 'hex-encoded'));

  it('reports MULTIPLE errors at once', () => {
    const r = validateManifest({ id: 'Bad Id' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(1);
  });
});

describe('isSafeRelativePath', () => {
  it('accepts plain relative paths', () => {
    expect(isSafeRelativePath('scripts/install.sh')).toBe(true);
    expect(isSafeRelativePath('a/b/c.sh')).toBe(true);
  });
  it('rejects traversal and absolute paths', () => {
    expect(isSafeRelativePath('../x')).toBe(false);
    expect(isSafeRelativePath('a/../b')).toBe(false);
    expect(isSafeRelativePath('/abs')).toBe(false);
    expect(isSafeRelativePath('C:\\win')).toBe(false);
    expect(isSafeRelativePath('a\\..\\b')).toBe(false);
    expect(isSafeRelativePath('')).toBe(false);
  });
});
