import fs from 'node:fs';
import path from 'node:path';
/**
 * stateDir-scoped exclusive lock for the OGP daemon (bd-ffl).
 *
 * WHY THIS EXISTS — the write-race the port guard misses:
 * A second `ogp start` on the same stateDir is a data-corruption hazard: both
 * processes hold write FDs to projects.json / peers.json / daemon.log and race
 * each other's whole-file rewrites (observed live 2026-05-31: a rogue dup froze
 * the aicoe-expert-network mirror slice — see docs/escalations/2026-05-31-dup-daemon-write-race.md).
 *
 * A port-only guard is NOT sufficient: the rogue dup failed to bind port 18790
 * (EADDRINUSE) and silently fell back to 18793, yet STILL shared the stateDir
 * and raced the files. Therefore the lock MUST key on the stateDir, not the port.
 *
 * Mechanism: an exclusive lockfile (`daemon.lock`) created with O_EXCL. If it
 * already exists we read the holder PID and check liveness (`process.kill(pid, 0)`):
 *   - holder alive  -> refuse to start (StateDirLockedError, non-zero exit).
 *   - holder dead / file garbage -> reclaim (stale lock recovery) and retry once.
 */
const LOCK_FILENAME = 'daemon.lock';
export class StateDirLockedError extends Error {
    holderPid;
    stateDir;
    lockPath;
    constructor(stateDir, lockPath, holderPid) {
        const who = holderPid != null ? `PID ${holderPid}` : 'an unknown process';
        super(`Another OGP daemon (${who}) is already running on stateDir ${stateDir}. ` +
            `Refusing to start a second instance (would race projects.json/peers.json). ` +
            `Stop it first ('ogp stop') or remove a stale lock at ${lockPath} only if no daemon is running.`);
        this.name = 'StateDirLockedError';
        this.holderPid = holderPid;
        this.stateDir = stateDir;
        this.lockPath = lockPath;
    }
}
function defaultIsPidAlive(pid) {
    try {
        process.kill(pid, 0); // signal 0 = existence/permission check, no actual signal
        return true;
    }
    catch (err) {
        // EPERM => process exists but owned by another user; treat as alive.
        return err?.code === 'EPERM';
    }
}
function readHolderPid(lockPath) {
    try {
        const raw = fs.readFileSync(lockPath, 'utf-8').trim();
        const pid = parseInt(raw, 10);
        return Number.isNaN(pid) ? null : pid;
    }
    catch {
        return null;
    }
}
/**
 * Acquire the exclusive stateDir lock. The returned handle MUST be released
 * (or the process exit) when the daemon stops. Throws StateDirLockedError if a
 * live daemon already holds it.
 */
export function acquireStateDirLock(stateDir, opts = {}) {
    const isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;
    const ownPid = opts.ownPid ?? process.pid;
    const lockPath = path.join(stateDir, LOCK_FILENAME);
    fs.mkdirSync(stateDir, { recursive: true });
    // Two attempts max: first try; if a STALE lock is found, reclaim and retry once.
    for (let attempt = 0; attempt < 2; attempt++) {
        let fd;
        try {
            fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL | O_WRONLY
        }
        catch (err) {
            if (err?.code !== 'EEXIST')
                throw err;
            // Lock exists — is the holder alive?
            const holderPid = readHolderPid(lockPath);
            if (holderPid != null && holderPid !== ownPid && isPidAlive(holderPid)) {
                throw new StateDirLockedError(stateDir, lockPath, holderPid);
            }
            // Stale (dead holder), garbage, or our own leftover PID — reclaim it.
            try {
                fs.unlinkSync(lockPath);
            }
            catch { /* lost a race; retry loop handles it */ }
            continue;
        }
        try {
            fs.writeFileSync(fd, String(ownPid), 'utf-8');
        }
        finally {
            fs.closeSync(fd);
        }
        let released = false;
        return {
            lockPath,
            release() {
                if (released)
                    return;
                released = true;
                // Only remove the lock if WE still own it (avoid clobbering a successor).
                const current = readHolderPid(lockPath);
                if (current === ownPid) {
                    try {
                        fs.unlinkSync(lockPath);
                    }
                    catch { /* best effort */ }
                }
            }
        };
    }
    // Both attempts hit a live holder (race with another reclaimer): refuse.
    throw new StateDirLockedError(stateDir, lockPath, readHolderPid(lockPath));
}
//# sourceMappingURL=state-lock.js.map