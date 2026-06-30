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

import fsDefault from 'node:fs';
import pathDefault from 'node:path';

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
 * Candidate absolute locations to probe, in priority order, AFTER the env
 * override and the execPath sibling. Unix-style; on win32 we just fall through
 * to the bare command (PATH) since the LaunchAgent failure mode is macOS-only.
 */
const WELL_KNOWN_UNIX_BIN_DIRS = [
  '/opt/homebrew/bin', // Apple-silicon Homebrew (the bd-bq1 failure dir)
  '/usr/local/bin', // Intel Homebrew / common npm-global prefix
  '/usr/bin', // distro global installs
];

/**
 * Resolve the command to invoke for the `openclaw` CLI.
 *
 * @returns An absolute path when one can be located, otherwise the bare
 *   command name `'openclaw'` (preserving the legacy PATH-based behavior).
 */
export function resolveOpenClawBin(deps: ResolveOpenClawBinDeps = {}): string {
  const env = deps.env ?? process.env;
  const execPath = deps.execPath ?? process.execPath;
  const platform = deps.platform ?? process.platform;
  const existsSync = deps.existsSync ?? fsDefault.existsSync;

  const binName = platform === 'win32' ? 'openclaw.cmd' : 'openclaw';

  // 1. Explicit operator override. Trust it if it points at a real file.
  const override = env.OPENCLAW_BIN?.trim();
  if (override) {
    if (safeExists(existsSync, override)) {
      return override;
    }
    // An override that doesn't exist is a misconfiguration; fall through to
    // discovery rather than guaranteeing an ENOENT.
  }

  // 2. Canonical well-known install locations (unix only). These are checked by
  //    absolute path via existsSync, so they work even under the stripped PATH a
  //    LaunchAgent inherits (the bd-bq1 failure mode). The package-manager-managed
  //    symlink (/opt/homebrew/bin/openclaw) is the user's REAL, current binary, so
  //    it MUST win over an incidental node-sibling — on a machine with a leftover
  //    `openclaw` next to an old node Cellar build, sibling-first would silently
  //    pin the daemon to a stale openclaw (observed: Cellar sibling = 2026.4.15 vs
  //    canonical /opt/homebrew/bin = 2026.6.1).
  if (platform !== 'win32') {
    for (const dir of WELL_KNOWN_UNIX_BIN_DIRS) {
      const candidate = pathDefault.join(dir, 'openclaw');
      if (safeExists(existsSync, candidate)) {
        return candidate;
      }
    }
  }

  // 3. Sibling of the running node binary. Fallback for non-standard layouts where
  //    openclaw isn't in a well-known dir but lives in the same bin dir as the node
  //    that runs us (self-contained node/npm-global prefixes).
  if (execPath) {
    const sibling = pathDefault.join(pathDefault.dirname(execPath), binName);
    if (safeExists(existsSync, sibling)) {
      return sibling;
    }
  }

  // 4. Last resort: bare command name, resolved via PATH at spawn time. This
  //    preserves the historical behavior for environments where PATH already
  //    contains the binary (dev shells, most Linux setups).
  return 'openclaw';
}

function safeExists(existsSync: (p: string) => boolean, p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

export interface OpenClawSpawnEnvDeps {
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to process.execPath (the node binary running this daemon). */
  execPath?: string;
  /** Defaults to process.platform. */
  platform?: NodeJS.Platform;
}

/**
 * Build the environment for spawning the `openclaw` CLI from the daemon.
 *
 * BUG (bd-wpdw): bd-bq1 fixed `spawn openclaw ENOENT` by resolving the binary's
 * absolute path, but the `openclaw` CLI is a JS entrypoint with a
 * `#!/usr/bin/env node` shebang. Under a macOS LaunchAgent the daemon inherits a
 * minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that EXCLUDES the bin dir holding
 * `node`, so the resolved binary launches but its shebang's `env node` dies with
 * `env: node: No such file or directory` — dropping every cosmetic sync-note.
 *
 * Fix: prepend the directory of the running node binary (process.execPath) and
 * the well-known Homebrew bin dir to PATH for the child. process.execPath is the
 * exact node running the daemon, so its dirname is guaranteed to contain `node`;
 * the shebang then resolves. We only PREPEND (never replace) so any PATH the
 * environment already provides is preserved.
 */
export function buildOpenClawSpawnEnv(deps: OpenClawSpawnEnvDeps = {}): NodeJS.ProcessEnv {
  const env = deps.env ?? process.env;
  const execPath = deps.execPath ?? process.execPath;
  const platform = deps.platform ?? process.platform;

  // win32 uses `openclaw.cmd` (no env-node shebang) and the LaunchAgent failure
  // mode is macOS-only, so leave the env untouched there.
  if (platform === 'win32') {
    return { ...env };
  }

  const sep = ':';
  const prepend: string[] = [];

  if (execPath) {
    prepend.push(pathDefault.dirname(execPath));
  }
  for (const dir of WELL_KNOWN_UNIX_BIN_DIRS) {
    prepend.push(dir);
  }

  const existing = env.PATH ? env.PATH.split(sep).filter(Boolean) : [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const dir of [...prepend, ...existing]) {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      merged.push(dir);
    }
  }

  return { ...env, PATH: merged.join(sep) };
}
