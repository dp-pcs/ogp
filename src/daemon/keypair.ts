import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { generateKeyPair, type KeyPair } from '../shared/signing.js';
import { getConfigDir, ensureConfigDir, loadConfig } from '../shared/config.js';

const KEYCHAIN_ACCOUNT = 'private-key';
const KEYPAIR_ENCRYPTION_VERSION = 1;

interface KeychainOptions {
  path?: string;
  passwordFile?: string;
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function getKeychainOptions(): KeychainOptions {
  const envPath = process.env.OGP_KEYCHAIN_PATH?.trim();
  const envPasswordFile = process.env.OGP_KEYCHAIN_PASSWORD_FILE?.trim();

  let configPath: string | undefined;
  let configPasswordFile: string | undefined;
  try {
    const config = loadConfig();
    configPath = config?.keychainPath?.trim() || undefined;
    configPasswordFile = config?.keychainPasswordFile?.trim() || undefined;
  } catch {
    // loadConfig may fail before setup completes — env vars only in that case
  }

  const resolvedPath = envPath || configPath;
  const resolvedPasswordFile = envPasswordFile || configPasswordFile;
  return {
    path: resolvedPath ? expandHome(resolvedPath) : undefined,
    passwordFile: resolvedPasswordFile ? expandHome(resolvedPasswordFile) : undefined
  };
}

let keychainUnlockedFor: string | null = null;

function unlockKeychainIfConfigured(opts: KeychainOptions): void {
  if (!opts.path) {
    return;
  }
  if (!opts.passwordFile) {
    return;
  }
  if (keychainUnlockedFor === opts.path) {
    return;
  }
  if (!fs.existsSync(opts.passwordFile)) {
    throw new Error(`[OGP] Keychain password file not found: ${opts.passwordFile}`);
  }
  const password = fs.readFileSync(opts.passwordFile, 'utf-8').replace(/\r?\n$/, '');
  try {
    execFileSync('security', ['unlock-keychain', '-p', password, opts.path], { stdio: 'pipe' });
    keychainUnlockedFor = opts.path;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[OGP] Failed to unlock keychain at ${opts.path}: ${message}`);
  }
}

interface EncryptedKeypairRecord {
  publicKey: string;
  privateKeyCiphertext: string;
  encryption: {
    version: number;
    scheme: 'aes-256-gcm+scrypt';
    salt: string;
    iv: string;
    authTag: string;
    secretSource: 'env' | 'openclawToken' | 'hermesWebhookSecret';
  };
}

function getKeypairFile(): string {
  return path.join(getConfigDir(), 'keypair.json');
}

// Make keychain service unique per OGP instance to avoid key collision.
// This must resolve at call time so multi-framework commands honor the current OGP_HOME.
function getKeychainService(): string {
  const configDirHash = crypto.createHash('md5').update(getConfigDir()).digest('hex').slice(0, 8);
  return `ogp-federation-${configDirHash}`;
}

// --- macOS Keychain helpers ---

function isMacOS(): boolean {
  return process.platform === 'darwin';
}

function keychainStore(privateKey: string): void {
  const opts = getKeychainOptions();
  unlockKeychainIfConfigured(opts);
  // -A allows non-interactive write to non-default keychains; without it macOS
  // exits with "User interaction is not allowed" and any caller relying on a
  // silent fallback will end up with a private-key-less keypair.json.
  const args = [
    'add-generic-password',
    '-U',
    '-A',
    '-s', getKeychainService(),
    '-a', KEYCHAIN_ACCOUNT,
    '-w', privateKey
  ];
  if (opts.path) {
    args.push(opts.path);
  }
  try {
    execFileSync('security', args, { stdio: 'pipe' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[OGP] Failed to store private key in macOS Keychain: ${message}`);
  }
}

function keychainLoad(): string | null {
  const opts = getKeychainOptions();
  unlockKeychainIfConfigured(opts);

  const buildFindArgs = (service: string): string[] => {
    const args = ['find-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w'];
    if (opts.path) {
      args.push(opts.path);
    }
    return args;
  };

  try {
    const result = execFileSync('security', buildFindArgs(getKeychainService()), { stdio: 'pipe' }).toString().trim();
    return result || null;
  } catch {
    // Migration: try old shared service name (pre-v0.3.4)
    try {
      const oldService = 'ogp-federation';
      const oldResult = execFileSync('security', buildFindArgs(oldService), { stdio: 'pipe' }).toString().trim();
      if (oldResult) {
        console.log(`[OGP] Migrating private key from shared keychain (${oldService}) to instance-specific keychain (${getKeychainService()})`);
        try {
          keychainStore(oldResult);
        } catch (storeErr) {
          const message = storeErr instanceof Error ? storeErr.message : String(storeErr);
          console.warn(`[OGP] Could not migrate private key into instance-specific keychain entry: ${message}`);
        }
        return oldResult;
      }
    } catch {}
    return null;
  }
}

