import { describe, expect, it } from 'vitest';
import { generatePlist } from '../src/cli/install.js';

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
