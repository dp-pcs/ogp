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
  execSync: vi.fn()
}));

vi.mock('../src/shared/signing.js', () => ({
  generateKeyPair: vi.fn(() => ({
    publicKey: 'public-key-1234567890',
    privateKey: 'private-key-1234567890'
  }))
}));

import fs from 'node:fs';
import { execSync } from 'node:child_process';
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
    expect(execSync).not.toHaveBeenCalled();
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
    expect(execSync).toHaveBeenCalledTimes(2);
    expect(vi.mocked(execSync).mock.calls[0]?.[0]).toContain('security delete-generic-password');
    expect(vi.mocked(execSync).mock.calls[1]?.[0]).toContain('security add-generic-password');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      keypairFile,
      JSON.stringify({ publicKey: 'public-key-1234567890' }, null, 2),
      'utf-8'
    );
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
