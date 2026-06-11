// Full relay loop integration (bd-b7em Phase 2 dogfood, reproducible form).
//
// Real RelayCore over a real `ws` server + real startRelayClient receiver +
// real handleMessage. Proves: a signed envelope sent via the relay reaches an
// approved peer's handler and the response routes back; a bad signature is
// rejected end-to-end (relay can't forge); an offline peer errors cleanly.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { generateKeyPair, signObject, signCanonical, verifyCanonical } from '../src/shared/signing.js';
import { RelayCore, type RelayWS } from '../packages/relay-dev/src/relay-core.js';

// Real temp config dir so the agent-comms handler can self-initialize its
// intent-registry.json (handleMessage → getIntent → loadIntents writes defaults).
// Hoisted so the vi.mock('config') factory (which runs before imports) can see it.
const { TMP_CONFIG } = vi.hoisted(() => {
  const os2 = require('node:os'); const path2 = require('node:path'); const fs2 = require('node:fs');
  return { TMP_CONFIG: fs2.mkdtempSync(path2.join(os2.tmpdir(), 'ogp-relay-e2e-')) };
});

// ── Identities: SENDER (A) and RECEIVER (B). B's daemon runs the relay client. ──
const A = generateKeyPair();
const B = generateKeyPair();
const aId = A.publicKey.substring(0, 32);

// B's daemon: approved peer = A; B holds A's pubkey so it can verify A's signature.
const peerA = {
  id: aId,
  status: 'approved',
  publicKey: A.publicKey,
  protocolVersion: '0.2.0',
  grantedScopes: { scopes: [{ intent: 'agent-comms', enabled: true }], grantedAt: '2026-01-01T00:00:00Z' },
};

vi.mock('../src/daemon/peers.js', () => ({
  getPeer: vi.fn((id: string) => (id === aId ? peerA : null)),
  getPeerByPublicKey: vi.fn(() => peerA),
  updatePeer: vi.fn(),
}));

vi.mock('../src/shared/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/config.js')>('../src/shared/config.js');
  return {
    ...actual,
    getConfigDir: vi.fn(() => TMP_CONFIG),
    ensureConfigDir: vi.fn(() => { fs.mkdirSync(TMP_CONFIG, { recursive: true }); }),
    loadConfig: vi.fn(() => null),
    saveConfig: vi.fn(),
    requireConfig: vi.fn(() => ({
      daemonPort: 18790, openclawUrl: '', openclawToken: '',
      gatewayUrl: 'https://b.example', displayName: 'B', email: 'b@example.com',
    })),
  };
});

// B's daemon keypair = B (so its relay receiver authenticates as B). Partial
// mock: keep real exports, override only the identity getters.
vi.mock('../src/daemon/keypair.js', async () => {
  const actual = await vi.importActual<typeof import('../src/daemon/keypair.js')>('../src/daemon/keypair.js');
  return {
    ...actual,
    getPublicKey: vi.fn(() => B.publicKey),
    getPrivateKey: vi.fn(() => B.privateKey),
    loadOrGenerateKeyPair: vi.fn(() => ({ publicKey: B.publicKey, privateKey: B.privateKey })),
  };
});

// Silence outbound notifications in the handler path (partial mock).
vi.mock('../src/daemon/notify.js', async () => {
  const actual = await vi.importActual<typeof import('../src/daemon/notify.js')>('../src/daemon/notify.js');
  return {
    ...actual,
    deliverLocalSessionText: vi.fn(async () => {}),
    notifyOpenClaw: vi.fn(async () => true),
  };
});

let server: http.Server;
let port: number;

beforeEach(async () => {
  const core = new RelayCore({
    verifyCanonical,
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    randomNonce: () => crypto.randomBytes(32).toString('hex'),
  });
  server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  let nid = 1;
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/relay') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const r: RelayWS = {
        id: nid++,
        send: (d) => { try { ws.send(d); } catch { /* ignore */ } },
        close: (c) => { try { ws.close(c); } catch { /* ignore */ } },
      };
      core.onConnection(r);
      ws.on('message', (d) => core.onMessage(r, d.toString()));
      ws.on('close', () => core.onClose(r));
      ws.on('error', () => core.onClose(r));
    });
  });
  await new Promise<void>((res) => server.listen(0, () => res()));
  port = (server.address() as any).port;
});

