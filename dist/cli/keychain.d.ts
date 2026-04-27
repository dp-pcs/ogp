import { Command } from 'commander';
export interface ResolvedKeychain {
    path: string;
    passwordFile: string;
    source: 'env' | 'config' | 'default' | 'flags';
}
export declare function resolveKeychain(options: {
    path?: string;
    passwordFile?: string;
}): ResolvedKeychain;
export declare function keychainInit(options: {
    path?: string;
    passwordFile?: string;
    force?: boolean;
}): void;
export declare function keychainUnlock(options: {
    path?: string;
    passwordFile?: string;
}): void;
export declare function keychainStatus(): void;
export declare const keychainCommand: Command;
//# sourceMappingURL=keychain.d.ts.map