import { describe, expect, it } from 'vitest';
import { generatePlist, stableNodePath } from '../src/cli/install.js';

describe('generatePlist', () => {
  it('launches ogp through an explicit node binary', () => {
    const plist = generatePlist('/opt/homebrew/bin/node', '/opt/homebrew/bin/ogp');

    expect(plist).toContain('<string>/opt/homebrew/bin/node</string>');
    expect(plist).toContain('<string>/opt/homebrew/bin/ogp</string>');
    expect(plist).toContain('<string>start</string>');
    expect(plist).toContain('<string>--background</string>');
  });

  it('puts node before the ogp entrypoint in ProgramArguments', () => {
    const plist = generatePlist('/custom/node', '/custom/ogp');
    const nodeIndex = plist.indexOf('<string>/custom/node</string>');
    const ogpIndex = plist.indexOf('<string>/custom/ogp</string>');

    expect(nodeIndex).toBeGreaterThan(-1);
    expect(ogpIndex).toBeGreaterThan(-1);
    expect(nodeIndex).toBeLessThan(ogpIndex);
  });
});

describe('stableNodePath', () => {
  it('rewrites a Homebrew Cellar versioned node path to the stable bin symlink', () => {
    const exec = '/opt/homebrew/Cellar/node/25.6.1/bin/node';
    const stable = '/opt/homebrew/bin/node';
    expect(stableNodePath(exec, (p) => p === stable)).toBe(stable);
  });

  it('handles the /usr/local Intel Homebrew prefix', () => {
    const exec = '/usr/local/Cellar/node/22.1.0/bin/node';
    const stable = '/usr/local/bin/node';
    expect(stableNodePath(exec, (p) => p === stable)).toBe(stable);
  });

  it('handles versioned node@ formulae', () => {
    const exec = '/opt/homebrew/Cellar/node@22/22.14.0/bin/node';
    const stable = '/opt/homebrew/bin/node';
    expect(stableNodePath(exec, (p) => p === stable)).toBe(stable);
  });

  it('keeps the original path when the stable symlink does not exist', () => {
    const exec = '/opt/homebrew/Cellar/node/25.6.1/bin/node';
    expect(stableNodePath(exec, () => false)).toBe(exec);
  });

  it('leaves non-Cellar paths untouched (nvm, system, etc.)', () => {
    const nvm = '/Users/me/.nvm/versions/node/v22.0.0/bin/node';
    expect(stableNodePath(nvm, () => true)).toBe(nvm);
    expect(stableNodePath('/usr/bin/node', () => true)).toBe('/usr/bin/node');
  });
});
