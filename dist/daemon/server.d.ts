import { type OGPConfig } from '../shared/config.js';
export declare function startServer(config?: OGPConfig, background?: boolean): void;
export declare function stopServer(): void;
export declare function getDaemonStatus(): {
    running: boolean;
    pid?: number;
};
//# sourceMappingURL=server.d.ts.map