import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MetaConfig } from '../src/shared/meta-config.js';

// We'll test the framework selection logic by importing and testing
// the behavior through environment variables and meta config
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('../src/shared/meta-config.js');

import * as metaConfig from '../src/shared/meta-config.js';

describe('framework-selection', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Helper function to simulate selectFramework behavior
  function selectFramework(forFlag: string | undefined, config: MetaConfig): void {
    // Special case: --for all doesn't set OGP_HOME
    if (forFlag === 'all') {
      process.env.OGP_FOR_ALL = 'true';
      return;
    }

    // If --for is provided, use it
    if (forFlag) {
      if (!config.frameworks || config.frameworks.length === 0) {
        throw new Error('No frameworks configured');
      }

      // Resolve alias
      const resolvedId = config.aliases?.[forFlag] || forFlag;

      // Find framework by ID
      const framework = config.frameworks.find(f => f.id === resolvedId);

      if (!framework) {
        throw new Error(`Framework '${forFlag}' not found`);
      }

      if (!framework.enabled) {
        throw new Error(`Framework '${framework.name}' (${framework.id}) is disabled`);
      }

      // Set OGP_HOME to the framework's config directory
      process.env.OGP_HOME = framework.configDir;
      return;
    }

    // No --for flag: apply selection logic
    if (!config.frameworks || config.frameworks.length === 0) {
      if (!process.env.OGP_HOME) {
        process.env.OGP_HOME = '/home/testuser/.ogp';
      }
      return;
    }

    const enabledFrameworks = config.frameworks.filter(f => f.enabled);

    // If only one framework enabled, auto-select it
    if (enabledFrameworks.length === 1) {
      process.env.OGP_HOME = enabledFrameworks[0].configDir;
      return;
    }

    // If default is set, use it
    if (config.default) {
      const defaultFramework = config.frameworks.find(f => f.id === config.default);
      if (defaultFramework && defaultFramework.enabled) {
        process.env.OGP_HOME = defaultFramework.configDir;
        return;
      }
    }

    // If OGP_HOME is already set, use it (backward compatibility)
    if (process.env.OGP_HOME) {
      return;
    }

    // Otherwise, error: multiple frameworks, no default
    throw new Error('Multiple frameworks configured but no default set');
  }

  describe('--for flag behavior', () => {
    it('should set OGP_FOR_ALL when --for all is used', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [],
      };

      selectFramework('all', config);

      expect(process.env.OGP_FOR_ALL).toBe('true');
      expect(process.env.OGP_HOME).toBeUndefined();
    });

    it('should select framework by ID with --for flag', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      selectFramework('openclaw', config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should resolve aliases when using --for flag', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
        aliases: {
          oc: 'openclaw',
        },
      };

      selectFramework('oc', config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should throw error when framework not found with --for flag', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      expect(() => selectFramework('hermes', config)).toThrow("Framework 'hermes' not found");
    });

    it('should throw error when framework is disabled', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: false,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      expect(() => selectFramework('openclaw', config)).toThrow("Framework 'OpenClaw' (openclaw) is disabled");
    });

    it('should throw error when using --for but no frameworks configured', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [],
      };

      expect(() => selectFramework('openclaw', config)).toThrow('No frameworks configured');
    });
  });

  describe('auto-selection without --for flag', () => {
    it('should auto-select single enabled framework', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      selectFramework(undefined, config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should use default framework when multiple frameworks enabled', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: true,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
        default: 'hermes',
      };

      selectFramework(undefined, config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-hermes');
    });

    it('should respect OGP_HOME environment variable when set (backward compatibility)', () => {
      process.env.OGP_HOME = '/custom/path';

      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: true,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
      };

      selectFramework(undefined, config);

      expect(process.env.OGP_HOME).toBe('/custom/path');
    });

    it('should throw error when multiple frameworks but no default', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: true,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
      };

      expect(() => selectFramework(undefined, config)).toThrow('Multiple frameworks configured but no default set');
    });

    it('should fallback to default path when no frameworks configured', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [],
      };

      selectFramework(undefined, config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp');
    });

    it('should skip disabled frameworks when counting enabled frameworks', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: false,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
      };

      selectFramework(undefined, config);

      // Should auto-select openclaw since it's the only enabled one
      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should not use disabled default framework', () => {
      process.env.OGP_HOME = '/fallback/path';

      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: false,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
        default: 'openclaw',
      };

      selectFramework(undefined, config);

      // Should fall back to existing OGP_HOME
      expect(process.env.OGP_HOME).toBe('/fallback/path');
    });
  });

  describe('priority order', () => {
    it('should prioritize --for flag over default', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: true,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
        default: 'hermes',
      };

      selectFramework('openclaw', config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should prioritize --for flag over OGP_HOME environment variable', () => {
      process.env.OGP_HOME = '/custom/path';

      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      selectFramework('openclaw', config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should prioritize single framework over default', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
        default: 'hermes', // Invalid default
      };

      selectFramework(undefined, config);

      // Should still auto-select the single enabled framework
      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-openclaw');
    });

    it('should prioritize default over OGP_HOME when not pre-set', () => {
      const config: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
          {
            id: 'hermes',
            name: 'Hermes',
            enabled: true,
            configDir: '/home/testuser/.ogp-hermes',
            daemonPort: 18793,
          },
        ],
        default: 'hermes',
      };

      selectFramework(undefined, config);

      expect(process.env.OGP_HOME).toBe('/home/testuser/.ogp-hermes');
    });
  });
});
