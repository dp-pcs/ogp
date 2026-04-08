import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

// Mock os module BEFORE importing anything that uses it
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import fs from 'node:fs';
import os from 'node:os';
import {
  loadMetaConfig,
  saveMetaConfig,
  getMetaConfigPath,
  getMetaConfigDir,
  ensureMetaConfigDir,
  type MetaConfig,
} from '../src/shared/meta-config.js';

describe('meta-config', () => {
  const mockHomedir = '/home/testuser';
  const expectedMetaConfigDir = path.join(mockHomedir, '.ogp-meta');
  const expectedMetaConfigPath = path.join(expectedMetaConfigDir, 'config.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMetaConfigPath', () => {
    it('should return the correct meta config file path', () => {
      expect(getMetaConfigPath()).toBe(expectedMetaConfigPath);
    });
  });

  describe('getMetaConfigDir', () => {
    it('should return the correct meta config directory path', () => {
      expect(getMetaConfigDir()).toBe(expectedMetaConfigDir);
    });
  });

  describe('ensureMetaConfigDir', () => {
    it('should create directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

      ensureMetaConfigDir();

      expect(fs.existsSync).toHaveBeenCalledWith(expectedMetaConfigDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedMetaConfigDir, { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      ensureMetaConfigDir();

      expect(fs.existsSync).toHaveBeenCalledWith(expectedMetaConfigDir);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('loadMetaConfig', () => {
    it('should return default config when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadMetaConfig();

      expect(config).toEqual({
        version: '1.0.0',
        frameworks: [],
      });
      expect(fs.existsSync).toHaveBeenCalledWith(expectedMetaConfigPath);
    });

    it('should load and parse valid config file', () => {
      const mockConfig: MetaConfig = {
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
        default: 'openclaw',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const config = loadMetaConfig();

      expect(config).toEqual(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedMetaConfigPath, 'utf-8');
    });

    it('should throw error for invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      expect(() => loadMetaConfig()).toThrow('Failed to parse meta config');
    });

    it('should throw error when version field is missing', () => {
      const invalidConfig = {
        frameworks: [],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Meta config missing required field: version');
    });

    it('should throw error when frameworks field is missing', () => {
      const invalidConfig = {
        version: '1.0.0',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Meta config missing or invalid field: frameworks');
    });

    it('should throw error when frameworks is not an array', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: 'not an array',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Meta config missing or invalid field: frameworks');
    });

    it('should validate framework id field', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: [
          {
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Framework missing required field: id');
    });

    it('should validate framework name field', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Framework openclaw missing required field: name');
    });

    it('should validate framework enabled field', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Framework openclaw missing required field: enabled');
    });

    it('should validate framework configDir field', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            daemonPort: 18790,
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Framework openclaw missing required field: configDir');
    });

    it('should validate framework daemonPort field', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadMetaConfig()).toThrow('Framework openclaw missing required field: daemonPort');
    });

    it('should accept optional fields in framework', () => {
      const configWithOptionalFields: MetaConfig = {
        version: '1.0.0',
        frameworks: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            enabled: true,
            configDir: '/home/testuser/.ogp-openclaw',
            daemonPort: 18790,
            gatewayUrl: 'https://example.com',
            displayName: 'Junior @ OpenClaw',
            platform: 'openclaw',
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(configWithOptionalFields));

      const config = loadMetaConfig();

      expect(config).toEqual(configWithOptionalFields);
    });
  });

  describe('saveMetaConfig', () => {
    it('should create directory and save config', () => {
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

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      saveMetaConfig(config);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedMetaConfigDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expectedMetaConfigPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });

    it('should throw error when version is missing', () => {
      const invalidConfig = {
        frameworks: [],
      } as any;

      expect(() => saveMetaConfig(invalidConfig)).toThrow('Cannot save meta config: missing version');
    });

    it('should throw error when frameworks is not an array', () => {
      const invalidConfig = {
        version: '1.0.0',
        frameworks: 'not an array',
      } as any;

      expect(() => saveMetaConfig(invalidConfig)).toThrow('Cannot save meta config: frameworks must be an array');
    });

    it('should save config with aliases and default', () => {
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
        default: 'openclaw',
        aliases: {
          oc: 'openclaw',
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      saveMetaConfig(config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expectedMetaConfigPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });
  });
});
