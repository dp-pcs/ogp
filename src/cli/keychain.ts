import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getConfigDir, loadConfig, saveConfig } from '../shared/config.js';

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function ensureMacOS(commandName: string): void {
  if (process.platform !== 'darwin') {
    console.error(`Error: \`ogp keychain ${commandName}\` is only supported on macOS (current platform: ${process.platform}).`);
    process.exit(1);
  }
}

export interface ResolvedKeychain {
  path: string;
  passwordFile: string;
  source: 'env' | 'config' | 'default' | 'flags';
}

export function resolveKeychain(options: { path?: string; passwordFile?: string }): ResolvedKeychain {
  if (options.path && options.passwordFile) {
    return {
      path: expandHome(options.path),
      passwordFile: expandHome(options.passwordFile),
      source: 'flags'
    };
  }

  const envPath = process.env.OGP_KEYCHAIN_PATH?.trim();
  const envPasswordFile = process.env.OGP_KEYCHAIN_PASSWORD_FILE?.trim();
  if (envPath && envPasswordFile) {
    return {
      path: expandHome(envPath),
      passwordFile: expandHome(envPasswordFile),
      source: 'env'
    };
  }

  const config = loadConfig();
  if (config?.keychainPath && config?.keychainPasswordFile) {
    return {
      path: expandHome(config.keychainPath),
      passwordFile: expandHome(config.keychainPasswordFile),
      source: 'config'
    };
  }

  const defaultPath = path.join(getConfigDir(), 'ogp.keychain-db');
  const defaultPasswordFile = path.join(getConfigDir(), 'keychain-password');
  return {
    path: defaultPath,
    passwordFile: defaultPasswordFile,
    source: 'default'
  };
}

