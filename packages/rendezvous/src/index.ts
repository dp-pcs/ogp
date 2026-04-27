import express, { Request, Response } from 'express';
import { verifyCanonical, type VerifyResult } from './verify.js';

const app = express();
app.use(express.json());

// SECURITY (F-06): Configure proxy trust explicitly so req.ip reflects the
// real client, and X-Forwarded-For from non-trusted hops is ignored.
// Default: trust 1 hop (typical: cloudflared / ALB / nginx in front of us).
// Override via TRUST_PROXY_HOPS env var (number of hops, or 'false' to use
// the socket address only).
const trustProxyEnv = (process.env.TRUST_PROXY_HOPS ?? '1').trim();
const trustProxySetting: number | false =
  trustProxyEnv === 'false' ? false : (Number.isFinite(Number(trustProxyEnv)) ? Number(trustProxyEnv) : 1);
app.set('trust proxy', trustProxySetting);

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const TTL_MS = 90_000; // 90 seconds
const CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60 seconds
const INVITE_TTL_MS = 600_000; // 10 minutes

interface PeerRecord {
  pubkey: string;
  ip: string;
  port: number;
  lastSeen: number; // unix timestamp ms
}

interface InviteRecord {
  token: string;
  pubkey: string;
  ip: string;
  port: number;
  createdAt: number; // unix timestamp ms
}

const peers = new Map<string, PeerRecord>();
const invites = new Map<string, InviteRecord>();

/** Generate a random 6-char alphanumeric token */
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Periodic cleanup of expired peers and invites
setInterval(() => {
  const now = Date.now();
  let cleanedPeers = 0;
  for (const [key, peer] of peers.entries()) {
    if (now - peer.lastSeen > TTL_MS) {
      peers.delete(key);
      cleanedPeers++;
    }
  }
  if (cleanedPeers > 0) {
    console.log(`[rendezvous] Cleaned up ${cleanedPeers} expired peer(s). Active peers: ${peers.size}`);
  }

  let cleanedInvites = 0;
  for (const [token, invite] of invites.entries()) {
    if (now - invite.createdAt > INVITE_TTL_MS) {
      invites.delete(token);
      cleanedInvites++;
    }
  }
  if (cleanedInvites > 0) {
    console.log(`[rendezvous] Cleaned up ${cleanedInvites} expired invite(s). Active invites: ${invites.size}`);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * SECURITY (F-06): Use req.ip (Express-derived, respects the configured
 * `trust proxy` setting). Previously this hand-parsed X-Forwarded-For with
 * no validation, letting any client spoof their published gateway IP.
 *
 * `req.ip` returns the leftmost untrusted value in X-Forwarded-For if the
 * request came through a configured trusted hop, otherwise the socket
 * address. With trust proxy off it's always the socket.
 */
function getCallerIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
}

/**
 * Validate a signed registration envelope. Pure function, exported for tests.
 *
 * SECURITY (F-02): The previous version stored whatever pubkey the caller
 * claimed, with no proof of possession. A malicious client could register
 * THEIR ip:port under VICTIM's pubkey, intercepting subsequent rendezvous
 * lookups. This forces the caller to prove possession of the private key
 * matching the announced pubkey before we'll publish anything.
 *
 * Wire shape:
 *   { payloadStr: "<JSON of {pubkey, port, timestamp}>", signature: "<hex>" }
 * Inner payload timestamp is an ISO-8601 string (5 min freshness window).
 */
export interface RegistrationValidationOk {
  ok: true;
  pubkey: string;
  port: number;
  /** Optional public URL the peer wants other peers to use to reach them. */
  publicUrl?: string;
}
export interface RegistrationValidationErr {
  ok: false;
  status: number;
  error: string;
}
export type RegistrationValidation = RegistrationValidationOk | RegistrationValidationErr;

export function validateSignedRegistration(
  body: any,
  verifyImpl: (env: { payloadStr?: string; signature?: string }, pk: string) => VerifyResult = verifyCanonical
): RegistrationValidation {
  const { payloadStr, signature } = (body || {}) as { payloadStr?: unknown; signature?: unknown };

  if (typeof payloadStr !== 'string' || !payloadStr || typeof signature !== 'string' || !signature) {
    return { ok: false, status: 400, error: 'Missing payloadStr or signature' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(payloadStr);
  } catch {
    return { ok: false, status: 400, error: 'payloadStr is not valid JSON' };
  }

  const { pubkey, port, publicUrl } = parsed;
  if (typeof pubkey !== 'string' || !pubkey) {
    return { ok: false, status: 400, error: 'pubkey is required and must be a string' };
  }
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    return { ok: false, status: 400, error: 'port is required and must be a number (1-65535)' };
  }

  const verifyResult = verifyImpl({ payloadStr, signature }, pubkey);
  if (!verifyResult.ok) {
    return { ok: false, status: 401, error: `Signature verification failed: ${verifyResult.reason}` };
  }

  return {
    ok: true,
    pubkey,
    port,
    ...(typeof publicUrl === 'string' && publicUrl ? { publicUrl } : {})
  };
}

// ─────────────────────────────────────────────
// GET / — health check
// ─────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, peers: peers.size });
});

