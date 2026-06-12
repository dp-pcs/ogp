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

import type { RendezvousConfig, TransportConfig, TransportMode } from '../shared/config.js';
import { resolveTransportList } from '../shared/config.js';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Transport descriptor advertised inside the signed registration (bd-b7em).
 * Mirrors the rendezvous server's shape. A `direct` descriptor is only emitted
 * inside a multi-element list; a single direct advertisement omits the field
 * entirely to stay byte-identical with pre-bd-b7em registrations.
 */
type TransportDescriptor =
  | { transport: 'direct'; gatewayUrl?: string }
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
 * Build one transport descriptor for a single advertised mode (bd-maas). Unlike
 * buildTransportDescriptor, a `direct` mode here yields an explicit
 * `{ transport: 'direct', gatewayUrl? }` so it can appear inside a multi-element
 * list. Returns undefined when a mode can't be resolved (relay w/o url, iroh w/o
 * node), so the caller drops it from the list rather than advertising a dead leg.
 */
function buildDescriptorForMode(
  mode: TransportMode,
  transport: TransportConfig | undefined,
  rendezvousUrl: string,
  gatewayUrl?: string,
  irohNodeId?: string
): TransportDescriptor | undefined {
  if (mode === 'direct') {
    return { transport: 'direct', ...(gatewayUrl ? { gatewayUrl } : {}) };
  }
  if (mode === 'relay') {
    const relayUrl = transport?.relay?.url || defaultRelayUrl(rendezvousUrl);
    if (!relayUrl) return undefined;
    return { transport: 'relay', relayUrl };
  }
  if (mode === 'iroh') {
    if (!irohNodeId) return undefined;
    return { transport: 'iroh', nodeId: irohNodeId, ...(transport?.iroh?.relayUrl ? { relayUrl: transport.iroh.relayUrl } : {}) };
  }
  return undefined;
}

/**
 * Build the ordered transport advertisement list (bd-maas) from config. Resolves
 * the mode list via resolveTransportList, builds a descriptor per mode, and drops
 * any that can't be resolved. Returns [] when the result is just plain direct —
 * the caller then omits the transport field entirely (byte-identical to a
 * pre-bd-b7em / single-direct registration).
 *
 * Pure (modulo the passed-in urls) — exported for testing.
 */
export function buildTransportList(
  transport: TransportConfig | undefined,
  rendezvousUrl: string,
  gatewayUrl?: string,
  irohNodeId?: string
): TransportDescriptor[] {
  const modes = resolveTransportList({ transport }).map((e) => e.mode);
  const descriptors: TransportDescriptor[] = [];
  for (const mode of modes) {
    const d = buildDescriptorForMode(mode, transport, rendezvousUrl, gatewayUrl, irohNodeId);
    if (d) descriptors.push(d);
  }
  // A lone direct advertisement carries no information the server doesn't already
  // infer from ip:port/publicUrl ⇒ omit the field entirely (byte-identical to a
  // pre-bd-b7em registration). A direct entry is only kept when it's one leg of a
  // multi-element list, where its order relative to relay matters.
  if (descriptors.length === 1 && descriptors[0].transport === 'direct') {
    return [];
  }
  return descriptors;
}

/**
 * Decide how a transport list serializes into the signed registration payload,
 * preserving backward compatibility:
 *   - empty list ⇒ no transport field at all (direct, pre-bd-b7em shape).
 *   - single non-direct descriptor ⇒ legacy `transport` object, so a pre-bd-maas
 *     rendezvous (which only reads `transport`) keeps routing relay/iroh until the
 *     server learns to read `transports`.
 *   - multi-element list ⇒ new `transports` array (also mirror the first/preferred
 *     entry into legacy `transport` when it's non-direct, so old servers still see
 *     a usable single transport).
 */
