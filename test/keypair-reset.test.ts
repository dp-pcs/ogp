import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser')
  },
  homedir: vi.fn(() => '/home/testuser')
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn()
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn()
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn()
}));

vi.mock('../src/shared/signing.js', () => ({
  generateKeyPair: vi.fn(() => ({
    publicKey: 'public-key-1234567890',
    privateKey: 'private-key-1234567890'
  }))
}));

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadOrGenerateKeyPair, resetKeyPair } from '../src/daemon/keypair.js';

describe('resetKeyPair', () => {
  const originalPlatform = process.platform;
  const configDir = '/tmp/ogp-test';
  const keypairFile = `${configDir}/keypair.json`;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGP_HOME = configDir;
    process.env.OGP_KEYPAIR_SECRET = 'test-encryption-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OGP_HOME;
    delete process.env.OGP_KEYPAIR_SECRET;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
  });

  it('removes the old file and regenerates an encrypted filesystem keypair on non-macOS', () => {
    let keypairExists = true;

    vi.mocked(fs.existsSync).mockImplementation((target: any) => {
      if (target === configDir) {
        return true;
      }
      if (target === keypairFile) {
        return keypairExists;
      }
      return false;
    });

    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      keypairExists = false;
    });

    Object.defineProperty(process, 'platform', {
      value: 'linux'
    });

    const keypair = resetKeyPair();

    expect(fs.unlinkSync).toHaveBeenCalledWith(keypairFile);
    expect(execFileSync).not.toHaveBeenCalled();
    const stored = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
    expect(stored.publicKey).toBe(keypair.publicKey);
    expect(stored.privateKeyCiphertext).toBeTypeOf('string');
    expect(stored.encryption).toMatchObject({
      version: 1,
      scheme: 'aes-256-gcm+scrypt',
      secretSource: 'env'
    });
    expect(fs.chmodSync).toHaveBeenCalledWith(keypairFile, 0o600);
  });

  it('clears the macOS keychain entry before regenerating the keypair', () => {
    let keypairExists = true;

    vi.mocked(fs.existsSync).mockImplementation((target: any) => {
      if (target === configDir) {
        return true;
      }
      if (target === keypairFile) {
        return keypairExists;
      }
      return false;
    });

    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      keypairExists = false;
    });

    Object.defineProperty(process, 'platform', {
      value: 'darwin'
    });

    resetKeyPair();

    expect(fs.unlinkSync).toHaveBeenCalledWith(keypairFile);
    expect(execFileSync).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(execFileSync).mock.calls[0];
    const secondCall = vi.mocked(execFileSync).mock.calls[1];
    expect(firstCall?.[0]).toBe('security');
    expect(firstCall?.[1]).toContain('delete-generic-password');
    expect(secondCall?.[0]).toBe('security');
    expect(secondCall?.[1]).toContain('add-generic-password');
    // -A allows non-interactive write to non-default keychains (Issue #7).
    expect(secondCall?.[1]).toContain('-A');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      keypairFile,
      JSON.stringify({ publicKey: 'public-key-1234567890' }, null, 2),
      'utf-8'
    );
  });

  it('falls back to encrypted-file storage on macOS when keychain store fails (Issue #7 — no private-key-less keypair.json)', () => {
    let keypairExists = false;

    vi.mocked(fs.existsSync).mockImplementation((target: any) => {
      if (target === configDir) {
        return true;
      }
      if (target === keypairFile) {
        return keypairExists;
      }
      return false;
    });

    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      keypairExists = true;
    });

    // Simulate keychain `add-generic-password` failure (the bug from Issue #7).
    vi.mocked(execFileSync).mockImplementation((_cmd: any, args: any) => {
      if (Array.isArray(args) && args.includes('add-generic-password')) {
        throw new Error('User interaction is not allowed');
      }
      return '' as any;
    });

    Object.defineProperty(process, 'platform', {
      value: 'darwin'
    });

    const keypair = loadOrGenerateKeyPair();

    // Did NOT silently write a public-key-only keypair.json — wrote the encrypted record instead.
    const writes = vi.mocked(fs.writeFileSync).mock.calls;
    const lastWrite = writes[writes.length - 1];
    const written = JSON.parse(String(lastWrite?.[1]));
    expect(written.publicKey).toBe(keypair.publicKey);
    expect(written.privateKeyCiphertext).toBeTypeOf('string');
    expect(written.encryption).toMatchObject({
      scheme: 'aes-256-gcm+scrypt',
      secretSource: 'env'
    });
  });

  it('respects OGP_KEYCHAIN_PATH and unlocks via OGP_KEYCHAIN_PASSWORD_FILE (Issue #8)', () => {
    process.env.OGP_KEYCHAIN_PATH = '/tmp/ogp.keychain-db';
    process.env.OGP_KEYCHAIN_PASSWORD_FILE = '/tmp/ogp-keychain-password';

    try {
      let keypairExists = false;

      vi.mocked(fs.existsSync).mockImplementation((target: any) => {
        if (target === configDir) return true;
        if (target === keypairFile) return keypairExists;
        if (target === '/tmp/ogp-keychain-password') return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((target: any) => {
        if (target === '/tmp/ogp-keychain-password') return 'unlock-password\n';
        return '';
      });

      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        keypairExists = true;
      });

      vi.mocked(execFileSync).mockReturnValue('' as any);

      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      loadOrGenerateKeyPair();

      const calls = vi.mocked(execFileSync).mock.calls;
      const unlockCall = calls.find(c => Array.isArray(c[1]) && (c[1] as string[]).includes('unlock-keychain'));
      expect(unlockCall).toBeDefined();
      expect(unlockCall?.[1]).toContain('-p');
      expect(unlockCall?.[1]).toContain('unlock-password');
      expect(unlockCall?.[1]).toContain('/tmp/ogp.keychain-db');

      const addCall = calls.find(c => Array.isArray(c[1]) && (c[1] as string[]).includes('add-generic-password'));
      expect(addCall?.[1]).toContain('/tmp/ogp.keychain-db');
    } finally {
      delete process.env.OGP_KEYCHAIN_PATH;
      delete process.env.OGP_KEYCHAIN_PASSWORD_FILE;
    }
  });

  it('migrates a legacy plaintext non-macOS keypair file to encrypted storage when a secret is available', () => {
    vi.mocked(fs.existsSync).mockImplementation((target: any) => {
      if (target === configDir || target === keypairFile) {
        return true;
      }
      return false;
    });

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      publicKey: 'public-key-1234567890',
      privateKey: 'private-key-1234567890'
    }));

    Object.defineProperty(process, 'platform', {
      value: 'linux'
    });

    const keypair = loadOrGenerateKeyPair();

    expect(keypair).toEqual({
      publicKey: 'public-key-1234567890',
      privateKey: 'private-key-1234567890'
    });
    const rewritten = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
    expect(rewritten.publicKey).toBe('public-key-1234567890');
    expect(rewritten.privateKeyCiphertext).toBeTypeOf('string');
    expect(rewritten.encryption).toMatchObject({
      scheme: 'aes-256-gcm+scrypt',
      secretSource: 'env'
    });
    expect(fs.chmodSync).toHaveBeenCalledWith(keypairFile, 0o600);
  });
});
