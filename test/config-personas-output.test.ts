import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OGPConfig } from '../src/shared/config.js';

let mockConfig: OGPConfig;
let mockMeta: {
  default?: string;
  frameworks: Array<{ id: string; name: string; configDir: string; enabled: boolean }>;
};

vi.mock('../src/shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/config.js')>('../src/shared/config.js');
  return {
    ...actual,
    requireConfig: vi.fn(() => mockConfig)
  };
});

vi.mock('../src/shared/meta-config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/meta-config.js')>('../src/shared/meta-config.js');
  return {
    ...actual,
    loadMetaConfig: vi.fn(() => mockMeta),
    saveMetaConfig: vi.fn()
  };
});

import { listAgents, whoami } from '../src/cli/config.js';

describe('persona output commands', () => {
  const logLines: string[] = [];

  beforeEach(() => {
    mockConfig = {
      daemonPort: 18790,
      openclawUrl: 'http://localhost:18789',
      openclawToken: 'token',
      gatewayUrl: 'https://ogp.example.com',
      displayName: 'David - Junior',
      email: 'david@example.com',
      stateDir: '/tmp/ogp-openclaw',
      platform: 'openclaw',
      humanName: 'David',
      agentName: 'Junior',
      organization: 'latentgenius',
      agents: [
        { id: 'junior', displayName: 'Junior', role: 'primary', hookAgentId: 'main' },
        { id: 'scribe', displayName: 'Scribe', role: 'specialist', hookAgentId: 'scribe' }
      ]
    };
    mockMeta = {
      default: 'openclaw',
      frameworks: [
        { id: 'openclaw', name: 'OpenClaw', configDir: '/tmp/ogp-openclaw', enabled: true }
      ]
    };
    logLines.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('whoami shows local personas and hookAgentIds', () => {
    whoami();

    const output = logLines.join('\n');
    expect(output).toContain('Personas:');
    expect(output).toContain('* junior');
    expect(output).toContain('hookAgentId: main');
    expect(output).toContain('- scribe');
    expect(output).toContain('hookAgentId: scribe');
  });

  it('listAgents quiet mode prints persona ids only', () => {
    listAgents(true);

    expect(logLines).toEqual(['junior', 'scribe']);
  });
});
