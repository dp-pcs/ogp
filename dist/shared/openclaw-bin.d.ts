/**
 * Resolve the absolute path to the `openclaw` CLI binary.
 *
 * BUG (bd-bq1): The OGP daemon shells out to `openclaw` (e.g. `openclaw gateway
 * call ...` from the bridge) using the bare command name, which relies on PATH.
 * When the daemon is launched by a macOS LaunchAgent (com.dp-pcs.ogp.plist),
 * it inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that EXCLUDES the
 * Homebrew bin dir (/opt/homebrew/bin) where `openclaw` is symlinked. The spawn
 * then fails with `spawn openclaw ENOENT`, so 100% of `sessions.send` calls fail
 * and federated consumer asks silently never reach their target session.
 *
 * Interactive shells work because they DO have /opt/homebrew/bin on PATH — which
 * is why this only ever bit the daemonized path.
 *
 * Fix: resolve the binary explicitly and durably, independent of the ambient
 * PATH, while still falling back to the bare command name so PATH-available
 * environments (dev shells, Linux installs with a global symlink) keep working.
 *
 * Resolution order (first existing wins):
 *   1. Explicit override:  $OPENCLAW_BIN (operator escape hatch / tests).
 *   2. Sibling of the running node binary (process.execPath). The daemon is
 *      started with the same node that ships alongside the `openclaw` symlink
 *      under the same bin dir in a Homebrew/npm-global layout, so this recovers
 *      the Homebrew path even when PATH is stripped.
 *   3. Well-known install locations (Homebrew + /usr/local + npm global-ish).
 *   4. Fall back to the bare command name 'openclaw' (PATH lookup) so nothing
 *      regresses where PATH already works.
 */
export interface ResolveOpenClawBinDeps {
    /** Defaults to process.env. */
    env?: NodeJS.ProcessEnv;
    /** Defaults to process.execPath (the node binary running this daemon). */
    execPath?: string;
    /** Defaults to process.platform. */
    platform?: NodeJS.Platform;
    /** Injectable for tests; defaults to node:fs existsSync. */
    existsSync?: (p: string) => boolean;
}
/**
 * Resolve the command to invoke for the `openclaw` CLI.
 *
 * @returns An absolute path when one can be located, otherwise the bare
 *   command name `'openclaw'` (preserving the legacy PATH-based behavior).
 */
export declare function resolveOpenClawBin(deps?: ResolveOpenClawBinDeps): string;
//# sourceMappingURL=openclaw-bin.d.ts.map