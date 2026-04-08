import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

// Mock modules BEFORE importing anything that uses them
vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    cpSync: vi.fn(),
    renameSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  cpSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../src/shared/meta-config.js', () => ({
  saveMetaConfig: vi.fn(),
}));

import fs from 'node:fs';
import os from 'node:os';
import {
  detectExistingInstallations,
  executeMigration,
  checkMigrationStatus,
  type MigrationPlan,
  type ExistingInstallation,
} from '../src/shared/migration.js';
import type { OGPConfig } from '../src/shared/config.js';

import * as metaConfig from '../src/shared/meta-config.js';

describe('migration', () => {
  const mockHomedir = '/home/testuser';
  const metaConfigPath = path.join(mockHomedir, '.ogp-meta', 'config.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectExistingInstallations', () => {
    it('should return no migration needed when meta config exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === metaConfigPath;
      });

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(false);
      expect(plan.existingInstalls).toHaveLength(0);
      expect(plan.actions).toHaveLength(0);
    });

    it('should detect OpenClaw installation at ~/.ogp', () => {
      const openclawConfig: OGPConfig = {
        platform: 'openclaw',
        daemonPort: 18790,
        openclawUrl: 'https://openclaw.example.com',
        openclawToken: 'token123',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(openclawConfig));

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(true);
      expect(plan.existingInstalls).toHaveLength(1);
      expect(plan.existingInstalls[0].framework).toBe('openclaw');
      expect(plan.existingInstalls[0].path).toBe(path.join(mockHomedir, '.ogp'));
    });

    it('should detect Hermes installation at ~/.ogp-hermes', () => {
      const hermesConfig: OGPConfig = {
        platform: 'hermes',
        daemonPort: 18793,
        openclawUrl: '',
        openclawToken: '',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp-hermes/state',
        hermesWebhookUrl: 'https://hermes.example.com/webhook',
        hermesWebhookSecret: 'secret123',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp-hermes') ||
               pathStr === path.join(mockHomedir, '.ogp-hermes', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(hermesConfig));

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(true);
      expect(plan.existingInstalls).toHaveLength(1);
      expect(plan.existingInstalls[0].framework).toBe('hermes');
      expect(plan.existingInstalls[0].path).toBe(path.join(mockHomedir, '.ogp-hermes'));
    });

    it('should detect standalone installation based on heuristics', () => {
      const standaloneConfig: OGPConfig = {
        daemonPort: 18790,
        openclawUrl: '',
        openclawToken: '',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(standaloneConfig));

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(true);
      expect(plan.existingInstalls).toHaveLength(1);
      expect(plan.existingInstalls[0].framework).toBe('standalone');
    });

    it('should return no migration when no installations exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(false);
      expect(plan.existingInstalls).toHaveLength(0);
      expect(plan.actions).toHaveLength(0);
    });

    it('should handle both OpenClaw and Hermes installations', () => {
      const openclawConfig: OGPConfig = {
        platform: 'openclaw',
        daemonPort: 18790,
        openclawUrl: 'https://openclaw.example.com',
        openclawToken: 'token123',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      const hermesConfig: OGPConfig = {
        platform: 'hermes',
        daemonPort: 18793,
        openclawUrl: '',
        openclawToken: '',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp-hermes/state',
        hermesWebhookUrl: 'https://hermes.example.com/webhook',
        hermesWebhookSecret: 'secret123',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json') ||
               pathStr === path.join(mockHomedir, '.ogp-hermes') ||
               pathStr === path.join(mockHomedir, '.ogp-hermes', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.ogp-hermes')) {
          return JSON.stringify(hermesConfig);
        }
        return JSON.stringify(openclawConfig);
      });

      const plan = detectExistingInstallations();

      expect(plan.needed).toBe(true);
      expect(plan.existingInstalls).toHaveLength(2);
      expect(plan.actions.some(a => a.type === 'rename')).toBe(true);
      expect(plan.actions.some(a => a.type === 'create-meta')).toBe(true);
    });
  });

  describe('migration actions generation', () => {
    it('should generate rename action for OpenClaw at ~/.ogp', () => {
      const openclawConfig: OGPConfig = {
        platform: 'openclaw',
        daemonPort: 18790,
        openclawUrl: 'https://openclaw.example.com',
        openclawToken: 'token123',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(openclawConfig));

      const plan = detectExistingInstallations();

      const renameAction = plan.actions.find(a => a.type === 'rename');
      expect(renameAction).toBeDefined();
      expect(renameAction?.from).toBe(path.join(mockHomedir, '.ogp'));
      expect(renameAction?.to).toBe(path.join(mockHomedir, '.ogp-openclaw'));
      expect(renameAction?.framework).toBe('openclaw');
    });

    it('should not rename standalone installation at ~/.ogp', () => {
      const standaloneConfig: OGPConfig = {
        daemonPort: 18790,
        openclawUrl: '',
        openclawToken: '',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(standaloneConfig));

      const plan = detectExistingInstallations();

      const renameAction = plan.actions.find(a => a.type === 'rename');
      expect(renameAction).toBeUndefined();

      const registerAction = plan.actions.find(a => a.type === 'register');
      expect(registerAction).toBeDefined();
      expect(registerAction?.framework).toBe('standalone');
    });

    it('should generate create-meta action', () => {
      const openclawConfig: OGPConfig = {
        platform: 'openclaw',
        daemonPort: 18790,
        openclawUrl: 'https://openclaw.example.com',
        openclawToken: 'token123',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(openclawConfig));

      const plan = detectExistingInstallations();

      const createMetaAction = plan.actions.find(a => a.type === 'create-meta');
      expect(createMetaAction).toBeDefined();
    });
  });

  describe('executeMigration', () => {
    it('should do nothing when migration is not needed', async () => {
      const plan: MigrationPlan = {
        needed: false,
        existingInstalls: [],
        actions: [],
      };

      await executeMigration(plan);

      expect(fs.renameSync).not.toHaveBeenCalled();
      expect(metaConfig.saveMetaConfig).not.toHaveBeenCalled();
    });

    it('should execute rename action', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp'),
        framework: 'openclaw',
        config: {
          platform: 'openclaw',
          daemonPort: 18790,
          openclawUrl: 'https://openclaw.example.com',
          openclawToken: 'token123',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp/state',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'rename',
            from: path.join(mockHomedir, '.ogp'),
            to: path.join(mockHomedir, '.ogp-openclaw'),
            framework: 'openclaw',
            description: 'Rename ~/.ogp to ~/.ogp-openclaw',
          },
          {
            type: 'create-meta',
            description: 'Create meta config',
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.cpSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
      vi.mocked(metaConfig.saveMetaConfig).mockReturnValue(undefined);

      await executeMigration(plan);

      expect(fs.renameSync).toHaveBeenCalledWith(
        path.join(mockHomedir, '.ogp'),
        path.join(mockHomedir, '.ogp-openclaw')
      );
      expect(metaConfig.saveMetaConfig).toHaveBeenCalled();
    });

    it('should create backup before rename', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp'),
        framework: 'openclaw',
        config: {
          platform: 'openclaw',
          daemonPort: 18790,
          openclawUrl: 'https://openclaw.example.com',
          openclawToken: 'token123',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp/state',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'rename',
            from: path.join(mockHomedir, '.ogp'),
            to: path.join(mockHomedir, '.ogp-openclaw'),
            framework: 'openclaw',
            description: 'Rename ~/.ogp to ~/.ogp-openclaw',
          },
          {
            type: 'create-meta',
            description: 'Create meta config',
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.cpSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
      vi.mocked(metaConfig.saveMetaConfig).mockReturnValue(undefined);

      await executeMigration(plan);

      expect(fs.cpSync).toHaveBeenCalledWith(
        path.join(mockHomedir, '.ogp'),
        expect.stringContaining('.backup-'),
        { recursive: true }
      );
    });

    it('should throw error if target already exists', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp'),
        framework: 'openclaw',
        config: {
          platform: 'openclaw',
          daemonPort: 18790,
          openclawUrl: 'https://openclaw.example.com',
          openclawToken: 'token123',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp/state',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'rename',
            from: path.join(mockHomedir, '.ogp'),
            to: path.join(mockHomedir, '.ogp-openclaw'),
            framework: 'openclaw',
            description: 'Rename ~/.ogp to ~/.ogp-openclaw',
          },
        ],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true); // Target already exists

      await expect(executeMigration(plan)).rejects.toThrow('target already exists');
    });

    it('should register frameworks in meta config', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp-hermes'),
        framework: 'hermes',
        config: {
          platform: 'hermes',
          daemonPort: 18793,
          openclawUrl: '',
          openclawToken: '',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp-hermes/state',
          hermesWebhookUrl: 'https://hermes.example.com/webhook',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'register',
            framework: 'hermes',
            description: 'Register Hermes installation',
          },
          {
            type: 'create-meta',
            description: 'Create meta config',
          },
        ],
      };

      vi.mocked(metaConfig.saveMetaConfig).mockReturnValue(undefined);

      await executeMigration(plan);

      expect(metaConfig.saveMetaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.0.0',
          frameworks: expect.arrayContaining([
            expect.objectContaining({
              id: 'hermes',
              name: 'Hermes',
              enabled: true,
              configDir: path.join(mockHomedir, '.ogp-hermes'),
              daemonPort: 18793,
            }),
          ]),
        })
      );
    });

    it('should set default framework to openclaw if present', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp-openclaw'),
        framework: 'openclaw',
        config: {
          platform: 'openclaw',
          daemonPort: 18790,
          openclawUrl: 'https://openclaw.example.com',
          openclawToken: 'token123',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp-openclaw/state',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'create-meta',
            description: 'Create meta config',
          },
        ],
      };

      vi.mocked(metaConfig.saveMetaConfig).mockReturnValue(undefined);

      await executeMigration(plan);

      expect(metaConfig.saveMetaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          default: 'openclaw',
        })
      );
    });

    it('should set default framework to hermes if openclaw not present', async () => {
      const install: ExistingInstallation = {
        path: path.join(mockHomedir, '.ogp-hermes'),
        framework: 'hermes',
        config: {
          platform: 'hermes',
          daemonPort: 18793,
          openclawUrl: '',
          openclawToken: '',
          gatewayUrl: 'https://gateway.example.com',
          displayName: 'Test Gateway',
          email: 'test@example.com',
          stateDir: '/home/testuser/.ogp-hermes/state',
        },
      };

      const plan: MigrationPlan = {
        needed: true,
        existingInstalls: [install],
        actions: [
          {
            type: 'create-meta',
            description: 'Create meta config',
          },
        ],
      };

      vi.mocked(metaConfig.saveMetaConfig).mockReturnValue(undefined);

      await executeMigration(plan);

      expect(metaConfig.saveMetaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          default: 'hermes',
        })
      );
    });
  });

  describe('checkMigrationStatus', () => {
    it('should return no migration needed when meta config exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === metaConfigPath;
      });

      const status = checkMigrationStatus();

      expect(status.migrationNeeded).toBe(false);
      expect(status.summary).toBe('No migration needed');
      expect(status.plan).toBeUndefined();
    });

    it('should return migration summary when installations found', () => {
      const openclawConfig: OGPConfig = {
        platform: 'openclaw',
        daemonPort: 18790,
        openclawUrl: 'https://openclaw.example.com',
        openclawToken: 'token123',
        gatewayUrl: 'https://gateway.example.com',
        displayName: 'Test Gateway',
        email: 'test@example.com',
        stateDir: '/home/testuser/.ogp/state',
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const pathStr = String(filePath);
        return pathStr === path.join(mockHomedir, '.ogp') ||
               pathStr === path.join(mockHomedir, '.ogp', 'config.json');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(openclawConfig));

      const status = checkMigrationStatus();

      expect(status.migrationNeeded).toBe(true);
      expect(status.summary).toContain('1 existing installation');
      expect(status.summary).toContain('openclaw');
      expect(status.plan).toBeDefined();
    });
  });
});
