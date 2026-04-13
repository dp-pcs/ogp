import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { generateKeyPair } from '../shared/signing.js';
import { getConfigDir, ensureConfigDir, loadConfig } from '../shared/config.js';
const KEYCHAIN_ACCOUNT = 'private-key';
const KEYPAIR_ENCRYPTION_VERSION = 1;
function getKeypairFile() {
    return path.join(getConfigDir(), 'keypair.json');
}
// Make keychain service unique per OGP instance to avoid key collision.
// This must resolve at call time so multi-framework commands honor the current OGP_HOME.
function getKeychainService() {
    const configDirHash = crypto.createHash('md5').update(getConfigDir()).digest('hex').slice(0, 8);
    return `ogp-federation-${configDirHash}`;
}
// --- macOS Keychain helpers ---
function isMacOS() {
    return process.platform === 'darwin';
}
function keychainStore(privateKey) {
    try {
        execSync(`security add-generic-password -U -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT} -w ${JSON.stringify(privateKey)}`, { stdio: 'pipe' });
    }
    catch {
        // ignore — falls back to file
    }
}
function keychainLoad() {
    try {
        // Try new instance-specific service name first
        const result = execSync(`security find-generic-password -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT} -w`, { stdio: 'pipe' }).toString().trim();
        return result || null;
    }
    catch {
        // Migration: try old shared service name (pre-v0.3.4)
        try {
            const oldService = 'ogp-federation'; // Old hardcoded service name
            const oldResult = execSync(`security find-generic-password -s ${oldService} -a ${KEYCHAIN_ACCOUNT} -w`, { stdio: 'pipe' }).toString().trim();
            if (oldResult) {
                console.log(`[OGP] Migrating private key from shared keychain (${oldService}) to instance-specific keychain (${getKeychainService()})`);
                keychainStore(oldResult);
                return oldResult;
            }
        }
        catch { }
        return null;
    }
}
function keychainDelete() {
    try {
        execSync(`security delete-generic-password -s ${getKeychainService()} -a ${KEYCHAIN_ACCOUNT}`, { stdio: 'pipe' });
    }
    catch {
        // ignore — may not exist
    }
}
function getKeyEncryptionSecret() {
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
function isEncryptedKeypairRecord(data) {
    return Boolean(data &&
        typeof data === 'object' &&
        typeof data.publicKey === 'string' &&
        typeof data.privateKeyCiphertext === 'string' &&
        data.encryption &&
        data.encryption.scheme === 'aes-256-gcm+scrypt' &&
        typeof data.encryption.salt === 'string' &&
        typeof data.encryption.iv === 'string' &&
        typeof data.encryption.authTag === 'string');
}
function encryptPrivateKey(privateKey, secret, source) {
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
function decryptPrivateKey(record, secret) {
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
function writeEncryptedKeypairFile(keypairFile, keypair, secret, source) {
    const encrypted = encryptPrivateKey(keypair.privateKey, secret, source);
    const record = {
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
export function resetKeyPair() {
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
export function loadOrGenerateKeyPair() {
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
        let privateKey;
        if (isMacOS()) {
            const fromKeychain = keychainLoad();
            if (!fromKeychain) {
                throw new Error('[OGP] Private key not found in macOS Keychain. On macOS, keypair.json stores only the public key cache. Run `ogp setup --reset-keypair` to regenerate.');
            }
            privateKey = fromKeychain;
        }
        else {
            const secretConfig = getKeyEncryptionSecret();
            if (isEncryptedKeypairRecord(data)) {
                if (!secretConfig) {
                    throw new Error('[OGP] Encrypted private key present but no decryption secret is available. Set OGP_KEYPAIR_SECRET or configure the platform secret before starting OGP.');
                }
                privateKey = decryptPrivateKey(data, secretConfig.secret);
            }
            else if (data.privateKey) {
                privateKey = data.privateKey;
                if (secretConfig) {
                    writeEncryptedKeypairFile(keypairFile, { publicKey: data.publicKey, privateKey }, secretConfig.secret, secretConfig.source);
                    console.log(`[OGP] Migrated private key at rest to encrypted storage (${secretConfig.source})`);
                }
                else {
                    console.warn('[OGP] Private key is stored in legacy plaintext format because no encryption secret is configured. Set OGP_KEYPAIR_SECRET or configure the platform secret, then run `ogp setup --reset-keypair` to harden this instance.');
                }
            }
            else {
                throw new Error('[OGP] Private key missing from keypair.json on non-macOS platform.');
            }
        }
        return { publicKey: data.publicKey, privateKey };
    }
    // Generate fresh keypair
    const keypair = generateKeyPair();
    if (isMacOS()) {
        // Store private key in Keychain, public key in file only
        keychainStore(keypair.privateKey);
        fs.writeFileSync(keypairFile, JSON.stringify({ publicKey: keypair.publicKey }, null, 2), 'utf-8');
        console.log(`[OGP] Generated new Ed25519 keypair (private key stored in macOS Keychain service ${getKeychainService()}, public key cached in keypair.json)`);
    }
    else {
        const secretConfig = getKeyEncryptionSecret();
        if (secretConfig) {
            writeEncryptedKeypairFile(keypairFile, keypair, secretConfig.secret, secretConfig.source);
            console.log(`[OGP] Generated new Ed25519 keypair (private key encrypted at rest using ${secretConfig.source}, file mode 600)`);
        }
        else {
            // Legacy fallback for standalone or partially configured environments.
            fs.writeFileSync(keypairFile, JSON.stringify(keypair, null, 2), 'utf-8');
            fs.chmodSync(keypairFile, 0o600);
            console.warn('[OGP] Generated new Ed25519 keypair in legacy plaintext storage because no encryption secret is configured. Set OGP_KEYPAIR_SECRET or configure the platform secret to encrypt the private key at rest.');
        }
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