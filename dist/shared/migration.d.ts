import type { OGPConfig } from './config.js';
/**
 * Type of framework installation
 */
export type FrameworkType = 'openclaw' | 'hermes' | 'standalone';
/**
 * Existing installation detected
 */
export interface ExistingInstallation {
    path: string;
    framework: FrameworkType;
    config: OGPConfig;
}
/**
 * Migration action types
 */
export type MigrationActionType = 'rename' | 'create-meta' | 'register';
/**
 * Individual migration action
 */
export interface MigrationAction {
    type: MigrationActionType;
    from?: string;
    to?: string;
    framework?: FrameworkType;
    description: string;
}
/**
 * Complete migration plan
 */
export interface MigrationPlan {
    needed: boolean;
    existingInstalls: ExistingInstallation[];
    actions: MigrationAction[];
}
/**
 * Detect all existing OGP installations
 * Returns a migration plan describing what needs to be done
 */
export declare function detectExistingInstallations(): MigrationPlan;
/**
 * Execute the migration plan
 * This will:
 * - Rename directories as needed
 * - Create the meta config
 * - Register all frameworks
 */
export declare function executeMigration(plan: MigrationPlan): Promise<void>;
/**
 * Check if migration is needed and return a summary
 */
export declare function checkMigrationStatus(): {
    migrationNeeded: boolean;
    summary: string;
    plan?: MigrationPlan;
};
//# sourceMappingURL=migration.d.ts.map