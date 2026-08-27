import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type PackageManifest = {
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
};

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest;

describe('package installation consent', () => {
  it('does not mutate agent configuration from an npm lifecycle hook', () => {
    expect(manifest.scripts?.preinstall).toBeUndefined();
    expect(manifest.scripts?.install).toBeUndefined();
    expect(manifest.scripts?.postinstall).toBeUndefined();
  });

  it('keeps skill installation available as an explicit command', () => {
    expect(manifest.bin?.['ogp-install-skills']).toBe('scripts/install-skills.js');
  });
});
