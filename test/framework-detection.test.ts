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
  },
  existsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: {
    execFileSync: vi.fn(),
  },
  execFileSync: vi.fn(),
}));

import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  detectFrameworks,
  getPreferredFramework,
  getFrameworkById,
  type DetectedFramework,
} from '../src/shared/framework-detection.js';

describe('framework-detection', () => {
  const mockHomedir = '/home/testuser';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectFrameworks', () => {
    it('should detect OpenClaw when directory exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === path.join(mockHomedir, '.openclaw');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks).toHaveLength(3);
      expect(frameworks[0]).toEqual({
        id: 'openclaw',
        name: 'OpenClaw',
        detected: true,
        suggestedConfigDir: path.join(mockHomedir, '.ogp-openclaw'),
        suggestedPort: 18790,
      });
    });

    it('should detect OpenClaw when command exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation((command: any, args: any) => {
        if (args[0] === 'openclaw') {
          return Buffer.from('/usr/local/bin/openclaw');
        }
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[0].detected).toBe(true);
    });

    it('should not detect OpenClaw when neither directory nor command exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[0].detected).toBe(false);
    });

    it('should detect Hermes when directory exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === path.join(mockHomedir, '.hermes');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[1]).toEqual({
        id: 'hermes',
        name: 'Hermes',
        detected: true,
        suggestedConfigDir: path.join(mockHomedir, '.ogp-hermes'),
        suggestedPort: 18793,
      });
    });

    it('should detect Hermes when command exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation((command: any, args: any) => {
        if (args[0] === 'hermes') {
          return Buffer.from('/usr/local/bin/hermes');
        }
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[1].detected).toBe(true);
    });

    it('should not detect Hermes when neither directory nor command exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[1].detected).toBe(false);
    });

    it('should always detect standalone', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[2]).toEqual({
        id: 'standalone',
        name: 'Standalone',
        detected: true,
        suggestedConfigDir: path.join(mockHomedir, '.ogp'),
        suggestedPort: 18790,
      });
    });

    it('should detect all frameworks when all exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/local/bin/cmd'));

      const frameworks = detectFrameworks();

      expect(frameworks.every(f => f.detected)).toBe(true);
    });

    it('should assign correct ports to frameworks', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const frameworks = detectFrameworks();

      expect(frameworks[0].suggestedPort).toBe(18790); // OpenClaw
      expect(frameworks[1].suggestedPort).toBe(18793); // Hermes
      expect(frameworks[2].suggestedPort).toBe(18790); // Standalone
    });

    it('should use correct command for Windows platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);
      const execFileSyncMock = vi.mocked(execFileSync);

      detectFrameworks();

      expect(execFileSyncMock).toHaveBeenCalledWith('where', expect.any(Array), expect.any(Object));

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('should use which command for non-Windows platforms', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const execFileSyncMock = vi.mocked(execFileSync);

      detectFrameworks();

      expect(execFileSyncMock).toHaveBeenCalledWith('which', expect.any(Array), expect.any(Object));
    });
  });

  describe('getPreferredFramework', () => {
    it('should prefer OpenClaw when detected', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === path.join(mockHomedir, '.openclaw') ||
               filePath === path.join(mockHomedir, '.hermes');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const preferred = getPreferredFramework();

      expect(preferred.id).toBe('openclaw');
    });

    it('should prefer Hermes when OpenClaw is not detected', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return filePath === path.join(mockHomedir, '.hermes');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const preferred = getPreferredFramework();

      expect(preferred.id).toBe('hermes');
    });

    it('should fallback to standalone when no frameworks detected', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const preferred = getPreferredFramework();

      expect(preferred.id).toBe('standalone');
    });
  });

  describe('getFrameworkById', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
    });

    it('should return OpenClaw framework by id', () => {
      const framework = getFrameworkById('openclaw');

      expect(framework).not.toBeNull();
      expect(framework?.id).toBe('openclaw');
      expect(framework?.name).toBe('OpenClaw');
    });

    it('should return Hermes framework by id', () => {
      const framework = getFrameworkById('hermes');

      expect(framework).not.toBeNull();
      expect(framework?.id).toBe('hermes');
      expect(framework?.name).toBe('Hermes');
    });

    it('should return standalone framework by id', () => {
      const framework = getFrameworkById('standalone');

      expect(framework).not.toBeNull();
      expect(framework?.id).toBe('standalone');
      expect(framework?.name).toBe('Standalone');
    });

    it('should return null for unknown framework id', () => {
      const framework = getFrameworkById('unknown');

      expect(framework).toBeNull();
    });
  });
});