function keychainDelete(): void {
  const opts = getKeychainOptions();
  unlockKeychainIfConfigured(opts);
  const args = ['delete-generic-password', '-s', getKeychainService(), '-a', KEYCHAIN_ACCOUNT];
  if (opts.path) {
    args.push(opts.path);
  }
  try {
    execFileSync('security', args, { stdio: 'pipe' });
  } catch {
    // ignore — may not exist
  }
}

function getKeyEncryptionSecret(): { secret: string; source: 'env' | 'openclawToken' | 'hermesWebhookSecret' } | null {
  const envSecret = process.env.OGP_KEYPAIR_SECRET?.trim();
  if (envSecret) {
    return { secret: envSecret, source: 'env' };
  }

  const config = loadConfig();
  const hermesSecret = config?.hermesWebhookSecret?.trim();
  if (hermesSecret) {
    return { secret: hermesSecret, source: 'hermesWebhookSecret' };
  }

  const openclawToken = config?.openclawToken?.trim();
  if (openclawToken) {
    return { secret: openclawToken, source: 'openclawToken' };
  }

  return null;
}

function isEncryptedKeypairRecord(data: any): data is EncryptedKeypairRecord {
  return Boolean(
    data &&
    typeof data === 'object' &&
    typeof data.publicKey === 'string' &&
    typeof data.privateKeyCiphertext === 'string' &&
    data.encryption &&
    data.encryption.scheme === 'aes-256-gcm+scrypt' &&
    typeof data.encryption.salt === 'string' &&
    typeof data.encryption.iv === 'string' &&
    typeof data.encryption.authTag === 'string'
  );
}

function encryptPrivateKey(privateKey: string, secret: string, source: EncryptedKeypairRecord['encryption']['secretSource']): EncryptedKeypairRecord['encryption'] & { privateKeyCiphertext: string } {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(privateKey, 'utf-8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return {
    version: KEYPAIR_ENCRYPTION_VERSION,
    scheme: 'aes-256-gcm+scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    secretSource: source,
    privateKeyCiphertext: ciphertext.toString('base64')
  };
}

function decryptPrivateKey(record: EncryptedKeypairRecord, secret: string): string {
  const salt = Buffer.from(record.encryption.salt, 'base64');
  const iv = Buffer.from(record.encryption.iv, 'base64');
  const authTag = Buffer.from(record.encryption.authTag, 'base64');
  const ciphertext = Buffer.from(record.privateKeyCiphertext, 'base64');
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf-8');
}

function writeEncryptedKeypairFile(keypairFile: string, keypair: KeyPair, secret: string, source: EncryptedKeypairRecord['encryption']['secretSource']): void {
  const encrypted = encryptPrivateKey(keypair.privateKey, secret, source);
  const record: EncryptedKeypairRecord = {
    publicKey: keypair.publicKey,
    privateKeyCiphertext: encrypted.privateKeyCiphertext,
    encryption: {
      version: encrypted.version,
      scheme: encrypted.scheme,
      salt: encrypted.salt,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      secretSource: encrypted.secretSource
    }
  };

  fs.writeFileSync(keypairFile, JSON.stringify(record, null, 2), 'utf-8');
  fs.chmodSync(keypairFile, 0o600);
}

export function resetKeyPair(): KeyPair {
  ensureConfigDir();

  const keypairFile = getKeypairFile();
  if (fs.existsSync(keypairFile)) {
    fs.unlinkSync(keypairFile);
  }

  if (isMacOS()) {
    keychainDelete();
  }

  return loadOrGenerateKeyPair();
}

// --- Keypair management ---

