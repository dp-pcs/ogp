import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, type KeyPair } from '../shared/signing.js';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';

const KEYPAIR_FILE = path.join(getConfigDir(), 'keypair.json');

export function loadOrGenerateKeyPair(): KeyPair {
  ensureConfigDir();

  if (fs.existsSync(KEYPAIR_FILE)) {
    const data = fs.readFileSync(KEYPAIR_FILE, 'utf-8');
    return JSON.parse(data) as KeyPair;
  }

  const keypair = generateKeyPair();
  fs.writeFileSync(KEYPAIR_FILE, JSON.stringify(keypair, null, 2), 'utf-8');
  console.log('[OGP] Generated new Ed25519 keypair');
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
