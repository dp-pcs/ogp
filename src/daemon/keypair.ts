import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { generateKeyPair, type KeyPair } from '../shared/signing.js';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';

const KEYCHAIN_ACCOUNT = 'private-key';

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
  try {
    execSync(
      `security add-generic-password -U -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT} -w ${JSON.stringify(privateKey)}`,
      { stdio: 'pipe' }
    );
  } catch {
    // ignore — falls back to file
  }
}

function keychainLoad(): string | null {
  try {
    // Try new instance-specific service name first
    const result = execSync(
      `security find-generic-password -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT} -w`,
      { stdio: 'pipe' }
    ).toString().trim();
    return result || null;
  } catch {
    // Migration: try old shared service name (pre-v0.3.4)
    try {
      const oldService = 'ogp-federation';  // Old hardcoded service name
      const oldResult = execSync(
        `security find-generic-password -s ${oldService} -a ${KEYCHAIN_ACCOUNT} -w`,
        { stdio: 'pipe' }
      ).toString().trim();
      if (oldResult) {
        console.log(`[OGP] Migrating private key from shared keychain (${oldService}) to instance-specific keychain (${getKeychainService()})`);
        keychainStore(oldResult);
        return oldResult;
      }
    } catch {}
    return null;
  }
}

function keychainDelete(): void {
  try {
    execSync(
      `security delete-generic-password -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT}`,
      { stdio: 'pipe' }
    );
  } catch {
    // ignore — may not exist
  }
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
        keychainStore(data.privateKey);
        console.log('[OGP] Migrated private key to macOS Keychain');
      }
      // Scrub private key from file
      const safe = { publicKey: data.publicKey };
      fs.writeFileSync(keypairFile, JSON.stringify(safe, null, 2), 'utf-8');
    }

    // Load private key from Keychain (macOS) or file (other)
    let privateKey: string;
    if (isMacOS()) {
      const fromKeychain = keychainLoad();
      if (!fromKeychain) {
        throw new Error('[OGP] Private key not found in Keychain. Run `ogp setup --reset-keypair` to regenerate.');
      }
      privateKey = fromKeychain;
    } else {
      if (!data.privateKey) {
        throw new Error('[OGP] Private key missing from keypair.json on non-macOS platform.');
      }
      privateKey = data.privateKey;
    }

    return { publicKey: data.publicKey, privateKey };
  }

  // Generate fresh keypair
  const keypair = generateKeyPair();

  if (isMacOS()) {
    // Store private key in Keychain, public key in file only
    keychainStore(keypair.privateKey);
    fs.writeFileSync(keypairFile, JSON.stringify({ publicKey: keypair.publicKey }, null, 2), 'utf-8');
    console.log('[OGP] Generated new Ed25519 keypair (private key stored in macOS Keychain)');
  } else {
    // Non-macOS: store full keypair in file (restrict permissions)
    fs.writeFileSync(keypairFile, JSON.stringify(keypair, null, 2), 'utf-8');
    fs.chmodSync(keypairFile, 0o600);
    console.log('[OGP] Generated new Ed25519 keypair (private key stored in keypair.json, mode 600)');
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
