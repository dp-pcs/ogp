import crypto from 'node:crypto';

export interface KeyPair {
  publicKey: string;  // hex-encoded
  privateKey: string; // hex-encoded
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  return {
    publicKey: publicKey.toString('hex'),
    privateKey: privateKey.toString('hex')
  };
}

export function sign(message: string, privateKeyHex: string): string {
  const privateKeyDer = Buffer.from(privateKeyHex, 'hex');
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKey);
  return signature.toString('hex');
}

export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const publicKeyDer = Buffer.from(publicKeyHex, 'hex');
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });

    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf-8'), publicKey, signature);
  } catch (error) {
    return false;
  }
}

export function signObject(obj: any, privateKeyHex: string): { payload: any; payloadStr: string; signature: string } {
  const payloadStr = JSON.stringify(obj);
  const signature = sign(payloadStr, privateKeyHex);
  return { payload: obj, payloadStr, signature };
}

/**
 * Verify a signed object. If payloadStr is provided (the original JSON string used to sign),
 * use that directly to avoid JSON key-order drift across serialization boundaries.
 */
export function verifyObject(payload: any, signature: string, publicKeyHex: string, payloadStr?: string): boolean {
  const message = payloadStr ?? JSON.stringify(payload);
  return verify(message, signature, publicKeyHex);
}