export function serializeTransportAdvertisement(
  list: TransportDescriptor[]
): { transport?: TransportDescriptor; transports?: TransportDescriptor[] } {
  if (list.length === 0) return {};
  if (list.length === 1) {
    const only = list[0];
    return only.transport === 'direct' ? { transports: list } : { transport: only };
  }
  // Multi-element: advertise the full list; also expose the first non-direct entry
  // as legacy `transport` for old servers.
  const legacy = list.find((d) => d.transport !== 'direct');
  return { transports: list, ...(legacy ? { transport: legacy } : {}) };
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

/**
 * Identity card advertised inside the signed registration (bd-maas Part B), so
 * the rendezvous can serve relay-only peers' discovery info. A subset of the
 * /.well-known/ogp card. Its `publicKey` MUST equal the registration pubkey —
 * the server rejects a mismatch.
 */
export interface RegistrationCard {
  displayName?: string;
  email?: string;
  gatewayUrl?: string;
  publicKey: string;
  offeredIntents?: string[];
}

interface RegistrationAdvertisement {
  /** Legacy single descriptor (back-compat for pre-bd-maas servers). */
  transport?: TransportDescriptor;
  /** bd-maas: full ordered advertisement list. */
  transports?: TransportDescriptor[];
  /** bd-maas Part B: signed identity card. */
  card?: RegistrationCard;
}

async function doRegister(
  config: RendezvousConfig,
  pubkey: string,
  port: number,
  publicUrl?: string,
  advertisement?: RegistrationAdvertisement
): Promise<void> {
  // SECURITY (F-02): Sign the registration so the rendezvous server can verify
  // we actually hold the private key matching this pubkey. Without this, anyone
  // could squat on someone else's pubkey at the rendezvous.
  const { signCanonical } = await import('../shared/signing.js');
  const { getPrivateKey } = await import('./keypair.js');

  const innerPayload: {
    pubkey: string;
    port: number;
    publicUrl?: string;
    transport?: TransportDescriptor;
    transports?: TransportDescriptor[];
    card?: RegistrationCard;
  } = { pubkey, port };
  if (publicUrl) {
    innerPayload.publicUrl = publicUrl;
  }
  // bd-b7em/bd-maas: advertise transport(s) INSIDE the signed payload. Direct-only
  // advertisements omit both fields, so they stay byte-identical with pre-bd-b7em
  // daemons. The serializer decides legacy `transport` vs new `transports`.
  if (advertisement?.transport) innerPayload.transport = advertisement.transport;
  if (advertisement?.transports) innerPayload.transports = advertisement.transports;
  // bd-maas Part B: include the signed identity card so rendezvous can serve it
  // for relay-only peers (which have no public /.well-known/ogp).
  if (advertisement?.card) innerPayload.card = advertisement.card;

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
  transportConfig?: TransportConfig,
  opts?: { gatewayUrl?: string; card?: RegistrationCard }
): Promise<void> {
  if (!config.enabled) return;

  activeConfig = config;
  registeredPubkey = pubkey;

  // Check for OGP_PUBLIC_URL env var or config.publicUrl
  const publicUrl = process.env.OGP_PUBLIC_URL || config.publicUrl;

  // bd-maas: build the advertised transport LIST once. Direct-only ⇒ [] (omitted).
  // iroh node id is not available yet, so iroh modes resolve to nothing.
  const gatewayUrl = opts?.gatewayUrl;
  const transportList = buildTransportList(transportConfig, config.url, gatewayUrl);
  const serialized = serializeTransportAdvertisement(transportList);
  const advertisement: RegistrationAdvertisement = {
    ...serialized,
    // bd-maas Part B: include the card only when its publicKey matches ours.
    ...(opts?.card && opts.card.publicKey === pubkey ? { card: opts.card } : {})
  };
  if (transportList.length > 0) {
    console.log(`[OGP] Advertising transports: ${transportList.map((t) => t.transport).join(', ')}`);
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
    await doRegister(config, pubkey, port, publicUrl, advertisement);
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
      await doRegister(activeConfig, pubkey, port, publicUrl, advertisement);
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
 * Resolved transport for a peer (bd-b7em). Senders deliver via `direct` (the
 * `url`) or `relay` (the `relayUrl`); `iroh` is carried for Phase 3. Direct/legacy
 * records resolve to `{ mode:'direct', url }` exactly as `lookupPeer` does today.
 */
export type ResolvedTransport =
  | { mode: 'direct'; url: string }
  | { mode: 'relay'; relayUrl: string; pubkey: string }
  | { mode: 'iroh'; nodeId: string; relayUrl?: string; pubkey: string };

/** Shape of the rendezvous /peer/<pubkey> response (fields we read). */
interface PeerLookupResponse {
  ip?: string;
  port?: number;
  publicUrl?: string;
  transport?: TransportDescriptor;
  transports?: TransportDescriptor[];
  card?: RegistrationCard;
}

/**
 * Resolve the rendezvous lookup response into an ordered list of reachable
 * transports (bd-maas). Backward compatible:
 *   - new `transports` list ⇒ resolve each entry in order.
 *   - legacy single `transport` ⇒ one-element list.
 *   - neither ⇒ direct via publicUrl / ip:port (pre-bd-b7em behavior).
 * A direct entry resolves to its gatewayUrl, else the publicUrl/ip:port fallback.
 *
 * Pure — exported for testing.
 */
export function parseResolvedTransports(
  data: PeerLookupResponse,
  pubkey: string
): ResolvedTransport[] {
  const directUrl =
    data.publicUrl ? data.publicUrl :
    (data.ip && data.port) ? `http://${data.ip}:${data.port}` : null;

  const resolveOne = (t: TransportDescriptor): ResolvedTransport | null => {
    if (t.transport === 'relay') return { mode: 'relay', relayUrl: t.relayUrl, pubkey };
    if (t.transport === 'iroh') return { mode: 'iroh', nodeId: t.nodeId, ...(t.relayUrl ? { relayUrl: t.relayUrl } : {}), pubkey };
    // direct descriptor: prefer its gatewayUrl, else fall back to publicUrl/ip:port.
    const url = (t.transport === 'direct' && t.gatewayUrl) ? t.gatewayUrl : directUrl;
    return url ? { mode: 'direct', url } : null;
  };

  const list = Array.isArray(data.transports) && data.transports.length > 0
    ? data.transports
    : (data.transport ? [data.transport] : []);

  if (list.length > 0) {
    const resolved = list.map(resolveOne).filter((r): r is ResolvedTransport => r !== null);
    if (resolved.length > 0) return resolved;
  }

  // No usable descriptors ⇒ plain direct (legacy / pre-bd-b7em).
  return directUrl ? [{ mode: 'direct', url: directUrl }] : [];
}

async function fetchPeerRecord(
  config: RendezvousConfig,
  pubkey: string
): Promise<PeerLookupResponse | null> {
  if (!config.enabled) return null;
  const res = await fetch(`${config.url}/peer/${encodeURIComponent(pubkey)}`, {
    signal: AbortSignal.timeout(8000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Rendezvous lookup returned ${res.status}`);
  return await res.json() as PeerLookupResponse;
}

/**
 * Look up a peer and resolve the ordered list of ways to reach them (bd-maas).
 * Returns [] when the peer isn't registered or has no reachable address.
 */
export async function lookupPeerTransports(
  config: RendezvousConfig,
  pubkey: string
): Promise<ResolvedTransport[]> {
  if (!config.enabled) return [];
  try {
    const data = await fetchPeerRecord(config, pubkey);
    if (!data) return [];
    return parseResolvedTransports(data, pubkey);
  } catch (err) {
    console.warn(`[OGP] Rendezvous transport lookup failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Single-transport resolve (back-compat). Returns the FIRST/preferred reachable
 * transport, or null. Existing callers (heartbeat relay-reachability) keep
 * working; the delivery preference-walk uses `lookupPeerTransports`.
 */
export async function lookupPeerTransport(
  config: RendezvousConfig,
  pubkey: string
): Promise<ResolvedTransport | null> {
  const list = await lookupPeerTransports(config, pubkey);
  return list.length > 0 ? list[0] : null;
}

/**
 * Fetch a relay-only peer's signed identity card from rendezvous (bd-maas Part B).
 * Returns null when the peer isn't registered or advertised no card. The card's
 * `publicKey` is asserted to equal the looked-up pubkey (rendezvous stores it only
 * from the verified payload, but we double-check here defensively).
 */
export async function fetchPeerCard(
  config: RendezvousConfig,
  pubkey: string
): Promise<RegistrationCard | null> {
  if (!config.enabled) return null;
  try {
    const data = await fetchPeerRecord(config, pubkey);
    if (!data || !data.card) return null;
    if (data.card.publicKey !== pubkey) {
      console.warn('[OGP] Rendezvous card publicKey mismatch — ignoring card');
      return null;
    }
    return data.card;
  } catch (err) {
    console.warn(`[OGP] Rendezvous card lookup failed: ${(err as Error).message}`);
    return null;
  }
}
