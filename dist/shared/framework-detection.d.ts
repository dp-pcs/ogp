/**
 * Detected framework information
 */
export interface DetectedFramework {
    id: string;
    name: string;
    detected: boolean;
    suggestedConfigDir: string;
    suggestedPort: number;
}
/**
 * Detect installed AI frameworks
 *
 * @returns Array of detected frameworks with installation status and suggested configuration
 */
export declare function detectFrameworks(): DetectedFramework[];
/**
 * Get the first detected framework (preferred installation)
 * Priority: OpenClaw > Hermes > Standalone
 *
 * @returns The first detected framework, or standalone if none detected
 */
export declare function getPreferredFramework(): DetectedFramework;
/**
 * Get framework by ID
 *
 * @param id Framework ID ('openclaw', 'hermes', or 'standalone')
 * @returns Framework details or null if not found
 */
export declare function getFrameworkById(id: string): DetectedFramework | null;
//# sourceMappingURL=framework-detection.d.ts.map