import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type AgentPersona,
  type OGPConfig,
  synthesizePersonas,
  validatePersonas,
  loadConfig,
  saveConfig
} from '../src/shared/config.js';

const tmpRoot = path.join(os.tmpdir(), 'ogp-multi-agent-personas-config');
const configDir = path.join(tmpRoot, 'config');

function baseConfig(extra: Partial<OGPConfig> = {}): OGPConfig {
  return {
    daemonPort: 18790,
    openclawUrl: '',
    openclawToken: '',
    gatewayUrl: 'https://test.example.com',
    displayName: 'Test Gateway',
    email: 'test@example.com',
    stateDir: configDir,
    ...extra
  };
}

describe('synthesizePersonas — legacy synthesis', () => {
  it('synthesizes a single primary persona from agentName', () => {
    const personas = synthesizePersonas(baseConfig({ agentName: 'Junior' }));

    expect(personas).toHaveLength(1);
    expect(personas[0]).toMatchObject({
      id: 'junior',
      displayName: 'Junior',
      role: 'primary',
      hookAgentId: 'main' // primary defaults to 'main' for back-compat
    });
  });

  it('falls back to displayName when agentName is missing', () => {
    const personas = synthesizePersonas(baseConfig({ displayName: 'David - Junior' }));

    expect(personas).toHaveLength(1);
    expect(personas[0].role).toBe('primary');
    expect(personas[0].displayName).toBe('David - Junior');
    // id should be sanitized (lowercase, no spaces, no dashes-from-hyphens issue)
    expect(personas[0].id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('synthesizes when agents is undefined', () => {
    const personas = synthesizePersonas(baseConfig({ agentName: 'Apollo' }));
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe('apollo');
  });

  it('synthesizes when agents is an empty array', () => {
    const personas = synthesizePersonas(baseConfig({ agentName: 'Apollo', agents: [] }));
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe('apollo');
  });

  it('returns existing agents when populated (no synthesis)', () => {
    const explicitAgents: AgentPersona[] = [
      { id: 'junior', displayName: 'Junior', role: 'primary', hookAgentId: 'main' },
      { id: 'sterling', displayName: 'Sterling', role: 'specialist' }
    ];
    const personas = synthesizePersonas(baseConfig({ agents: explicitAgents, agentName: 'Junior' }));

    expect(personas).toHaveLength(2);
    expect(personas).toEqual(explicitAgents);
  });

  it('sanitizes id from messy agentName', () => {
    const personas = synthesizePersonas(baseConfig({ agentName: 'Junior Bot!' }));

    expect(personas[0].id).toBe('junior-bot');
  });

  it('uses fallback id "main" when agentName is empty and displayName has no usable chars', () => {
    const personas = synthesizePersonas(baseConfig({ agentName: '', displayName: '...' }));

    // Should never produce an empty id
    expect(personas[0].id.length).toBeGreaterThan(0);
    expect(personas[0].role).toBe('primary');
  });

  it('preserves displayIcon if specified on existing personas', () => {
    const explicitAgents: AgentPersona[] = [
      { id: 'junior', displayName: 'Junior', role: 'primary', displayIcon: '⭐' }
    ];
    const personas = synthesizePersonas(baseConfig({ agents: explicitAgents }));

    expect(personas[0].displayIcon).toBe('⭐');
  });
});

describe('synthesizePersonas — hookAgentId defaulting (decision #3)', () => {
  it('defaults primary persona hookAgentId to "main" (back-compat)', () => {
    // When synthesized from legacy fields, primary persona MUST get hookAgentId='main'
    // because legacy daemons hardcode agentId='main' in OpenClaw hook calls.
    const personas = synthesizePersonas(baseConfig({ agentName: 'Junior' }));

    expect(personas[0].hookAgentId).toBe('main');
  });

  it('keeps explicit hookAgentId when configured on a primary persona', () => {
    const explicitAgents: AgentPersona[] = [
      { id: 'junior', displayName: 'Junior', role: 'primary', hookAgentId: 'custom-main' }
    ];
    const personas = synthesizePersonas(baseConfig({ agents: explicitAgents }));

    expect(personas[0].hookAgentId).toBe('custom-main');
  });

  it('keeps explicit hookAgentId when configured on a specialist persona', () => {
    const explicitAgents: AgentPersona[] = [
      { id: 'junior', displayName: 'Junior', role: 'primary' },
      { id: 'sterling', displayName: 'Sterling', role: 'specialist', hookAgentId: 'sterling-agent' }
    ];
    const personas = synthesizePersonas(baseConfig({ agents: explicitAgents }));

    expect(personas[1].hookAgentId).toBe('sterling-agent');
  });
});

describe('validatePersonas — primary-role invariant', () => {
  it('accepts exactly one primary with no specialists', () => {
    const result = validatePersonas([
      { id: 'junior', displayName: 'Junior', role: 'primary' }
    ]);

    expect(result.ok).toBe(true);
  });

  it('accepts exactly one primary with multiple specialists', () => {
    const result = validatePersonas([
      { id: 'junior', displayName: 'Junior', role: 'primary' },
      { id: 'sterling', displayName: 'Sterling', role: 'specialist' },
      { id: 'apollo', displayName: 'Apollo', role: 'specialist' }
    ]);

    expect(result.ok).toBe(true);
  });

  it('rejects empty persona array', () => {
    const result = validatePersonas([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/empty|at least one/i);
    }
  });

  it('rejects zero primary personas (all specialists)', () => {
    const result = validatePersonas([
      { id: 'sterling', displayName: 'Sterling', role: 'specialist' },
      { id: 'apollo', displayName: 'Apollo', role: 'specialist' }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/primary/i);
    }
  });

  it('rejects multiple primary personas', () => {
    const result = validatePersonas([
      { id: 'junior', displayName: 'Junior', role: 'primary' },
      { id: 'sterling', displayName: 'Sterling', role: 'primary' }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/exactly one|multiple primary/i);
    }
  });

  it('rejects duplicate persona ids', () => {
    const result = validatePersonas([
      { id: 'junior', displayName: 'Junior', role: 'primary' },
      { id: 'junior', displayName: 'Other Junior', role: 'specialist' }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/duplicate|unique/i);
    }
  });

  it('rejects invalid id format (uppercase, special chars)', () => {
    const result = validatePersonas([
      { id: 'Junior!', displayName: 'Junior', role: 'primary' }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/id|format/i);
    }
  });
});

describe('agents field round-trips through save/load', () => {
  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(configDir, { recursive: true });
    process.env.OGP_HOME = configDir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('persists agents array verbatim through save/load', () => {
    const agents: AgentPersona[] = [
      {
        id: 'junior',
        displayName: 'Junior',
        role: 'primary',
        hookAgentId: 'main',
        displayIcon: '⭐',
        description: 'Main coordination agent',
        skills: ['code', 'ops']
      },
      {
        id: 'sterling',
        displayName: 'Sterling',
        role: 'specialist',
        hookAgentId: 'sterling',
        displayIcon: '💰',
        description: 'Finance and data analysis',
        skills: ['finance', 'data-analysis']
      }
    ];

    saveConfig(baseConfig({ agents }));
    const loaded = loadConfig();

    expect(loaded).not.toBeNull();
    expect(loaded?.agents).toEqual(agents);
  });

  it('omits agents field when not configured (does not write empty default)', () => {
    saveConfig(baseConfig({ agentName: 'Junior' }));
    const loaded = loadConfig();

    expect(loaded).not.toBeNull();
    // We don't auto-populate agents on save; legacy configs stay legacy on disk.
    // synthesizePersonas() handles the runtime fallback.
    expect(loaded?.agents).toBeUndefined();
  });

  it('round-trips minimal persona (id + displayName + role)', () => {
    const agents: AgentPersona[] = [
      { id: 'minimal', displayName: 'Minimal', role: 'primary' }
    ];

    saveConfig(baseConfig({ agents }));
    const loaded = loadConfig();

    expect(loaded?.agents).toEqual(agents);
    // Optional fields should be absent, not coerced to nulls
    expect(loaded?.agents?.[0].displayIcon).toBeUndefined();
    expect(loaded?.agents?.[0].hookAgentId).toBeUndefined();
  });
});
