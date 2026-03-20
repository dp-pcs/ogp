export interface OGPConfig {
    daemonPort: number;
    openclawUrl: string;
    openclawToken: string;
    gatewayUrl: string;
    displayName: string;
    email: string;
    stateDir: string;
}
export declare function getConfigPath(): string;
export declare function getConfigDir(): string;
export declare function ensureConfigDir(): void;
export declare function loadConfig(): OGPConfig | null;
export declare function saveConfig(config: OGPConfig): void;
export declare function requireConfig(): OGPConfig;
//# sourceMappingURL=config.d.ts.map