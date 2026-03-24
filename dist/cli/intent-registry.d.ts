interface RegisterOptions {
    script?: string;
    description: string;
}
export declare function registerNewIntent(name: string, options: RegisterOptions): void;
export declare function listRegisteredIntents(): void;
export declare function removeIntent(name: string): void;
export {};
//# sourceMappingURL=intent-registry.d.ts.map