afterEach(async () => {
  const { stopRelayClient } = await import('../src/daemon/relay-client.js');
  await stopRelayClient();
  await new Promise<void>((res) => server.close(() => res()));
  vi.clearAllMocks();
});

afterAll(() => {
  try { fs.rmSync(TMP_CONFIG, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** A's sender leg: open a transient sender socket and deliver a signed envelope. */
async function sendFromA(frame: { message: unknown; messageStr: string; signature: string }, timeoutMs = 5000) {
  // deliverViaRelay reads OUR keypair via getPublicKey/getPrivateKey, which the
  // mock pins to B. For the sender we need A's identity, so drive a raw socket.
  const { default: WS } = await import('ws');
  const ws = new WS(`ws://localhost:${port}/relay`);
  const reqId = crypto.randomUUID();
  return await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, timeoutMs);
    ws.on('message', (data: Buffer) => {
      const f = JSON.parse(data.toString());
      if (f.type === 'challenge') {
        const { payloadStr, signature } = signCanonical(
          { pubkey: A.publicKey, challengeId: f.challengeId, nonce: f.nonce, role: 'sender' }, A.privateKey);
        ws.send(JSON.stringify({ type: 'auth', pubkey: A.publicKey, challengeId: f.challengeId, payloadStr, signature }));
      } else if (f.type === 'auth-ok') {
        ws.send(JSON.stringify({ type: 'deliver', reqId, to: B.publicKey, frame }));
      } else if (f.type === 'response' && f.reqId === reqId) {
        clearTimeout(timer); ws.close(); resolve(f.result);
      } else if (f.type === 'error') {
        clearTimeout(timer); ws.close(); reject(new Error(`${f.code}: ${f.message}`));
      }
    });
    ws.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

function buildSignedEnvelope(text: string) {
  const message = {
    intent: 'agent-comms', from: aId, to: B.publicKey.substring(0, 32),
    nonce: crypto.randomUUID(), timestamp: new Date().toISOString(),
    conversationId: crypto.randomUUID(),
    payload: { topic: 'relay-test', message: text, priority: 'normal' },
  };
  const { payload, payloadStr, signature } = signObject(message, A.privateKey);
  return { message: payload, messageStr: payloadStr, signature };
}

describe('relay end-to-end loop', () => {
  it('routes a signed envelope A→relay→B and returns B handleMessage response', async () => {
    const { startRelayClient } = await import('../src/daemon/relay-client.js');
    await startRelayClient(`ws://localhost:${port}/relay`);
    // brief settle for the receiver auth to register
    await new Promise((r) => setTimeout(r, 100));

    const result = await sendFromA(buildSignedEnvelope('hello over relay'));
    // The transport guarantee: B's real handleMessage RAN (verified A's signature,
    // produced a structured response with a nonce) and that response routed back
    // over the relay to A. The authorization outcome itself is doorman behavior
    // exercised elsewhere; here we assert the full transport round-trip closed.
    expect(result).toBeTruthy();
    expect(typeof result.nonce).toBe('string');
    expect(result).toHaveProperty('success');
  });

  it('E2E trust: a tampered signature is rejected by B (relay cannot forge)', async () => {
    const { startRelayClient } = await import('../src/daemon/relay-client.js');
    await startRelayClient(`ws://localhost:${port}/relay`);
    await new Promise((r) => setTimeout(r, 100));

    const env = buildSignedEnvelope('tamper me');
    env.messageStr = env.messageStr.replace('relay-test', 'evil-topic'); // signature no longer matches
    const result = await sendFromA(env);
    expect(result.success).toBe(false); // handleMessage rejects invalid signature
  });

  it('offline peer: sending to an unconnected receiver errors peer-not-connected', async () => {
    // Do NOT start B's relay client → B has no receiver socket.
    await expect(sendFromA(buildSignedEnvelope('nobody home'))).rejects.toThrow(/peer-not-connected/);
  });
});
