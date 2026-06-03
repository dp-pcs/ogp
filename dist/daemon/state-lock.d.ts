export declare class StateDirLockedError extends Error {
    readonly holderPid: number | null;
    readonly stateDir: string;
    readonly lockPath: string;
    constructor(stateDir: string, lockPath: string, holderPid: number | null);
}
export interface StateDirLockHandle {
    readonly lockPath: string;
    release(): void;
}
export interface AcquireStateDirLockOptions {
    /** Override for tests: liveness probe. Default uses process.kill(pid, 0). */
    isPidAlive?: (pid: number) => boolean;
    /** Override for tests: PID written into the lockfile. Default process.pid. */
    ownPid?: number;
}
/**
 * Acquire the exclusive stateDir lock. The returned handle MUST be released
 * (or the process exit) when the daemon stops. Throws StateDirLockedError if a
 * live daemon already holds it.
 */
export declare function acquireStateDirLock(stateDir: string, opts?: AcquireStateDirLockOptions): StateDirLockHandle;
//# sourceMappingURL=state-lock.d.ts.map