export function loadOrGenerateKeyPair(): KeyPair {
  ensureConfigDir();
  const keypairFile = getKeypairFile();

  if (fs.existsSync(keypairFile)) {
    const data = JSON.parse(fs.readFileSync(keypairFile, 'utf-8'));

    // Migration: if private key is in file and we're on macOS, move it to Keychain
    if (data.privateKey && isMacOS()) {
      const existing = keychainLoad();
      if (!existing) {
        try {
          keychainStore(data.privateKey);
          console.log('[OGP] Migrated private key to macOS Keychain');
          const safe = { publicKey: data.publicKey };
          fs.writeFileSync(keypairFile, JSON.stringify(safe, null, 2), 'utf-8');
        } catch (keychainErr) {
          const message = keychainErr instanceof Error ? keychainErr.message : String(keychainErr);
          console.warn(`[OGP] Could not migrate private key to macOS Keychain: ${message}`);
          console.warn('[OGP] Leaving private key in keypair.json — set OGP_KEYCHAIN_PATH/OGP_KEYCHAIN_PASSWORD_FILE for headless macOS, or OGP_KEYPAIR_SECRET to encrypt at rest.');
        }
      } else {
        // Already stored in keychain — safe to scrub the file copy.
        const safe = { publicKey: data.publicKey };
        fs.writeFileSync(keypairFile, JSON.stringify(safe, null, 2), 'utf-8');
      }
    }

    // Load private key from Keychain (macOS) or file (other)
    let privateKey: string;
    if (isMacOS()) {
      const fromKeychain = keychainLoad();
      if (fromKeychain) {
        privateKey = fromKeychain;
      } else if (isEncryptedKeypairRecord(data)) {
        // macOS keychain unavailable but a previous run wrote an encrypted file fallback — use it.
        const secretConfig = getKeyEncryptionSecret();
        if (!secretConfig) {
          throw new Error('[OGP] Encrypted private key fallback present but no decryption secret is available. Set OGP_KEYPAIR_SECRET before starting OGP.');
        }
        privateKey = decryptPrivateKey(data, secretConfig.secret);
      } else if (data.privateKey) {
        // Legacy plaintext fallback left behind by a failed migration.
        privateKey = data.privateKey;
      } else {
        throw new Error('[OGP] Private key not found in macOS Keychain. On macOS, keypair.json stores only the public key cache. Run `ogp setup --reset-keypair` to regenerate, or set OGP_KEYCHAIN_PATH/OGP_KEYCHAIN_PASSWORD_FILE to use a dedicated keychain on headless macOS.');
      }
    } else {
      const secretConfig = getKeyEncryptionSecret();

      if (isEncryptedKeypairRecord(data)) {
        if (!secretConfig) {
          throw new Error('[OGP] Encrypted private key present but no decryption secret is available. Set OGP_KEYPAIR_SECRET or configure the platform secret before starting OGP.');
        }
        privateKey = decryptPrivateKey(data, secretConfig.secret);
      } else if (data.privateKey) {
        privateKey = data.privateKey;

        if (secretConfig) {
          writeEncryptedKeypairFile(
            keypairFile,
            { publicKey: data.publicKey, privateKey },
            secretConfig.secret,
            secretConfig.source
          );
          console.log(`[OGP] Migrated private key at rest to encrypted storage (${secretConfig.source})`);
        } else {
          console.warn('[OGP] Private key is stored in legacy plaintext format because no encryption secret is configured. Set OGP_KEYPAIR_SECRET or configure the platform secret, then run `ogp setup --reset-keypair` to harden this instance.');
        }
      } else {
        throw new Error('[OGP] Private key missing from keypair.json on non-macOS platform.');
      }
    }

    return { publicKey: data.publicKey, privateKey };
  }

  // Generate fresh keypair
  const keypair = generateKeyPair();

  if (isMacOS()) {
    // Store private key in Keychain, public key in file only
    try {
      keychainStore(keypair.privateKey);
      fs.writeFileSync(keypairFile, JSON.stringify({ publicKey: keypair.publicKey }, null, 2), 'utf-8');
      console.log(`[OGP] Generated new Ed25519 keypair (private key stored in macOS Keychain service ${getKeychainService()}, public key cached in keypair.json)`);
      return keypair;
    } catch (keychainErr) {
      const message = keychainErr instanceof Error ? keychainErr.message : String(keychainErr);
      console.warn(`[OGP] Could not store private key in macOS Keychain: ${message}`);
      console.warn('[OGP] Falling back to encrypted-file storage. Set OGP_KEYCHAIN_PATH/OGP_KEYCHAIN_PASSWORD_FILE to use a dedicated keychain on headless macOS.');
      // Fall through to the file-based storage path below.
    }
  }

  {
    const secretConfig = getKeyEncryptionSecret();
    if (secretConfig) {
      writeEncryptedKeypairFile(keypairFile, keypair, secretConfig.secret, secretConfig.source);
      console.log(`[OGP] Generated new Ed25519 keypair (private key encrypted at rest using ${secretConfig.source}, file mode 600)`);
    } else {
      // Legacy fallback for standalone or partially configured environments.
      fs.writeFileSync(keypairFile, JSON.stringify(keypair, null, 2), 'utf-8');
      fs.chmodSync(keypairFile, 0o600);
      console.warn('[OGP] Generated new Ed25519 keypair in legacy plaintext storage because no encryption secret is configured. Set OGP_KEYPAIR_SECRET or configure the platform secret to encrypt the private key at rest.');
    }
  }

  return keypair;
}

export function getPublicKey(): string {
  const keypair = loadOrGenerateKeyPair();
  return keypair.publicKey;
}

export function getPrivateKey(): string {
  const keypair = loadOrGenerateKeyPair();
  return keypair.privateKey;
}
