/**
 * OGP receiver-side replay deduplication (bd-8rd.3 Option B).
 *
 * When a durable federation message is retried, the receiver must not re-execute
 * the handler. We keep an LRU of recent nonces and return the cached result.
 *
 * Storage: ~/.ogp/replay.json (or per-framework config dir).
 * Window: 7 days and/or 1000 entries, whichever is smaller.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';

export interface ReplayEntry {
  nonce: string;
  /** ISO timestamp when the message was first processed. */
  processedAt: string;
  /** Whether the original processing succeeded. */
  success: boolean;
  /** Cached response payload, if any. */
  response?: unknown;
  /** Cached error, if any. */
  error?: string;
  /** Cached status code, if any. */
  statusCode?: number;
}

export interface ReplayCache {
  version: number;
  entries: ReplayEntry[];
}

export interface ReplayPolicy {
  maxAgeDays: number;
  maxEntries: number;
}

export const DEFAULT_REPLAY_POLICY: ReplayPolicy = {
  maxAgeDays: 7,
  maxEntries: 1000,
};

const REPLAY_FILE = 'replay.json';

function getReplayPath(): string {
  return path.join(getConfigDir(), REPLAY_FILE);
}

export function loadReplayCache(): ReplayCache {
  const file = getReplayPath();
  if (!fs.existsSync(file)) {
    return { version: 1, entries: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as ReplayCache;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

export function saveReplayCache(cache: ReplayCache): void {
  ensureConfigDir();
  const file = getReplayPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Fallback for constrained environments (e.g. tests that mock fs). Atomic
    // rename is a nice-to-have; the cache is still valid.
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf-8');
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function isExpired(entry: ReplayEntry, policy: ReplayPolicy): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - policy.maxAgeDays);
  return new Date(entry.processedAt) < cutoff;
}

export function pruneReplayCache(policy: ReplayPolicy = DEFAULT_REPLAY_POLICY): ReplayCache {
  const cache = loadReplayCache();
  cache.entries = cache.entries.filter((e) => !isExpired(e, policy));
  // Keep newest maxEntries.
  if (cache.entries.length > policy.maxEntries) {
    cache.entries.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());
    cache.entries = cache.entries.slice(0, policy.maxEntries);
  }
  saveReplayCache(cache);
  return cache;
}

export function getReplayResult(nonce: string, policy: ReplayPolicy = DEFAULT_REPLAY_POLICY): ReplayEntry | null {
  const cache = pruneReplayCache(policy);
  return cache.entries.find((e) => e.nonce === nonce) || null;
}

export function recordReplayResult(
  nonce: string,
  result: { success: boolean; response?: unknown; error?: string; statusCode?: number },
  policy: ReplayPolicy = DEFAULT_REPLAY_POLICY
): void {
  const cache = pruneReplayCache(policy);
  const existing = cache.entries.find((e) => e.nonce === nonce);
  if (existing) {
    // Should not happen if getReplayResult is checked first, but be safe.
    existing.processedAt = nowISO();
    existing.success = result.success;
    existing.response = result.response;
    existing.error = result.error;
    existing.statusCode = result.statusCode;
  } else {
    cache.entries.push({
      nonce,
      processedAt: nowISO(),
      success: result.success,
      response: result.response,
      error: result.error,
      statusCode: result.statusCode,
    });
  }
  saveReplayCache(cache);
}

export function clearReplayCache(): void {
  saveReplayCache({ version: 1, entries: [] });
}
