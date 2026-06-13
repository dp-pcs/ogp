/**
 * `ogp app` — manage OGP Apps (declarative ogp-app.json bundles).
 *
 * Subcommands here: list / show / install / remove. (browse / usage / advertise
 * arrive in later phases.) The install/remove *logic* is factored into pure,
 * dependency-injected functions (`installApp`, `uninstallApp`) so it is testable
 * without spawning a real prompt or shell — the commander wrappers supply the
 * real readline confirm + child_process runner.
 *
 * Trust model (v1, locked decision): install runs the manifest's installs_skills
 * scripts after an explicit per-install consent gate (--yes bypasses). No sandbox
 * — same trust posture as `ogp intent register` handler scripts. The consent gate
 * shows exactly which scripts run and where skills land before anything executes.
 *
 * Spec: docs/superpowers/specs/2026-06-13-ogp-apps-layer-spec.md
 */
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { validateManifest, type AppManifest } from '../shared/app-manifest.js';
import {
  loadApps,
  addApp,
  getApp,
  removeApp as removeAppFromRegistry,
  type RegisteredApp,
  type AppSource,
} from '../daemon/app-registry.js';

/** Resolve an install ref to a local directory holding ogp-app.json + scripts.
 *  Only `file:` is wired in P3; github:/peer: are resolved in later phases. */
export interface ResolvedSource {
  /** Absolute directory that contains ogp-app.json and the install scripts. */
  dir: string;
  source: AppSource;
}

export class AppInstallError extends Error {}

/** Parse + locate the App source. P3 supports `file:/abs/path` (or a bare path). */
export function resolveSource(ref: string): ResolvedSource {
  let dir: string;
  let source: AppSource;
  if (ref.startsWith('file:')) {
    dir = ref.slice('file:'.length);
    source = `file:${dir}`;
  } else if (ref.startsWith('github:') || ref.startsWith('peer:')) {
    throw new AppInstallError(
      `Source '${ref.split(':')[0]}:' is not supported yet (P3 supports file:). ` +
      `github: lands with remote fetch; peer: lands with peer discovery (P5).`
    );
  } else {
    // Treat a bare argument as a local path for convenience.
    dir = ref;
    source = `file:${path.resolve(ref)}`;
  }
  dir = path.resolve(dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new AppInstallError(`App directory not found: ${dir}`);
  }
  return { dir, source };
}

