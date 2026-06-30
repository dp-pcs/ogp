import { describe, it, expect } from 'vitest';
import { resolveOpenClawBin, buildOpenClawSpawnEnv } from '../src/shared/openclaw-bin.js';

/**
 * bd-bq1: the daemon must locate `openclaw` without depending on the ambient
 * PATH, because the macOS LaunchAgent inherits a minimal PATH that excludes
 * /opt/homebrew/bin (where the binary is symlinked) -> spawn ENOENT -> 100%
 * sessions.send failure.
 */
describe('resolveOpenClawBin', () => {
  const never = () => false;

  it('honors $OPENCLAW_BIN when it points at a real file', () => {
    const result = resolveOpenClawBin({
      env: { OPENCLAW_BIN: '/custom/path/openclaw' },
      execPath: '/usr/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === '/custom/path/openclaw',
    });
    expect(result).toBe('/custom/path/openclaw');
  });

  it('ignores a non-existent $OPENCLAW_BIN and continues discovery', () => {
    const result = resolveOpenClawBin({
      env: { OPENCLAW_BIN: '/does/not/exist' },
      execPath: '/opt/homebrew/Cellar/node/x/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === '/opt/homebrew/bin/openclaw',
    });
    // Falls through the bad override to the well-known Homebrew dir.
    expect(result).toBe('/opt/homebrew/bin/openclaw');
  });

  it('resolves the canonical Homebrew binary', () => {
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/opt/homebrew/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === '/opt/homebrew/bin/openclaw',
    });
    expect(result).toBe('/opt/homebrew/bin/openclaw');
  });

  it('prefers the canonical Homebrew symlink over a stale node-Cellar sibling (bd-bq1 regression)', () => {
    // Real machine state: node runs from a Cellar dir that has a LEFTOVER older
    // `openclaw` sibling, while the user's current, package-manager-managed binary
    // is /opt/homebrew/bin/openclaw. Sibling-first would silently pin the daemon to
    // the stale build; the canonical well-known dir must win.
    const cellarSibling = '/opt/homebrew/Cellar/node/25.6.1/bin/openclaw'; // stale
    const canonical = '/opt/homebrew/bin/openclaw';                        // current
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/opt/homebrew/Cellar/node/25.6.1/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === cellarSibling || p === canonical, // BOTH exist
    });
    expect(result).toBe(canonical);
  });

  it('falls back to the node sibling when openclaw is in no well-known dir', () => {
    // Non-standard layout: a self-contained prefix where openclaw sits next to node
    // but not in /opt/homebrew/bin or /usr/local/bin.
    const sibling = '/custom/prefix/bin/openclaw';
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/custom/prefix/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === sibling,
    });
    expect(result).toBe(sibling);
  });

  it('recovers the Homebrew path when PATH is stripped (the bd-bq1 case)', () => {
    // Simulate the LaunchAgent: node lives in a Cellar dir, openclaw only
    // exists under /opt/homebrew/bin, and PATH (env) is empty.
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/opt/homebrew/Cellar/node/25.6.1/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === '/opt/homebrew/bin/openclaw',
    });
    expect(result).toBe('/opt/homebrew/bin/openclaw');
  });

  it('probes /usr/local/bin when Homebrew bin is absent', () => {
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/usr/bin/node',
      platform: 'linux',
      existsSync: (p) => p === '/usr/local/bin/openclaw',
    });
    expect(result).toBe('/usr/local/bin/openclaw');
  });

  it('falls back to the bare command when nothing is found (PATH preserved)', () => {
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/usr/bin/node',
      platform: 'darwin',
      existsSync: never,
    });
    expect(result).toBe('openclaw');
  });

  it('never throws when existsSync throws', () => {
    const result = resolveOpenClawBin({
      env: { OPENCLAW_BIN: '/x/openclaw' },
      execPath: '/usr/bin/node',
      platform: 'darwin',
      existsSync: () => {
        throw new Error('EACCES');
      },
    });
    expect(result).toBe('openclaw');
  });

  it('falls back to bare command on win32 when no candidate exists', () => {
    const result = resolveOpenClawBin({
      env: {},
      execPath: 'C:/Program Files/nodejs/node.exe',
      platform: 'win32',
      existsSync: never,
    });
    expect(result).toBe('openclaw');
  });
});

/**
 * bd-wpdw: bd-bq1 fixed `spawn openclaw ENOENT`, but the resolved binary is a JS
 * entrypoint with a `#!/usr/bin/env node` shebang. Under the LaunchAgent's
 * stripped PATH the child's `env node` fails ('env: node: No such file or
 * directory'), dropping every cosmetic sync-note. The spawn env must carry a
 * PATH that includes the node bin dir so the shebang resolves.
 */
describe('buildOpenClawSpawnEnv', () => {
  it("prepends the running node's bin dir so the env-node shebang resolves", () => {
    const result = buildOpenClawSpawnEnv({
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      execPath: '/opt/homebrew/Cellar/node/26/bin/node',
      platform: 'darwin',
    });
    const dirs = (result.PATH ?? '').split(':');
    expect(dirs[0]).toBe('/opt/homebrew/Cellar/node/26/bin');
    // original entries are preserved (only prepended, never replaced)
    expect(dirs).toContain('/usr/bin');
    expect(dirs).toContain('/bin');
  });

  it('includes the well-known Homebrew bin dir for the wrapper symlink', () => {
    const result = buildOpenClawSpawnEnv({
      env: { PATH: '/usr/bin:/bin' },
      execPath: '/usr/local/bin/node',
      platform: 'darwin',
    });
    expect((result.PATH ?? '').split(':')).toContain('/opt/homebrew/bin');
  });

  it('synthesizes a usable PATH even when none is inherited', () => {
    const result = buildOpenClawSpawnEnv({
      env: {},
      execPath: '/opt/homebrew/bin/node',
      platform: 'darwin',
    });
    const dirs = (result.PATH ?? '').split(':');
    expect(dirs).toContain('/opt/homebrew/bin');
  });

  it('de-dupes without dropping order (node bin first, no repeats)', () => {
    const result = buildOpenClawSpawnEnv({
      env: { PATH: '/opt/homebrew/bin:/usr/bin' },
      execPath: '/opt/homebrew/bin/node',
      platform: 'darwin',
    });
    const dirs = (result.PATH ?? '').split(':');
    expect(dirs.filter((d) => d === '/opt/homebrew/bin')).toHaveLength(1);
    expect(dirs[0]).toBe('/opt/homebrew/bin');
  });

  it('preserves other env vars', () => {
    const result = buildOpenClawSpawnEnv({
      env: { PATH: '/usr/bin', HOME: '/Users/x', FOO: 'bar' },
      execPath: '/usr/local/bin/node',
      platform: 'darwin',
    });
    expect(result.HOME).toBe('/Users/x');
    expect(result.FOO).toBe('bar');
  });

  it('leaves env untouched on win32 (no env-node shebang there)', () => {
    const result = buildOpenClawSpawnEnv({
      env: { PATH: 'C:/Windows', FOO: 'bar' },
      execPath: 'C:/Program Files/nodejs/node.exe',
      platform: 'win32',
    });
    expect(result.PATH).toBe('C:/Windows');
    expect(result.FOO).toBe('bar');
  });
});
