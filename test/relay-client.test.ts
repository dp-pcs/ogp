import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RelayCore, type RelayWS } from '../packages/relay-dev/src/relay-core.js';
import { verifyCanonical } from '../src/shared/signing.js';
import { deliverViaRelay, stopRelayClient } from '../src/daemon/relay-client.js';

// Spin up a real relay (RelayCore + ws) on an ephemeral port so the client's
// actual socket + handshake + correlation logic runs end-to-end. A stub
// "receiver" responds to deliver frames so deliverViaRelay can resolve.

let server: http.Server;
let port: number;
let core: RelayCore;
const stubReceivers = new Map<string, (reqId: string, frame: unknown) => void>();

function adapt(ws: WebSocket, id: number): RelayWS {
  return {
    id,
    send: (d: string) => { try { ws.send(d); } catch { /* ignore */ } },
    close: (c?: number) => { try { ws.close(c); } catch { /* ignore */ } },
  };
}

beforeEach(async () => {
  core = new RelayCore({
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
    wss.handleUpgrade(req, socket, head, (ws) => {
      const r = adapt(ws, nid++);
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
  await stopRelayClient();
  stubReceivers.clear();
  await new Promise<void>((res) => server.close(() => res()));
});

/** Connect a raw receiver that auto-answers deliver frames with a fixed result. */
async function connectStubReceiver(pubkey: string, privateKey: string, answer: unknown): Promise<WebSocket> {
  const { default: WS } = await import('ws');
  const { signCanonical } = await import('../src/shared/signing.js');
  const ws = new WS(`ws://localhost:${port}/relay`);
  await new Promise<void>((resolve, reject) => {
    ws.on('message', (data: Buffer) => {
      const f = JSON.parse(data.toString());
      if (f.type === 'challenge') {
        const { payloadStr, signature } = signCanonical(
          { pubkey, challengeId: f.challengeId, nonce: f.nonce, role: 'receiver' }, privateKey);
        ws.send(JSON.stringify({ type: 'auth', pubkey, challengeId: f.challengeId, payloadStr, signature }));
      } else if (f.type === 'auth-ok') {
        resolve();
      } else if (f.type === 'auth-err') {
        reject(new Error(f.reason));
      } else if (f.type === 'deliver') {
        ws.send(JSON.stringify({ type: 'response', reqId: f.reqId, result: answer }));
      }
    });
    ws.on('error', reject);
  });
  return ws;
}

describe('relay-client deliverViaRelay (transient sender)', () => {
  it('delivers to a connected receiver and resolves with its response', async () => {
    const recv = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    const recvPub = recv.publicKey.toString('hex');
    const recvPriv = recv.privateKey.toString('hex');
    const ws = await connectStubReceiver(recvPub, recvPriv, { success: true, nonce: 'ok' });

    const result = await deliverViaRelay(
      `ws://localhost:${port}/relay`, recvPub,
      { message: { intent: 'x' }, messageStr: '{"intent":"x"}', signature: 'sig' }, 5000,
    );
    expect(result).toEqual({ success: true, nonce: 'ok' });
    ws.close();
  });

  it('rejects when the destination peer is not connected', async () => {
    await expect(
      deliverViaRelay(`ws://localhost:${port}/relay`, 'pubGHOST',
        { message: {}, messageStr: '{}', signature: 'sig' }, 5000),
    ).rejects.toThrow();
  });

  it('rejects on deliver timeout when no response comes back', async () => {
    // Receiver that authenticates but never answers deliver frames.
    const kp = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    const pub = kp.publicKey.toString('hex');
    const priv = kp.privateKey.toString('hex');
    const { default: WS } = await import('ws');
    const { signCanonical } = await import('../src/shared/signing.js');
    const silent = new WS(`ws://localhost:${port}/relay`);
    await new Promise<void>((resolve) => {
      silent.on('message', (data: Buffer) => {
        const f = JSON.parse(data.toString());
        if (f.type === 'challenge') {
          const { payloadStr, signature } = signCanonical({ pubkey: pub, challengeId: f.challengeId, nonce: f.nonce, role: 'receiver' }, priv);
          silent.send(JSON.stringify({ type: 'auth', pubkey: pub, challengeId: f.challengeId, payloadStr, signature }));
        } else if (f.type === 'auth-ok') { resolve(); }
        // deliberately ignore 'deliver'
      });
    });

    await expect(
      deliverViaRelay(`ws://localhost:${port}/relay`, pub,
        { message: {}, messageStr: '{}', signature: 'sig' }, 300),
    ).rejects.toThrow(/timeout/i);
    silent.close();
  });
});
