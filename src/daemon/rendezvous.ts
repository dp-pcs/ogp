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

import type { RendezvousConfig, TransportConfig } from '../shared/config.js';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Transport descriptor advertised inside the signed registration (bd-b7em).
 * Mirrors the rendezvous server's shape. Absent ⇒ direct (we omit it entirely
 * for direct mode to stay byte-identical with pre-bd-b7em registrations).
 */
type TransportDescriptor =
  | { transport: 'relay'; relayUrl: string }
  | { transport: 'iroh'; nodeId: string; relayUrl?: string };

/**
 * Build the transport descriptor to advertise, from config. Returns undefined
 * for 'direct' (or absent) — direct peers register exactly as before, and a
 * missing descriptor is interpreted as direct by the server.
 *
 * relay without a configured url, or iroh without a node id, fall back to
 * undefined (direct) rather than advertising an unreachable transport.
 */
export function buildTransportDescriptor(
  transport: TransportConfig | undefined,
  rendezvousUrl: string,
  irohNodeId?: string
): TransportDescriptor | undefined {
  const mode = transport?.mode ?? 'direct';
  if (mode === 'relay') {
    const relayUrl = transport?.relay?.url || defaultRelayUrl(rendezvousUrl);
    if (!relayUrl) return undefined;
    return { transport: 'relay', relayUrl };
  }
  if (mode === 'iroh') {
    if (!irohNodeId) return undefined; // no node yet (Phase 3) ⇒ stay direct
    return { transport: 'iroh', nodeId: irohNodeId, ...(transport?.iroh?.relayUrl ? { relayUrl: transport.iroh.relayUrl } : {}) };
  }
  return undefined; // direct
}

/**
 * Resolve the relay WebSocket URL for THIS daemon's own receiver socket
 * (bd-b7em Phase 2). Uses an explicitly configured relay.url, else derives
 * wss://<rendezvous-host>/relay. Returns undefined when relay can't be resolved.
 */
export function resolveOwnRelayUrl(
  transport: TransportConfig | undefined,
  rendezvousUrl: string | undefined
): string | undefined {
  if (transport?.relay?.url) return transport.relay.url;
  if (rendezvousUrl) return defaultRelayUrl(rendezvousUrl);
  return undefined;
}

/** Derive the default relay endpoint from the rendezvous URL (wss://<host>/relay). */
function defaultRelayUrl(rendezvousUrl: string): string | undefined {
  try {
    const u = new URL(rendezvousUrl);
    const scheme = u.protocol === 'http:' ? 'ws:' : 'wss:';
    return `${scheme}//${u.host}/relay`;
  } catch {
    return undefined;
  }
}

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

async function doRegister(
  config: RendezvousConfig,
  pubkey: string,
  port: number,
  publicUrl?: string,
  transport?: TransportDescriptor
): Promise<void> {
  // SECURITY (F-02): Sign the registration so the rendezvous server can verify
  // we actually hold the private key matching this pubkey. Without this, anyone
  // could squat on someone else's pubkey at the rendezvous.
  const { signCanonical } = await import('../shared/signing.js');
  const { getPrivateKey } = await import('./keypair.js');

  const innerPayload: { pubkey: string; port: number; publicUrl?: string; transport?: TransportDescriptor } = { pubkey, port };
  if (publicUrl) {
    innerPayload.publicUrl = publicUrl;
  }
  // bd-b7em: advertise transport INSIDE the signed payload (only when non-direct,
  // so direct registrations stay byte-identical with pre-bd-b7em daemons).
  if (transport) {
    innerPayload.transport = transport;
  }

  const { payloadStr, signature } = signCanonical(innerPayload, getPrivateKey());

  const res = await fetch(`${config.url}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payloadStr, signature }),
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
  port: number,
  transportConfig?: TransportConfig
): Promise<void> {
  if (!config.enabled) return;

  activeConfig = config;
  registeredPubkey = pubkey;

  // Check for OGP_PUBLIC_URL env var or config.publicUrl
  const publicUrl = process.env.OGP_PUBLIC_URL || config.publicUrl;

  // bd-b7em: build the transport descriptor once (undefined ⇒ direct). iroh node
  // id is not available in Phase 1, so iroh mode advertises nothing yet.
  const transport = buildTransportDescriptor(transportConfig, config.url);
  if (transport) {
    console.log(`[OGP] Transport mode: ${transport.transport}`);
  }

  // Detect public IP (informational — rendezvous server auto-detects from socket)
  let publicIp = 'unknown';
  try {
    publicIp = await detectPublicIp();
  } catch (err) {
    console.warn(`[OGP] Could not detect public IP: ${(err as Error).message}`);
  }

  // Initial registration
  try {
    await doRegister(config, pubkey, port, publicUrl, transport);
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
      await doRegister(activeConfig, pubkey, port, publicUrl, transport);
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

/**
 * Resolved transport for a peer (bd-b7em). Phase 1: senders still deliver via
 * `direct` (the `url`); `relay`/`iroh` are carried so Phase 2's sender can branch
 * on `mode`. Direct/legacy records resolve to `{ mode:'direct', url }` exactly as
 * `lookupPeer` does today, so existing behavior is unchanged.
 */
export type ResolvedTransport =
  | { mode: 'direct'; url: string }
  | { mode: 'relay'; relayUrl: string; pubkey: string }
  | { mode: 'iroh'; nodeId: string; relayUrl?: string; pubkey: string };

/**
 * Look up a peer and resolve HOW to reach them. Backward compatible: a peer with
 * no transport descriptor (or transport:'direct') resolves to direct via the
 * same publicUrl / ip:port logic as `lookupPeer`.
 */
export async function lookupPeerTransport(
  config: RendezvousConfig,
  pubkey: string
): Promise<ResolvedTransport | null> {
  if (!config.enabled) return null;

  try {
    const res = await fetch(`${config.url}/peer/${encodeURIComponent(pubkey)}`, {
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Rendezvous lookup returned ${res.status}`);

    const data = await res.json() as {
      ip?: string;
      port?: number;
      publicUrl?: string;
      transport?: TransportDescriptor | { transport: 'direct'; gatewayUrl?: string };
    };

    const t = data.transport;
    if (t && t.transport === 'relay') {
      return { mode: 'relay', relayUrl: t.relayUrl, pubkey };
    }
    if (t && t.transport === 'iroh') {
      return { mode: 'iroh', nodeId: t.nodeId, ...(t.relayUrl ? { relayUrl: t.relayUrl } : {}), pubkey };
    }

    // direct / legacy / transport:'direct'
    const directUrl =
      (t && t.transport === 'direct' && t.gatewayUrl) ? t.gatewayUrl :
      data.publicUrl ? data.publicUrl :
      (data.ip && data.port) ? `http://${data.ip}:${data.port}` : null;
    if (!directUrl) {
      throw new Error('Invalid response from rendezvous server: no reachable address');
    }
    return { mode: 'direct', url: directUrl };
  } catch (err) {
    console.warn(`[OGP] Rendezvous transport lookup failed: ${(err as Error).message}`);
    return null;
  }
}
