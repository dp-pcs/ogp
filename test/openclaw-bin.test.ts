import { describe, it, expect } from 'vitest';
import { resolveOpenClawBin } from '../src/shared/openclaw-bin.js';

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

  it('prefers the sibling of the running node binary', () => {
    const result = resolveOpenClawBin({
      env: {},
      execPath: '/opt/homebrew/bin/node',
      platform: 'darwin',
      existsSync: (p) => p === '/opt/homebrew/bin/openclaw',
    });
    expect(result).toBe('/opt/homebrew/bin/openclaw');
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