/** Read + validate the ogp-app.json from a resolved source dir. */
export function readManifest(dir: string): AppManifest {
  const manifestPath = path.join(dir, 'ogp-app.json');
  if (!fs.existsSync(manifestPath)) {
    throw new AppInstallError(`No ogp-app.json in ${dir}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    throw new AppInstallError(`ogp-app.json is not valid JSON: ${(e as Error).message}`);
  }
  const result = validateManifest(raw);
  if (!result.ok || !result.manifest) {
    throw new AppInstallError(`Invalid manifest:\n  - ${result.errors.join('\n  - ')}`);
  }
  return result.manifest;
}

/** A human-readable summary of what install will DO — shown in the consent gate. */
export function describeInstallPlan(manifest: AppManifest, dir: string): string {
  const lines: string[] = [];
  lines.push(`App:     ${manifest.name} (${manifest.id}) v${manifest.version}`);
  if (manifest.description) lines.push(`         ${manifest.description}`);
  lines.push(`Source:  ${dir}`);
  lines.push(`Intents: ${manifest.uses_intents.join(', ')}`);
  if (manifest.uses_projects?.length) {
    lines.push(`Projects: ${manifest.uses_projects.join(', ')} (soft reference — install will NOT join them)`);
  }
  const skills = manifest.installs_skills ?? [];
  if (skills.length === 0) {
    lines.push('Skills:  (none — pure reference App)');
  } else {
    lines.push('Will RUN these install scripts (arbitrary shell, no sandbox):');
    for (const s of skills) {
      lines.push(`  - ${s.name}: ${path.join(dir, s.install)}`);
    }
  }
  if (manifest.published_output) lines.push(`Output:  ${manifest.published_output}`);
  return lines.join('\n');
}

/** Injectable dependencies so install is testable without a TTY or real shell. */
export interface InstallDeps {
  /** Returns true if the user consents. Bypassed when `assumeYes` is set. */
  confirm: (plan: string) => Promise<boolean>;
  /** Run one install script (cwd = app dir). Throws on non-zero exit. */
  runScript: (scriptAbsPath: string, cwd: string) => void;
  /** Clock — injectable for deterministic tests. */
  now?: () => string;
}

export interface InstallResult {
  status: 'installed' | 'declined' | 'already-installed';
  app?: RegisteredApp;
}

/**
 * Install an App from a resolved source dir. Pure orchestration; all side-effecting
 * pieces (prompt, shell) come in via `deps`. Validates → consent → run skills →
 * register. Declining or an already-installed id is a no-op (no partial writes).
 */
export async function installApp(
  ref: string,
  opts: { assumeYes?: boolean },
  deps: InstallDeps
): Promise<InstallResult> {
  const { dir, source } = resolveSource(ref);
  const manifest = readManifest(dir);

  if (getApp(manifest.id)) {
    return { status: 'already-installed' };
  }

  if (!opts.assumeYes) {
    const ok = await deps.confirm(describeInstallPlan(manifest, dir));
    if (!ok) return { status: 'declined' };
  }

  // Run install scripts. If one fails, we throw BEFORE registering — so a failed
  // install never leaves a half-registered App.
  const ranSkills: string[] = [];
  for (const skill of manifest.installs_skills ?? []) {
    const scriptPath = path.join(dir, skill.install);
    deps.runScript(scriptPath, dir);
    ranSkills.push(skill.name);
  }

  const projectJoinStatus: Record<string, 'joined' | 'not-joined'> = {};
  for (const p of manifest.uses_projects ?? []) {
    // Soft reference: we do NOT auto-join. Record current join status from the
    // local project registry would require a daemon read; default not-joined and
    // let `ogp app show` reconcile. (P6 wires the live reconcile.)
    projectJoinStatus[p] = 'not-joined';
  }

  const app: RegisteredApp = {
    id: manifest.id,
    manifest,
    source,
    installedAt: (deps.now ?? (() => new Date().toISOString()))(),
    installedSkills: ranSkills,
    projectJoinStatus,
  };
  addApp(app);
  return { status: 'installed', app };
}

export interface UninstallDeps {
  /** Remove an installed skill by name (reverse of the install script). */
  removeSkill?: (skillName: string) => void;
}

export interface UninstallResult {
  status: 'removed' | 'not-installed';
}

/** Remove an App: reverse its installed skills, then drop it from the registry. */
export function uninstallApp(id: string, deps: UninstallDeps = {}): UninstallResult {
  const app = getApp(id);
  if (!app) return { status: 'not-installed' };
  if (deps.removeSkill) {
    for (const name of app.installedSkills) deps.removeSkill(name);
  }
  removeAppFromRegistry(id);
  return { status: 'removed' };
}

// ---------------------------------------------------------------------------
// commander wiring (thin shells over the testable core above)
// ---------------------------------------------------------------------------

async function realConfirm(plan: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\n' + plan + '\n');
    const answer = await rl.question('Proceed with install? [y/N]: ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function realRunScript(scriptAbsPath: string, cwd: string): void {
  // Execute the script through the shell so a manifest can point at a .sh/.js/etc.
  execFileSync(scriptAbsPath, [], { cwd, stdio: 'inherit' });
}

export const appCommand = new Command('app')
  .description('Manage OGP Apps (declarative ogp-app.json bundles)');

appCommand
  .command('list')
  .description('List installed apps')
  .option('--json', 'Output machine-readable JSON')
  .action((options: { json?: boolean }) => {
    const apps = loadApps();
    if (options.json) {
      console.log(JSON.stringify(apps, null, 2));
      return;
    }
    if (apps.length === 0) {
      console.log('No apps installed. Use "ogp app install <ref>".');
      return;
    }
    for (const a of apps) {
      const out = a.manifest.published_output ? ` → ${a.manifest.published_output}` : '';
      console.log(`${a.id}  v${a.manifest.version}  (${a.manifest.name})${out}`);
    }
  });

appCommand
  .command('show')
  .description('Show an installed app: manifest, output link, project-join status')
  .argument('<id>', 'App id')
  .option('--json', 'Output machine-readable JSON')
  .action((id: string, options: { json?: boolean }) => {
    const app = getApp(id);
    if (!app) {
      console.error(`App not installed: ${id}`);
      process.exitCode = 1;
      return;
    }
    if (options.json) {
      console.log(JSON.stringify(app, null, 2));
      return;
    }
    console.log(describeInstallPlan(app.manifest, app.source.replace(/^file:/, '')));
    console.log(`Installed: ${app.installedAt}`);
    console.log(`Skills:    ${app.installedSkills.join(', ') || '(none)'}`);
  });

appCommand
  .command('install')
  .description('Install an app from a ref (file:/abs/path in P3)')
  .argument('<ref>', 'App source: file:/path (github:/peer: in later phases)')
  .option('-y, --yes', 'Skip the install consent prompt (for automation)')
  .action(async (ref: string, options: { yes?: boolean }) => {
    try {
      const result = await installApp(ref, { assumeYes: options.yes }, {
        confirm: realConfirm,
        runScript: realRunScript,
      });
      switch (result.status) {
        case 'installed':
          console.log(`✓ Installed ${result.app!.id} (${result.app!.installedSkills.length} skill(s))`);
          break;
        case 'declined':
          console.log('Install cancelled.');
          process.exitCode = 1;
          break;
        case 'already-installed':
          console.log(`Already installed. Use "ogp app remove ${ref}" first to reinstall.`);
          break;
      }
    } catch (err) {
      console.error(`Install failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

appCommand
  .command('remove')
  .description('Remove an installed app')
  .argument('<id>', 'App id')
  .action((id: string) => {
    const result = uninstallApp(id);
    if (result.status === 'not-installed') {
      console.error(`App not installed: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ Removed ${id}`);
  });
