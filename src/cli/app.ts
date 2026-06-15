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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { validateManifest, type AppManifest, type AppAdvertisement } from '../shared/app-manifest.js';
import {
  loadApps,
  addApp,
  getApp,
  removeApp as removeAppFromRegistry,
  setAppAdvertised,
  type RegisteredApp,
  type AppSource,
} from '../daemon/app-registry.js';
import { readActivityJsonl } from '../daemon/agent-comms.js';
import { getPeer } from '../daemon/peers.js';
import { loadConfig } from '../shared/config.js';
import { fetchPeerCard } from '../daemon/rendezvous.js';

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

export interface AppUsageEntry {
  id: string;
  name: string;
  totalCalls: number;
  earliestAttributable: string | null;
  latestAttributable: string | null;
  byIntent: Record<string, number>;
  sharedIntents: string[];
  ambiguous: boolean;
}

/**
 * P4: Attribute daemon-observed intent calls to installed Apps.
 *
 * Rules:
 * - Each activity entry with an `intent` is matched against every installed App's
 *   `uses_intents`.
 * - If exactly one App claims the intent, the call is attributed to that App.
 * - If multiple Apps claim the intent, `projectId` is used to disambiguate:
 *   only Apps whose `uses_projects` includes the entry's `projectId` remain.
 * - If disambiguation still leaves >1 App, the intent is marked as shared and
 *   the call is attributed to ALL remaining Apps with an `ambiguous` flag.
 * - NO backfill: only entries that exist at query time are counted.
 */
