import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * Detected framework information
 */
export interface DetectedFramework {
  id: string;
  name: string;
  detected: boolean;
  suggestedConfigDir: string;
  suggestedPort: number;
}

/**
 * Check if a command exists in PATH
 * Uses which/where command (safe, no shell injection risk)
 */
function commandExists(command: string): boolean {
  try {
    const whichCommand = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCommand, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if OpenClaw is installed
 */
function isOpenClawInstalled(): boolean {
  const openclawDir = path.join(os.homedir(), '.openclaw');
  return fs.existsSync(openclawDir) || commandExists('openclaw');
}

/**
 * Check if Hermes is installed
 */
function isHermesInstalled(): boolean {
  const hermesDir = path.join(os.homedir(), '.hermes');
  return fs.existsSync(hermesDir) || commandExists('hermes');
}

/**
 * Detect installed AI frameworks
 *
 * @returns Array of detected frameworks with installation status and suggested configuration
 */
export function detectFrameworks(): DetectedFramework[] {
  const openclawDetected = isOpenClawInstalled();
  const hermesDetected = isHermesInstalled();

  return [
    {
      id: 'openclaw',
      name: 'OpenClaw',
      detected: openclawDetected,
      suggestedConfigDir: path.join(os.homedir(), '.ogp-openclaw'),
      suggestedPort: 18790,
    },
    {
      id: 'hermes',
      name: 'Hermes',
      detected: hermesDetected,
      suggestedConfigDir: path.join(os.homedir(), '.ogp-hermes'),
      suggestedPort: 18793,
    },
    {
      id: 'standalone',
      name: 'Standalone',
      detected: true, // Always available as fallback
      suggestedConfigDir: path.join(os.homedir(), '.ogp'),
      suggestedPort: 18790,
    },
  ];
}

/**
 * Get the first detected framework (preferred installation)
 * Priority: OpenClaw > Hermes > Standalone
 *
 * @returns The first detected framework, or standalone if none detected
 */
export function getPreferredFramework(): DetectedFramework {
  const frameworks = detectFrameworks();

  // Return first detected framework (OpenClaw has priority, then Hermes)
  const detected = frameworks.find(f => f.id !== 'standalone' && f.detected);
  if (detected) {
    return detected;
  }

  // Fallback to standalone
  return frameworks.find(f => f.id === 'standalone')!;
}

/**
 * Get framework by ID
 *
 * @param id Framework ID ('openclaw', 'hermes', or 'standalone')
 * @returns Framework details or null if not found
 */
export function getFrameworkById(id: string): DetectedFramework | null {
  const frameworks = detectFrameworks();
  return frameworks.find(f => f.id === id) || null;
}
