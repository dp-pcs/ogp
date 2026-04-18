import { type OGPConfig } from '../shared/config.js';
interface ShutdownDeps {
    disconnectBridge: () => void;
    stopDoormanCleanup: () => void;
    stopReplyCleanup: () => void;
    stopRendezvous: () => Promise<void>;
    stopHeartbeat: () => void;
    getServer: () => {
        close: (cb: (error?: Error) => void) => void;
    } | null;
    exit: (code: number) => never;
    setTimer: typeof setTimeout;
    clearTimer: typeof clearTimeout;
    logError: (message?: any, ...optionalParams: any[]) => void;
}
export declare function createGracefulShutdownHandler(deps: ShutdownDeps): (signal: "SIGTERM" | "SIGINT") => Promise<void>;
export declare function resetGracefulShutdownStateForTests(): void;
export declare function startServer(config?: OGPConfig, background?: boolean): void;
export declare function stopServer(): void;
export declare function getDaemonStatus(): Promise<{
    running: boolean;
    pid?: number;
    portDetected?: boolean;
}>;
export {};
//# sourceMappingURL=server.d.ts.map