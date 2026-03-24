import { type OGPConfig } from '../shared/config.js';
export declare function startServer(config?: OGPConfig, background?: boolean): void;
export declare function stopServer(): void;
export declare function getDaemonStatus(): Promise<{
    running: boolean;
    pid?: number;
    portDetected?: boolean;
}>;
//# sourceMappingURL=server.d.ts.map