export function keychainInit(options: {
  path?: string;
  passwordFile?: string;
  force?: boolean;
}): void {
  ensureMacOS('init');

  const resolved = resolveKeychain(options);

  if (fs.existsSync(resolved.path) && !options.force) {
    console.error(`Error: Keychain already exists at ${resolved.path}`);
    console.error('Use --force to overwrite, or pass --path to use a different location.');
    process.exit(1);
  }

  const passwordExists = fs.existsSync(resolved.passwordFile);
  let password: string;
  if (passwordExists && !options.force) {
    password = fs.readFileSync(resolved.passwordFile, 'utf-8').replace(/\r?\n$/, '');
    console.log(`Reusing existing password file: ${resolved.passwordFile}`);
  } else {
    password = crypto.randomBytes(32).toString('base64url');
    const passwordDir = path.dirname(resolved.passwordFile);
    if (!fs.existsSync(passwordDir)) {
      fs.mkdirSync(passwordDir, { recursive: true });
    }
    fs.writeFileSync(resolved.passwordFile, password + '\n', 'utf-8');
    fs.chmodSync(resolved.passwordFile, 0o600);
    console.log(`Wrote password file: ${resolved.passwordFile} (mode 600)`);
  }

  if (fs.existsSync(resolved.path)) {
    // --force path: remove and recreate
    try {
      execFileSync('security', ['delete-keychain', resolved.path], { stdio: 'pipe' });
    } catch {
      fs.unlinkSync(resolved.path);
    }
  }

  const keychainDir = path.dirname(resolved.path);
  if (!fs.existsSync(keychainDir)) {
    fs.mkdirSync(keychainDir, { recursive: true });
  }

  try {
    execFileSync('security', ['create-keychain', '-p', password, resolved.path], { stdio: 'pipe' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to create keychain at ${resolved.path}: ${message}`);
    process.exit(1);
  }
  console.log(`Created keychain: ${resolved.path}`);

  try {
    execFileSync('security', ['unlock-keychain', '-p', password, resolved.path], { stdio: 'pipe' });
    console.log('Unlocked keychain.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: created keychain but unlock failed: ${message}`);
  }

  // Persist into the active framework's config so the daemon picks it up automatically.
  const config = loadConfig();
  if (config) {
    const updated = { ...config, keychainPath: resolved.path, keychainPasswordFile: resolved.passwordFile };
    saveConfig(updated);
    console.log(`Updated config: keychainPath + keychainPasswordFile written to ${getConfigDir()}/config.json`);
  } else {
    console.log('');
    console.log('No active framework config found. Set these env vars before running ogp:');
    console.log(`  export OGP_KEYCHAIN_PATH=${resolved.path}`);
    console.log(`  export OGP_KEYCHAIN_PASSWORD_FILE=${resolved.passwordFile}`);
  }

  console.log('');
  console.log('Done. Daemon restart will store/load the private key in this keychain.');
}

export function keychainUnlock(options: { path?: string; passwordFile?: string }): void {
  ensureMacOS('unlock');

  const resolved = resolveKeychain(options);

  if (!fs.existsSync(resolved.path)) {
    console.error(`Error: Keychain not found at ${resolved.path}`);
    console.error('Run `ogp keychain init` to create it.');
    process.exit(1);
  }
  if (!fs.existsSync(resolved.passwordFile)) {
    console.error(`Error: Password file not found at ${resolved.passwordFile}`);
    process.exit(1);
  }

  const password = fs.readFileSync(resolved.passwordFile, 'utf-8').replace(/\r?\n$/, '');
  try {
    execFileSync('security', ['unlock-keychain', '-p', password, resolved.path], { stdio: 'pipe' });
    console.log(`Unlocked: ${resolved.path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to unlock keychain: ${message}`);
    process.exit(1);
  }
}

export function keychainStatus(): void {
  ensureMacOS('status');

  const config = loadConfig();
  if (!config) {
    console.log('(no active framework config — showing default paths)');
  }
  const resolved = resolveKeychain({});

  console.log('OGP Keychain Status');
  console.log('━'.repeat(44));
  console.log(`Path:           ${resolved.path}`);
  console.log(`Password file:  ${resolved.passwordFile}`);
  console.log(`Source:         ${resolved.source}`);

  const keychainExists = fs.existsSync(resolved.path);
  console.log(`Keychain file:  ${keychainExists ? 'exists' : 'missing'}`);

  if (fs.existsSync(resolved.passwordFile)) {
    const stat = fs.statSync(resolved.passwordFile);
    const mode = (stat.mode & 0o777).toString(8);
    console.log(`Password mode:  ${mode}${mode === '600' ? ' (ok)' : ' (warning: should be 600)'}`);
  } else {
    console.log('Password mode:  (file missing)');
  }

  if (process.env.OGP_KEYCHAIN_PATH) {
    console.log(`Env override:   OGP_KEYCHAIN_PATH=${process.env.OGP_KEYCHAIN_PATH}`);
  }
  if (config?.keychainPath) {
    console.log(`Config field:   keychainPath=${config.keychainPath}`);
  }

  if (keychainExists) {
    try {
      const out = execFileSync('security', ['show-keychain-info', resolved.path], { stdio: 'pipe' }).toString();
      console.log(`Settings:       ${out.trim()}`);
    } catch {
      // ignore
    }
  }
}

export const keychainCommand = new Command('keychain')
  .description('Manage the dedicated macOS keychain used by OGP for private-key storage');

keychainCommand
  .command('init')
  .description('Create a dedicated keychain + password file and wire it into the active framework config')
  .option('--path <path>', 'Keychain file path (default: <config>/ogp.keychain-db)')
  .option('--password-file <path>', 'Password file path (default: <config>/keychain-password)')
  .option('--force', 'Overwrite an existing keychain at this path')
  .action((options) => {
    keychainInit({
      path: options.path,
      passwordFile: options.passwordFile,
      force: options.force
    });
  });

keychainCommand
  .command('unlock')
  .description('Unlock the configured OGP keychain (useful in SSH sessions and before manual ogp start)')
  .option('--path <path>', 'Keychain path override')
  .option('--password-file <path>', 'Password file path override')
  .action((options) => {
    keychainUnlock({ path: options.path, passwordFile: options.passwordFile });
  });

keychainCommand
  .command('status')
  .description('Show the configured keychain path, password file mode, and lock state')
  .action(() => {
    keychainStatus();
  });
