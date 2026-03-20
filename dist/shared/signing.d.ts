export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateKeyPair(): KeyPair;
export declare function sign(message: string, privateKeyHex: string): string;
export declare function verify(message: string, signatureHex: string, publicKeyHex: string): boolean;
export declare function signObject(obj: any, privateKeyHex: string): {
    payload: any;
    signature: string;
};
export declare function verifyObject(payload: any, signature: string, publicKeyHex: string): boolean;
//# sourceMappingURL=signing.d.ts.map