export function computeAppUsage(
  apps: RegisteredApp[],
  activities: ReturnType<typeof readActivityJsonl>
): AppUsageEntry[] {
  const entries = activities.filter((a) => typeof a.intent === 'string' && a.intent.length > 0);

  // Pre-compute intent -> apps map
  const appsByIntent: Record<string, RegisteredApp[]> = {};
  for (const app of apps) {
    for (const intent of app.manifest.uses_intents) {
      (appsByIntent[intent] ??= []).push(app);
    }
  }

  const totals = new Map<string, Map<string, number>>();
  const earliest = new Map<string, string>();
  const latest = new Map<string, string>();
  const sharedIntents = new Map<string, Set<string>>();

  for (const entry of entries) {
    const intent = entry.intent!;
    const projectId = entry.projectId;
    const candidates = (appsByIntent[intent] ?? []).slice();

    // Disambiguate by projectId if present
    if (projectId && candidates.length > 1) {
      const narrowed = candidates.filter(
        (a) => a.manifest.uses_projects && a.manifest.uses_projects.includes(projectId)
      );
      if (narrowed.length > 0) {
        candidates.length = 0;
        candidates.push(...narrowed);
      }
    }

    const isShared = candidates.length > 1;
    if (isShared) {
      for (const app of candidates) {
        let set = sharedIntents.get(app.id);
        if (!set) {
          set = new Set();
          sharedIntents.set(app.id, set);
        }
        set.add(intent);
      }
    }

    for (const app of candidates) {
      const byIntent = totals.get(app.id) ?? new Map<string, number>();
      byIntent.set(intent, (byIntent.get(intent) ?? 0) + 1);
      totals.set(app.id, byIntent);

      if (entry.timestamp) {
        const ts = entry.timestamp;
        const prevEarliest = earliest.get(app.id);
        if (!prevEarliest || ts < prevEarliest) earliest.set(app.id, ts);
        const prevLatest = latest.get(app.id);
        if (!prevLatest || ts > prevLatest) latest.set(app.id, ts);
      }
    }
  }

  return apps.map((app) => {
    const byIntent = totals.get(app.id);
    const totalCalls = byIntent
      ? Array.from(byIntent.values()).reduce((sum, n) => sum + n, 0)
      : 0;
    return {
      id: app.id,
      name: app.manifest.name,
      totalCalls,
      earliestAttributable: earliest.get(app.id) ?? null,
      latestAttributable: latest.get(app.id) ?? null,
      byIntent: byIntent ? Object.fromEntries(byIntent) : {},
      sharedIntents: Array.from(sharedIntents.get(app.id) ?? []),
      ambiguous: (sharedIntents.get(app.id)?.size ?? 0) > 0,
    };
  });
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
  .description('Install an app from a ref (file:/abs/path or peer:<peerId>/<appId>)')
  .argument('<ref>', 'App source: file:/path or peer:<peerId>/<appId>')
  .option('-y, --yes', 'Skip the install consent prompt (for automation)')
  .action(async (ref: string, options: { yes?: boolean }) => {
    try {
      let effectiveRef = ref;
      const peerRef = parsePeerRef(ref);
      if (peerRef) {
        if (!peerRef.appId) {
          throw new AppInstallError('peer: ref requires an appId: peer:<peerId>/<appId>');
        }
        const resolved = await resolvePeerSource(peerRef.peerId, peerRef.appId);
        effectiveRef = `file:${resolved.dir}`;
      }
      const result = await installApp(effectiveRef, { assumeYes: options.yes }, {
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

appCommand
  .command('usage')
  .description('Show usage attribution for installed apps')
  .argument('[id]', 'App id (omit for all installed apps)')
  .option('--json', 'Output machine-readable JSON')
  .action((id: string | undefined, options: { json?: boolean }) => {
    const apps = id ? (loadApps().filter((a) => a.id === id)) : loadApps();
    if (id && apps.length === 0) {
      console.error(`App not installed: ${id}`);
      process.exitCode = 1;
      return;
    }
    const usage = computeAppUsage(apps, readActivityJsonl());
    if (options.json) {
      console.log(JSON.stringify(usage, null, 2));
      return;
    }
    if (usage.length === 0) {
      console.log('No installed apps to report usage for.');
      return;
    }
    for (const u of usage) {
      const shared = u.ambiguous ? ` [shared intents: ${u.sharedIntents.join(', ')}]` : '';
      const range = u.earliestAttributable
        ? `${u.earliestAttributable.slice(0, 10)}..${u.latestAttributable?.slice(0, 10) ?? 'now'}`
        : 'no activity';
      console.log(`${u.id}  ${u.totalCalls} call(s)  ${range}${shared}`);
      for (const [intent, count] of Object.entries(u.byIntent)) {
        console.log(`  - ${intent}: ${count}`);
      }
    }
  });

// ---------------------------------------------------------------------------
// P5: peer-advertised discovery + peer: install source
// ---------------------------------------------------------------------------

/**
 * Parse a `peer:<peerId>/<appId>` ref. The appId is optional for browse
 * (browse all from peer) but required for install.
 */
export function parsePeerRef(ref: string): { peerId: string; appId?: string } | null {
  if (!ref.startsWith('peer:')) return null;
  const rest = ref.slice('peer:'.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return { peerId: rest };
  return { peerId: rest.slice(0, slash), appId: rest.slice(slash + 1) };
}

/**
 * P5: Resolve a peer ref to a local directory containing a downloaded manifest.
 * Downloads the advertised manifest from the peer's well-known or rendezvous card,
 * verifies the publisher key, and materializes a temp directory with ogp-app.json.
 */
export async function resolvePeerSource(
  peerId: string,
  appId: string
): Promise<ResolvedSource> {
  const peer = getPeer(peerId);
  if (!peer) {
    throw new AppInstallError(`Unknown peer: ${peerId}`);
  }

  const cfg = loadConfig();
  if (!cfg) {
    throw new AppInstallError('No OGP config found. Run "ogp setup" first.');
  }

  // Try direct well-known first, then rendezvous card.
  let ads: AppAdvertisement[] | undefined;
  let publisherKey: string | undefined;

  try {
    const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`);
    if (response.ok) {
      const wk = (await response.json()) as { capabilities?: { apps?: AppAdvertisement[] }; publicKey: string };
      ads = wk.capabilities?.apps;
      publisherKey = wk.publicKey;
    }
  } catch {
    // fall through to rendezvous
  }

  if (!ads && cfg.rendezvous?.enabled) {
    const card = await fetchPeerCard(cfg.rendezvous, peer.publicKey);
    if (card?.apps) {
      ads = card.apps;
      publisherKey = card.publicKey;
    }
  }

  if (!ads || ads.length === 0) {
    throw new AppInstallError(`Peer ${peerId} is not advertising any apps.`);
  }

  const match = ads.find((a) => a.manifest.id === appId);
  if (!match) {
    throw new AppInstallError(`Peer ${peerId} is not advertising app "${appId}".`);
  }

  // Verify publisher key matches the peer we trust.
  const expectedKey = match.manifest.publisher?.key ?? publisherKey;
  if (!expectedKey || expectedKey !== peer.publicKey) {
    throw new AppInstallError(
      `App "${appId}" publisher key does not match peer ${peerId}. Possible forgery.`
    );
  }

  // Materialize a temp directory with the manifest so the P3 install flow works unchanged.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-app-'));
  const manifestPath = path.join(tmpDir, 'ogp-app.json');
  fs.writeFileSync(manifestPath, JSON.stringify(match.manifest, null, 2), 'utf-8');
  return { dir: tmpDir, source: `peer:${peerId}/${appId}` };
}

/**
 * P5: Fetch advertised apps from a single peer. Returns the list of verified
 * advertisements (publisher key asserted against the peer record we trust).
 */
export async function browsePeerApps(peerId: string): Promise<AppAdvertisement[]> {
  const peer = getPeer(peerId);
  if (!peer) {
    throw new AppInstallError(`Unknown peer: ${peerId}`);
  }

  const cfg = loadConfig();
  if (!cfg) {
    throw new AppInstallError('No OGP config found. Run "ogp setup" first.');
  }

  let ads: AppAdvertisement[] | undefined;
  let publisherKey: string | undefined;

  try {
    const response = await fetch(`${peer.gatewayUrl}/.well-known/ogp`);
    if (response.ok) {
      const wk = (await response.json()) as { capabilities?: { apps?: AppAdvertisement[] }; publicKey: string };
      ads = wk.capabilities?.apps;
      publisherKey = wk.publicKey;
    }
  } catch {
    // fall through
  }

  if (!ads && cfg.rendezvous?.enabled) {
    const card = await fetchPeerCard(cfg.rendezvous, peer.publicKey);
    if (card?.apps) {
      ads = card.apps;
      publisherKey = card.publicKey;
    }
  }

  if (!ads || ads.length === 0) return [];

  // Verify each advertised app against the peer's trusted public key.
  return ads.filter((a) => {
    const expectedKey = a.manifest.publisher?.key ?? publisherKey;
    return expectedKey === peer.publicKey;
  });
}

/**
 * P5: Browse all advertised apps across all approved peers.
 */
export async function browseAllApps(): Promise<{ peerId: string; apps: AppAdvertisement[] }[]> {
  const { listPeers } = await import('../daemon/peers.js');
  const peers = listPeers('approved');
  const results: { peerId: string; apps: AppAdvertisement[] }[] = [];
  for (const peer of peers) {
    try {
      const apps = await browsePeerApps(peer.id);
      if (apps.length > 0) results.push({ peerId: peer.id, apps });
    } catch (err) {
      // Skip peers that are unreachable or advertise nothing.
      console.warn(`[OGP App Browse] ${peer.id}: ${(err as Error).message}`);
    }
  }
  return results;
}

// P5 commander wiring
appCommand
  .command('advertise')
  .description('Advertise an installed app on /.well-known/ogp and rendezvous')
  .argument('<id>', 'App id')
  .action((id: string) => {
    if (setAppAdvertised(id, true)) {
      console.log(`✓ Advertising ${id}`);
    } else {
      console.error(`App not installed: ${id}`);
      process.exitCode = 1;
    }
  });

appCommand
  .command('unadvertise')
  .description('Stop advertising an installed app')
  .argument('<id>', 'App id')
  .action((id: string) => {
    if (setAppAdvertised(id, false)) {
      console.log(`✓ Stopped advertising ${id}`);
    } else {
      console.error(`App not installed: ${id}`);
      process.exitCode = 1;
    }
  });

appCommand
  .command('browse')
  .description('Browse apps advertised by peers')
  .argument('[peer]', 'Peer id (omit for all approved peers)')
  .option('--json', 'Output machine-readable JSON')
  .action(async (peerId: string | undefined, options: { json?: boolean }) => {
    try {
      let result: { peerId: string; apps: AppAdvertisement[] }[];
      if (peerId) {
        const apps = await browsePeerApps(peerId);
        result = apps.length > 0 ? [{ peerId, apps }] : [];
      } else {
        result = await browseAllApps();
      }
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.length === 0) {
        console.log('No advertised apps found.');
        return;
      }
      for (const group of result) {
        console.log(`Peer: ${group.peerId}`);
        for (const a of group.apps) {
          console.log(`  ${a.manifest.id}  v${a.manifest.version}  (${a.manifest.name})`);
        }
      }
    } catch (err) {
      console.error(`Browse failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });


