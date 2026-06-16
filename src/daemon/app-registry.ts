/**
 * OGP Apps registry — `~/.ogp/apps.json`.
 *
 * Tracks which Apps are installed on this machine. Sits next to
 * intent-registry.json / projects.json under getConfigDir() and mirrors the
 * intent-registry read/write pattern: plain JSON file, written by the `ogp app`
 * CLI (install/remove) and read by the CLI + the companion app.
 *
 * Concurrency note: like intent-registry, this is lock-free. Writes originate
 * from the `ogp app` CLI (single-writer in practice). The daemon's state-lock
 * (daemon.lock) is a daemon-singleton lifetime lock, NOT a per-write mutex, so
 * it does not apply to CLI-side registry writes.
 *
 * Spec: docs/superpowers/specs/2026-06-13-ogp-apps-layer-spec.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';
import type { AppManifest } from '../shared/app-manifest.js';

/** Where an installed App came from (for re-install / provenance / clean remove). */
export type AppSource =
  | `github:${string}`   // github:owner/repo
  | `file:${string}`     // file:/abs/path
  | `peer:${string}`;    // peer:<peerId>/<appId>

export type ProjectJoinStatus = 'joined' | 'not-joined';

/** A single installed App as stored in apps.json. */
export interface RegisteredApp {
  id: string;
  /** The validated ogp-app.json, stored verbatim. */
  manifest: AppManifest;
  source: AppSource;
  installedAt: string;             // ISO timestamp
  /** Skills that actually ran on install, so `remove` can reverse exactly. */
  installedSkills: string[];
  /** Soft-reference join status for each project the manifest uses. */
  projectJoinStatus: Record<string, ProjectJoinStatus>;
  /** Opt-in: this App is advertised on our /.well-known/ogp + rendezvous card. */
  advertised?: boolean;
}

interface AppsFile {
  apps: RegisteredApp[];
}

export function getAppsFile(): string {
  return path.join(getConfigDir(), 'apps.json');
}

/** Load the registry. An absent file is an empty registry (no migration). */
export function loadApps(): RegisteredApp[] {
  const file = getAppsFile();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AppsFile>;
    return Array.isArray(parsed?.apps) ? parsed.apps : [];
  } catch {
    // A corrupt file should not crash the daemon/CLI; treat as empty and let a
    // subsequent write heal it. (Mirrors the defensive posture elsewhere.)
    return [];
  }
}

export function saveApps(apps: RegisteredApp[]): void {
  ensureConfigDir();
  const body: AppsFile = { apps };
  fs.writeFileSync(getAppsFile(), JSON.stringify(body, null, 2), 'utf-8');
}

export function getApp(id: string): RegisteredApp | null {
  return loadApps().find((a) => a.id === id) ?? null;
}

export function isAppInstalled(id: string): boolean {
  return getApp(id) !== null;
}

/**
 * Add an App to the registry. Rejects a duplicate id rather than silently
 * overwriting — install should be explicit about replacing an existing App.
 * Returns 'added' or 'duplicate'.
 */
export function addApp(app: RegisteredApp): 'added' | 'duplicate' {
  const apps = loadApps();
  if (apps.some((a) => a.id === app.id)) return 'duplicate';
  apps.push(app);
  saveApps(apps);
  return 'added';
}

/** Replace an existing App in place (used by re-install / upgrade). Returns
 *  true if an entry was replaced, false if the id was not present. */
export function updateApp(app: RegisteredApp): boolean {
  const apps = loadApps();
  const idx = apps.findIndex((a) => a.id === app.id);
  if (idx < 0) return false;
  apps[idx] = app;
  saveApps(apps);
  return true;
}

/** Remove an App by id. Returns true if it was present. */
export function removeApp(id: string): boolean {
  const apps = loadApps();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  apps.splice(idx, 1);
  saveApps(apps);
  return true;
}

/** Set the advertised flag for an App. Returns true if the App exists. */
export function setAppAdvertised(id: string, advertised: boolean): boolean {
  const apps = loadApps();
  const app = apps.find((a) => a.id === id);
  if (!app) return false;
  app.advertised = advertised;
  saveApps(apps);
  return true;
}

export function listApps(): RegisteredApp[] {
  return loadApps();
}
