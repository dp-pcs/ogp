/**
 * Framework configuration entry
 */
export interface Framework {
    id: string;
    name: string;
    enabled: boolean;
    configDir: string;
    daemonPort: number;
    gatewayUrl?: string;
    displayName?: string;
    platform?: string;
}
/**
 * Meta configuration for managing multiple OGP framework installations
 */
export interface MetaConfig {
    version: string;
    frameworks: Framework[];
    default?: string;
    aliases?: Record<string, string>;
}
/**
 * Get the path to the meta config file
 */
export declare function getMetaConfigPath(): string;
/**
 * Get the meta config directory path
 */
export declare function getMetaConfigDir(): string;
/**
 * Ensure the meta config directory exists
 */
export declare function ensureMetaConfigDir(): void;
/**
 * Load the meta configuration
 * Returns sensible defaults if the file doesn't exist
 */
export declare function loadMetaConfig(): MetaConfig;
/**
 * Save the meta configuration
 */
export declare function saveMetaConfig(config: MetaConfig): void;
//# sourceMappingURL=meta-config.d.ts.map