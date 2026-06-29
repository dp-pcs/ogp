/**
 * Outbound-fetch self-watchdog (bd-kclo).
 *
 * Hardens the daemon against the "outbound-fetch wedge" first seen in bd-sj90:
 * Node/undici's connection-pool or DNS-resolver state got wedged inside the
 * long-lived process while the inbound listener stayed healthy — /federation/ping
 * returned 200 while egress was fully dead, requiring a manual restart.
 *
 * This module tracks the health of outbound fetch() calls, keyed by HOST so a
 * single dead peer can't produce a false positive. The watchdog only TRIPS
 * (flips healthy=false and runs recovery) after N consecutive cross-host
 * failures spanning >=2 DISTINCT hosts. Any subsequent cross-host success flips
 * healthy back to true.
 *
 * Recovery, by default, recreates the global undici dispatcher (a fresh Agent),
 * which rebuilds the connection pool + DNS resolver state — the exact state that
 * wedges. The recovery action is injectable so it's deterministically testable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Number of CONSECUTIVE outbound failures (across the recent failure window)
 * required to trip the watchdog. The failures must also span >= MIN_DISTINCT_HOSTS
 * distinct hosts so a single dead peer never trips it.
 */
const DEFAULT_FAILURE_THRESHOLD = 5;

/** Minimum number of distinct failing hosts required before the watchdog trips. */
const DEFAULT_MIN_DISTINCT_HOSTS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A recovery action run on trip. Returns void or a promise; errors are swallowed. */
export type RecoveryAction = () => void | Promise<void>;

interface WatchdogState {
  healthy: boolean;
  /** Ordered list of distinct hosts in the current consecutive-failure streak. */
  failingHosts: string[];
  /** Total consecutive failures since the last success (any host). */
  consecutiveFailures: number;
  /** Last-success epoch ms per host (the "probe class"). */
  lastSuccessByHost: Record<string, number>;
  /** Epoch ms of the most recent trip, or null if never tripped. */
  lastTripAt: number | null;
  /** Count of times the watchdog has tripped (and run recovery). */
  tripCount: number;
}

