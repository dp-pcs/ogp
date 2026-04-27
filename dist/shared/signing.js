import crypto from 'node:crypto';
export function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    });
    return {
        publicKey: publicKey.toString('hex'),
        privateKey: privateKey.toString('hex')
    };
}
export function sign(message, privateKeyHex) {
    const privateKeyDer = Buffer.from(privateKeyHex, 'hex');
    const privateKey = crypto.createPrivateKey({
        key: privateKeyDer,
        format: 'der',
        type: 'pkcs8'
    });
    const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKey);
    return signature.toString('hex');
}
export function verify(message, signatureHex, publicKeyHex) {
    try {
        const publicKeyDer = Buffer.from(publicKeyHex, 'hex');
        const publicKey = crypto.createPublicKey({
            key: publicKeyDer,
            format: 'der',
            type: 'spki'
        });
        const signature = Buffer.from(signatureHex, 'hex');
        return crypto.verify(null, Buffer.from(message, 'utf-8'), publicKey, signature);
    }
    catch (error) {
        return false;
    }
}
export function signObject(obj, privateKeyHex) {
    const payloadStr = JSON.stringify(obj);
    const signature = sign(payloadStr, privateKeyHex);
    return { payload: obj, payloadStr, signature };
}
/**
 * Verify a signed object. If payloadStr is provided (the original JSON string used to sign),
 * use that directly to avoid JSON key-order drift across serialization boundaries.
 */
export function verifyObject(payload, signature, publicKeyHex, payloadStr) {
    const message = payloadStr ?? JSON.stringify(payload);
    return verify(message, signature, publicKeyHex);
}
/**
 * Sign a canonical envelope. Adds `timestamp` if absent, returns the exact
 * JSON bytes that were signed alongside the signature.
 */
export function signCanonical(payload, privateKeyHex, opts = {}) {
    const timestamp = opts.timestamp ??
        (typeof payload.timestamp === 'string'
            ? (payload.timestamp)
            : new Date().toISOString());
    const stamped = { ...payload, timestamp };
    const payloadStr = JSON.stringify(stamped);
    const signature = sign(payloadStr, privateKeyHex);
    return { payload: stamped, payloadStr, signature };
}
/**
 * Verify a canonical envelope. Returns a structured `{ok, reason}` so each
 * route can map specific failures to the right HTTP status (401 for
 * bad-signature, 401 for stale-timestamp, 400 for missing fields).
 *
 * If both `payload` and `payloadStr` are present, `payloadStr` is the
 * canonical truth — the timestamp is parsed from those bytes, not from
 * the convenience `payload` object, so a sender cannot disagree with their
 * own signed bytes.
 */
export function verifyCanonical(envelope, publicKeyHex, opts = {}) {
    if (!envelope || typeof envelope !== 'object') {
        return { ok: false, reason: 'missing-payload' };
    }
    const { signature, payload, payloadStr } = envelope;
    if (!signature || typeof signature !== 'string') {
        return { ok: false, reason: 'missing-signature' };
    }
    let message;
    let timestamp;
    if (typeof payloadStr === 'string' && payloadStr.length > 0) {
        message = payloadStr;
        try {
            const parsed = JSON.parse(payloadStr);
            timestamp = parsed?.timestamp;
        }
        catch {
            return { ok: false, reason: 'bad-timestamp' };
        }
    }
    else if (payload && typeof payload === 'object') {
        message = JSON.stringify(payload);
        timestamp = payload.timestamp;
    }
    else {
        return { ok: false, reason: 'missing-payload' };
    }
    if (typeof timestamp !== 'string' || timestamp.length === 0) {
        return { ok: false, reason: 'missing-timestamp' };
    }
    const tsMs = Date.parse(timestamp);
    if (Number.isNaN(tsMs)) {
        return { ok: false, reason: 'bad-timestamp' };
    }
    const now = opts.now ?? Date.now();
    const maxAgeMs = opts.maxAgeMs ?? 5 * 60 * 1000;
    if (Math.abs(now - tsMs) > maxAgeMs) {
        return { ok: false, reason: 'stale-timestamp' };
    }
    if (!verify(message, signature, publicKeyHex)) {
        return { ok: false, reason: 'bad-signature' };
    }
    return { ok: true };
}
//# sourceMappingURL=signing.js.map