// ─────────────────────────────────────────────
// POST /register — register or refresh a peer
// SECURITY (F-02): requires a signed envelope; the signature proves the
// caller holds the private key matching the announced pubkey.
// ─────────────────────────────────────────────
app.post('/register', (req: Request, res: Response) => {
  const validation = validateSignedRegistration(req.body);
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  const { pubkey, port } = validation;
  const ip = getCallerIp(req);
  const now = Date.now();

  peers.set(pubkey, { pubkey, ip, port, lastSeen: now });

  console.log(`[rendezvous] Registered ${pubkey.slice(0, 8)}... from ${ip}:${port}`);

  res.json({ ok: true, yourIp: ip });
});

// ─────────────────────────────────────────────
// GET /peer/:pubkey — look up a peer
// ─────────────────────────────────────────────
app.get('/peer/:pubkey', (req: Request, res: Response) => {
  const { pubkey } = req.params;
  const peer = peers.get(pubkey);

  if (!peer) {
    res.status(404).json({ error: 'Peer not found' });
    return;
  }

  const age = Date.now() - peer.lastSeen;
  if (age > TTL_MS) {
    peers.delete(pubkey);
    res.status(404).json({ error: 'Peer registration expired' });
    return;
  }

  res.json({
    pubkey: peer.pubkey,
    ip: peer.ip,
    port: peer.port,
    lastSeen: peer.lastSeen,
  });
});

// ─────────────────────────────────────────────
// DELETE /peer/:pubkey — deregister immediately
// ─────────────────────────────────────────────
app.delete('/peer/:pubkey', (req: Request, res: Response) => {
  const { pubkey } = req.params;
  const existed = peers.has(pubkey);
  peers.delete(pubkey);

  if (existed) {
    console.log(`[rendezvous] Deregistered ${pubkey.slice(0, 8)}...`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Peer not found' });
  }
});

// ─────────────────────────────────────────────
// POST /invite — create a federation invite token
// SECURITY (F-02): requires a signed envelope; same shape as /register.
// ─────────────────────────────────────────────
app.post('/invite', (req: Request, res: Response) => {
  const validation = validateSignedRegistration(req.body);
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  const { pubkey, port } = validation;
  const ip = getCallerIp(req);
  const createdAt = Date.now();

  // Generate a unique token (retry on collision)
  let token: string;
  let attempts = 0;
  do {
    token = generateToken();
    attempts++;
  } while (invites.has(token) && attempts < 10);

  invites.set(token, { token, pubkey, ip, port, createdAt });

  console.log(`[rendezvous] Invite created: ${token} for ${pubkey.slice(0, 8)}... from ${ip}:${port}`);

  res.json({ ok: true, token, expiresIn: 600 });
});

// ─────────────────────────────────────────────
// GET /invite/:token — look up an invite token
// ─────────────────────────────────────────────
app.get('/invite/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const invite = invites.get(token);

  if (!invite) {
    res.status(404).json({ error: 'Invite not found or expired' });
    return;
  }

  const age = Date.now() - invite.createdAt;
  if (age > INVITE_TTL_MS) {
    invites.delete(token);
    res.status(404).json({ error: 'Invite not found or expired' });
    return;
  }

  // Does NOT consume the token — allow multiple accepts
  res.json({
    pubkey: invite.pubkey,
    ip: invite.ip,
    port: invite.port,
  });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[rendezvous] OGP Rendezvous Server listening on port ${PORT}`);
  console.log(`[rendezvous] Peer TTL: ${TTL_MS / 1000}s | Invite TTL: ${INVITE_TTL_MS / 1000}s | Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);
});