export interface OutboundHealthSnapshot {
  outboundHealthy: boolean;
  consecutiveFailures: number;
  failingHosts: string[];
  /** Per-probe-class (host) last-success ISO timestamps. */
  lastOutboundSuccess: Record<string, string>;
  lastTripAt: string | null;
  tripCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default recovery: recreate the global undici dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild Node's global fetch dispatcher (undici Agent). This drops the wedged
 * connection pool + DNS state and forces fresh sockets on the next fetch. Undici
 * ships inside Node (the runtime that backs global fetch), so this is import-safe
 * on Node >= 18. Any failure is non-fatal — recovery is best-effort.
 */
async function recreateGlobalDispatcher(): Promise<void> {
  try {
    // `undici` ships inside the Node runtime that backs global fetch, but it is
    // not a declared dependency with type declarations here, so we import it via
    // a non-statically-analyzable specifier and treat the surface structurally.
    const specifier = 'undici';
    const undici = (await import(/* @vite-ignore */ specifier)) as {
      Agent: new (...args: unknown[]) => unknown;
      setGlobalDispatcher: (dispatcher: unknown) => void;
    };
    undici.setGlobalDispatcher(new undici.Agent());
    console.warn('[OGP] Outbound watchdog: recreated global undici dispatcher to clear wedged egress state');
  } catch (err) {
    console.warn(`[OGP] Outbound watchdog: dispatcher recovery failed: ${(err as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchdog
// ─────────────────────────────────────────────────────────────────────────────

export class OutboundHealthWatchdog {
  private state: WatchdogState = {
    healthy: true,
    failingHosts: [],
    consecutiveFailures: 0,
    lastSuccessByHost: {},
    lastTripAt: null,
    tripCount: 0
  };

  private readonly failureThreshold: number;
  private readonly minDistinctHosts: number;
  private recovery: RecoveryAction;
  private readonly now: () => number;

  constructor(opts?: {
    failureThreshold?: number;
    minDistinctHosts?: number;
    recovery?: RecoveryAction;
    /** Injectable clock for tests. */
    now?: () => number;
  }) {
    this.failureThreshold = opts?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.minDistinctHosts = opts?.minDistinctHosts ?? DEFAULT_MIN_DISTINCT_HOSTS;
    this.recovery = opts?.recovery ?? recreateGlobalDispatcher;
    this.now = opts?.now ?? Date.now;
  }

  /** Override the recovery action (e.g. for tests). */
  setRecovery(action: RecoveryAction): void {
    this.recovery = action;
  }

  /** Current outbound health. */
  isHealthy(): boolean {
    return this.state.healthy;
  }

  /** Record a successful outbound fetch to `host`. Clears the failure streak. */
  recordSuccess(host: string): void {
    const h = normalizeHost(host);
    this.state.lastSuccessByHost[h] = this.now();
    this.state.consecutiveFailures = 0;
    this.state.failingHosts = [];
    // A cross-host success after a trip restores health.
    this.state.healthy = true;
  }

  /**
   * Record a failed/timed-out outbound fetch to `host`. Trips the watchdog (and
   * runs recovery) when the consecutive-failure streak reaches the threshold AND
   * spans >= minDistinctHosts distinct hosts. Returns true if it tripped on this
   * call. Recovery runs at most once per crossing (no re-trip until a success
   * resets, or the streak grows again past the threshold).
   */
  recordFailure(host: string): boolean {
    const h = normalizeHost(host);
    this.state.consecutiveFailures += 1;
    if (!this.state.failingHosts.includes(h)) {
      this.state.failingHosts.push(h);
    }

    const meetsCount = this.state.consecutiveFailures >= this.failureThreshold;
    const meetsSpread = this.state.failingHosts.length >= this.minDistinctHosts;

    if (meetsCount && meetsSpread && this.state.healthy) {
      this.trip();
      return true;
    }
    return false;
  }

  private trip(): void {
    this.state.healthy = false;
    this.state.lastTripAt = this.now();
    this.state.tripCount += 1;
    // Recovery is best-effort and must never throw into the caller's fetch path.
    try {
      const r = this.recovery();
      if (r && typeof (r as Promise<void>).then === 'function') {
        (r as Promise<void>).catch((err) => {
          console.warn(`[OGP] Outbound watchdog recovery rejected: ${(err as Error).message}`);
        });
      }
    } catch (err) {
      console.warn(`[OGP] Outbound watchdog recovery threw: ${(err as Error).message}`);
    }
  }

  /** Structured snapshot for the /federation/ping health route. */
  snapshot(): OutboundHealthSnapshot {
    const lastOutboundSuccess: Record<string, string> = {};
    for (const [host, ts] of Object.entries(this.state.lastSuccessByHost)) {
      lastOutboundSuccess[host] = new Date(ts).toISOString();
    }
    return {
      outboundHealthy: this.state.healthy,
      consecutiveFailures: this.state.consecutiveFailures,
      failingHosts: [...this.state.failingHosts],
      lastOutboundSuccess,
      lastTripAt: this.state.lastTripAt !== null ? new Date(this.state.lastTripAt).toISOString() : null,
      tripCount: this.state.tripCount
    };
  }

  /** Reset to pristine state (tests). */
  reset(): void {
    this.state = {
      healthy: true,
      failingHosts: [],
      consecutiveFailures: 0,
      lastSuccessByHost: {},
      lastTripAt: null,
      tripCount: 0
    };
  }
}

/** Extract the host from a URL string; falls back to the raw input on parse error. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function normalizeHost(host: string): string {
  // Accept either a bare host or a full URL for convenience.
  if (host.includes('://')) return hostFromUrl(host);
  return host;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton (mirrors rendezvous.ts module-level state)
// ─────────────────────────────────────────────────────────────────────────────

let singleton: OutboundHealthWatchdog = new OutboundHealthWatchdog();

export function recordOutboundSuccess(host: string): void {
  singleton.recordSuccess(host);
}

export function recordOutboundFailure(host: string): boolean {
  return singleton.recordFailure(host);
}

export function isOutboundHealthy(): boolean {
  return singleton.isHealthy();
}

export function getOutboundHealthSnapshot(): OutboundHealthSnapshot {
  return singleton.snapshot();
}

/** Replace the module singleton (tests / custom recovery wiring). */
export function setOutboundHealthWatchdog(w: OutboundHealthWatchdog): void {
  singleton = w;
}

/** Access the module singleton (e.g. to inject a recovery action at startup). */
export function getOutboundHealthWatchdog(): OutboundHealthWatchdog {
  return singleton;
}
