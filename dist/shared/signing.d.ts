export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateKeyPair(): KeyPair;
export declare function sign(message: string, privateKeyHex: string): string;
export declare function verify(message: string, signatureHex: string, publicKeyHex: string): boolean;
export declare function signObject(obj: any, privateKeyHex: string): {
    payload: any;
    payloadStr: string;
    signature: string;
};
/**
 * Verify a signed object. If payloadStr is provided (the original JSON string used to sign),
 * use that directly to avoid JSON key-order drift across serialization boundaries.
 */
export declare function verifyObject(payload: any, signature: string, publicKeyHex: string, payloadStr?: string): boolean;
//# sourceMappingURL=signing.d.ts.map