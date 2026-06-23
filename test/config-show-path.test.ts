import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/shared/meta-config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/meta-config.js')>('../src/shared/meta-config.js');
  return {
    ...actual,
    loadMetaConfig: vi.fn(() => ({
      version: '1.0.0',
      default: 'standalone',
      frameworks: [
        {
          id: 'standalone',
          name: 'Standalone',
          enabled: true,
          configDir: '/tmp/ogp-smoke/standalone',
          daemonPort: 18790
        }
      ],
      aliases: {}
    })),
    getMetaConfigPath: vi.fn(() => '/tmp/ogp-smoke/meta/config.json')
  };
});

vi.mock('../src/shared/framework-detection.js', () => ({
  detectFrameworks: vi.fn(() => [])
}));

import { configCommand } from '../src/cli/config.js';

describe('config show', () => {
  const logLines: string[] = [];

  beforeEach(() => {
    logLines.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the resolved meta config path', async () => {
    await configCommand.parseAsync(['node', 'ogp', 'show']);

    const output = logLines.join('\n');
    expect(output).toContain('Meta config: /tmp/ogp-smoke/meta/config.json');
  });
});
