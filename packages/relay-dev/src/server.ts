// Local relay server entry (bd-b7em Phase 2 dogfood).
//
// Wraps RelayCore with a real `ws` WebSocketServer + a tiny HTTP health route.
// This is the SAME routing core that PR3 mounts into the rendezvous server; here
// it runs standalone on localhost so the full relay loop can be proven end-to-end
// WITHOUT touching packages/rendezvous (which auto-deploys to prod on merge).
//
//   PORT=3999 node dist/server.js   →   ws://localhost:3999/relay

import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RelayCore, type RelayWS } from './relay-core.js';
import { verifyCanonical } from './verify.js';

const PORT = Number(process.env.PORT ?? 3999);
const MAX_PAYLOAD = 256 * 1024;

const core = new RelayCore({
  verifyCanonical,
  now: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  randomNonce: () => crypto.randomBytes(32).toString('hex'),
  log: (msg) => console.log(`[relay] ${msg}`),
});

// Give each ws a stable numeric id so RelayCore can do identity comparisons.
let nextId = 1;
function adapt(ws: WebSocket): RelayWS {
  const id = nextId++;
  return {
    id,
    send: (data: string) => { try { ws.send(data); } catch { /* ignore */ } },
    close: (code?: number) => { try { ws.close(code); } catch { /* ignore */ } },
  };
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, routing: core.routing.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/relay') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const r = adapt(ws);
    core.onConnection(r);
    ws.on('message', (data) => core.onMessage(r, data.toString()));
    ws.on('close', () => core.onClose(r));
    ws.on('error', () => core.onClose(r));
  });
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT} (ws://localhost:${PORT}/relay, max payload ${MAX_PAYLOAD}B)`);
});
