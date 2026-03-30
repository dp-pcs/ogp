/**
 * OGP Rendezvous integration
 *
 * Handles:
 *  - Detecting own public IP via api.ipify.org
 *  - Registering with the rendezvous server on startup
 *  - Heartbeat (re-register every 30s) to keep TTL alive
 *  - Deregistration on shutdown (best effort)
 *  - Peer lookup by public key
 */

import type { RendezvousConfig } from '../shared/config.js';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let registeredPubkey: string | null = null;
let activeConfig: RendezvousConfig | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function detectPublicIp(): Promise<string> {
  const res = await fetch('https://api.ipify.org?format=json', {
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`ipify returned ${res.status}`);
  const data = await res.json() as { ip: string };
  return data.ip;
}

async function doRegister(config: RendezvousConfig, pubkey: string, port: number, publicUrl?: string): Promise<void> {
  const body: { pubkey: string; port: number; timestamp: number; publicUrl?: string } = {
    pubkey,
    port,
    timestamp: Date.now()
  };

  if (publicUrl) {
    body.publicUrl = publicUrl;
  }

  const res = await fetch(`${config.url}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
    throw new Error(`Rendezvous register returned ${res.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start rendezvous registration and heartbeat.
 * Call this from server.ts after the daemon begins listening.
 */
export async function startRendezvous(
  config: RendezvousConfig,
  pubkey: string,
  port: number
): Promise<void> {
  if (!config.enabled) return;

  activeConfig = config;
  registeredPubkey = pubkey;

  // Check for OGP_PUBLIC_URL env var or config.publicUrl
  const publicUrl = process.env.OGP_PUBLIC_URL || config.publicUrl;

  // Detect public IP (informational — rendezvous server auto-detects from socket)
  let publicIp = 'unknown';
  try {
    publicIp = await detectPublicIp();
  } catch (err) {
    console.warn(`[OGP] Could not detect public IP: ${(err as Error).message}`);
  }

  // Initial registration
  try {
    await doRegister(config, pubkey, port, publicUrl);
    if (publicUrl) {
      console.log(`[OGP] Registered with rendezvous at ${config.url} as ${pubkey.slice(0, 8)}... (publicUrl: ${publicUrl})`);
    } else {
      console.log(`[OGP] Registered with rendezvous at ${config.url} as ${pubkey.slice(0, 8)}... (IP: ${publicIp})`);
    }
  } catch (err) {
    console.warn(`[OGP] Rendezvous registration failed: ${(err as Error).message}`);
    // Non-fatal — heartbeat will retry
  }

  // Start heartbeat
  heartbeatTimer = setInterval(async () => {
    if (!activeConfig) return;
    try {
      await doRegister(activeConfig, pubkey, port, publicUrl);
    } catch (err) {
      console.warn(`[OGP] Rendezvous heartbeat failed: ${(err as Error).message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop heartbeat and deregister from rendezvous (best effort).
 * Call from server.ts shutdown path.
 */
export async function stopRendezvous(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (!activeConfig || !registeredPubkey) return;

  try {
    await fetch(`${activeConfig.url}/peer/${encodeURIComponent(registeredPubkey)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000)
    });
    console.log(`[OGP] Deregistered from rendezvous`);
  } catch {
    // Best effort — server TTL will clean up naturally
  }

  activeConfig = null;
  registeredPubkey = null;
}

/**
 * Look up a peer by public key in the rendezvous server.
 * Returns the peer URL (http://ip:port or publicUrl) or null if not found.
 */
export async function lookupPeer(
  config: RendezvousConfig,
  pubkey: string
): Promise<string | null> {
  if (!config.enabled) return null;

  try {
    const res = await fetch(`${config.url}/peer/${encodeURIComponent(pubkey)}`, {
      signal: AbortSignal.timeout(8000)
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Rendezvous lookup returned ${res.status}`);

    const data = await res.json() as { ip?: string; port?: number; publicUrl?: string };

    // If publicUrl is present, use it directly
    if (data.publicUrl) {
      return data.publicUrl;
    }

    // Otherwise, construct from ip and port (legacy behavior)
    if (data.ip && data.port) {
      return `http://${data.ip}:${data.port}`;
    }

    throw new Error('Invalid response from rendezvous server: missing both publicUrl and ip/port');
  } catch (err) {
    console.warn(`[OGP] Rendezvous lookup failed: ${(err as Error).message}`);
    return null;
  }
}
