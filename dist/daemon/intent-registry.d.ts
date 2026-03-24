export interface Intent {
    name: string;
    description: string;
    schema?: Record<string, any>;
    handler?: string;
}
export declare function loadIntents(): Intent[];
export declare function saveIntents(intents: Intent[]): void;
export declare function registerIntent(intent: Intent): void;
export declare function getIntent(name: string): Intent | null;
export declare function removeIntent(name: string): boolean;
export declare function listIntents(): Intent[];
//# sourceMappingURL=intent-registry.d.ts.map