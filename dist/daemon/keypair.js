import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { generateKeyPair } from '../shared/signing.js';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';
const KEYPAIR_FILE = path.join(getConfigDir(), 'keypair.json');
const KEYCHAIN_SERVICE = 'ogp-federation';
const KEYCHAIN_ACCOUNT = 'private-key';
// --- macOS Keychain helpers ---
function isMacOS() {
    return process.platform === 'darwin';
}
function keychainStore(privateKey) {
    try {
        execSync(`security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -w ${JSON.stringify(privateKey)}`, { stdio: 'pipe' });
    }
    catch {
        // ignore — falls back to file
    }
}
function keychainLoad() {
    try {
        const result = execSync(`security find-generic-password -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -w`, { stdio: 'pipe' }).toString().trim();
        return result || null;
    }
    catch {
        return null;
    }
}
function keychainDelete() {
    try {
        execSync(`security delete-generic-password -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT}`, { stdio: 'pipe' });
    }
    catch {
        // ignore — may not exist
    }
}
// --- Keypair management ---
export function loadOrGenerateKeyPair() {
    ensureConfigDir();
    if (fs.existsSync(KEYPAIR_FILE)) {
        const data = JSON.parse(fs.readFileSync(KEYPAIR_FILE, 'utf-8'));
        // Migration: if private key is in file and we're on macOS, move it to Keychain
        if (data.privateKey && isMacOS()) {
            const existing = keychainLoad();
            if (!existing) {
                keychainStore(data.privateKey);
                console.log('[OGP] Migrated private key to macOS Keychain');
            }
            // Scrub private key from file
            const safe = { publicKey: data.publicKey };
            fs.writeFileSync(KEYPAIR_FILE, JSON.stringify(safe, null, 2), 'utf-8');
        }
        // Load private key from Keychain (macOS) or file (other)
        let privateKey;
        if (isMacOS()) {
            const fromKeychain = keychainLoad();
            if (!fromKeychain) {
                throw new Error('[OGP] Private key not found in Keychain. Run `ogp setup --reset-keypair` to regenerate.');
            }
            privateKey = fromKeychain;
        }
        else {
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
        fs.writeFileSync(KEYPAIR_FILE, JSON.stringify({ publicKey: keypair.publicKey }, null, 2), 'utf-8');
        console.log('[OGP] Generated new Ed25519 keypair (private key stored in macOS Keychain)');
    }
    else {
        // Non-macOS: store full keypair in file (restrict permissions)
        fs.writeFileSync(KEYPAIR_FILE, JSON.stringify(keypair, null, 2), 'utf-8');
        fs.chmodSync(KEYPAIR_FILE, 0o600);
        console.log('[OGP] Generated new Ed25519 keypair (private key stored in keypair.json, mode 600)');
    }
    return keypair;
}
export function getPublicKey() {
    const keypair = loadOrGenerateKeyPair();
    return keypair.publicKey;
}
export function getPrivateKey() {
    const keypair = loadOrGenerateKeyPair();
    return keypair.privateKey;
}
//# sourceMappingURL=keypair.js.map