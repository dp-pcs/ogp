import express, { type Express, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { requireConfig, type OGPConfig, getConfigDir } from '../shared/config.js';
import { getPublicKey, getPrivateKey } from './keypair.js';
import { addPeer, getPeer, approvePeer, type Peer } from './peers.js';
import { handleMessage, type FederationMessage } from './message-handler.js';
import { signObject } from '../shared/signing.js';

let server: any = null;

const DAEMON_PID_FILE = path.join(getConfigDir(), 'daemon.pid');
const DAEMON_LOG_FILE = path.join(getConfigDir(), 'daemon.log');

export function startServer(config?: OGPConfig, background = false): void {
  const cfg = config || requireConfig();

  // If background mode requested, fork and exit parent
  if (background) {
    const logStream = fs.openSync(DAEMON_LOG_FILE, 'a');
    const child = spawn(process.execPath, [process.argv[1], 'start'], {
      detached: true,
      stdio: ['ignore', logStream, logStream]
    });

    child.unref();
    fs.writeFileSync(DAEMON_PID_FILE, child.pid!.toString(), 'utf-8');
    console.log(`OGP daemon started (PID: ${child.pid})`);
    console.log(`Logs: ${DAEMON_LOG_FILE}`);
    process.exit(0);
  }

  const app: Express = express();

  app.use(express.json());

  // /.well-known/ogp - Discovery endpoint
  app.get('/.well-known/ogp', (req: Request, res: Response) => {
    res.json({
      version: '0.1.0',
      displayName: cfg.displayName,
      email: cfg.email,
      gatewayUrl: cfg.gatewayUrl,
      publicKey: getPublicKey(),
      endpoints: {
        request: `${cfg.gatewayUrl}/federation/request`,
        approve: `${cfg.gatewayUrl}/federation/approve`,
        reply: `${cfg.gatewayUrl}/federation/reply/:nonce`
      }
    });
  });

  // POST /federation/request - Incoming federation request
  app.post('/federation/request', async (req: Request, res: Response) => {
    try {
      const { peer, signature } = req.body;

      if (!peer || !signature) {
        return res.status(400).json({ error: 'Missing peer or signature' });
      }

      const peerData: Peer = {
        id: peer.id,
        displayName: peer.displayName,
        email: peer.email,
        gatewayUrl: peer.gatewayUrl,
        publicKey: peer.publicKey,
        status: 'pending',
        requestedAt: new Date().toISOString()
      };

      addPeer(peerData);

      console.log(`[OGP] Federation request from ${peer.displayName} (${peer.id})`);

      res.json({
        received: true,
        status: 'pending',
        message: 'Federation request received and pending approval'
      });
    } catch (error) {
      console.error('[OGP] Error handling federation request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /federation/approve - Peer approves our request
  app.post('/federation/approve', async (req: Request, res: Response) => {
    try {
      const { peerId, approved } = req.body;

      if (!peerId || approved === undefined) {
        return res.status(400).json({ error: 'Missing peerId or approved status' });
      }

      const peer = getPeer(peerId);
      if (!peer) {
        return res.status(404).json({ error: 'Unknown peer' });
      }

      if (approved) {
        approvePeer(peerId);
        console.log(`[OGP] Federation approved by ${peer.displayName}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[OGP] Error handling approval:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /federation/message - Receive federated message
  app.post('/federation/message', async (req: Request, res: Response) => {
    try {
      const { message, signature } = req.body;

      if (!message || !signature) {
        return res.status(400).json({ error: 'Missing message or signature' });
      }

      const result = await handleMessage(message as FederationMessage, signature);

      if (result.success) {
        res.json(result.response);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('[OGP] Error handling message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /federation/reply/:nonce - Get reply to a message
  app.get('/federation/reply/:nonce', (req: Request, res: Response) => {
    // Simple implementation - in production, store replies in a database
    res.json({
      nonce: req.params.nonce,
      status: 'not-implemented',
      message: 'Reply storage not yet implemented'
    });
  });

  server = app.listen(cfg.daemonPort, () => {
    console.log(`[OGP] Daemon listening on port ${cfg.daemonPort}`);
    console.log(`[OGP] Public key: ${getPublicKey()}`);
  });
}

export function stopServer(): void {
  // Check for PID file
  if (!fs.existsSync(DAEMON_PID_FILE)) {
    console.log('OGP daemon is not running');
    return;
  }

  try {
    const pidStr = fs.readFileSync(DAEMON_PID_FILE, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      console.error('Invalid PID in daemon.pid file');
      fs.unlinkSync(DAEMON_PID_FILE);
      return;
    }

    // Check if process is running
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
    } catch (error) {
      console.log('OGP daemon is not running (stale PID file)');
      fs.unlinkSync(DAEMON_PID_FILE);
      return;
    }

    // Send SIGTERM
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(DAEMON_PID_FILE);
    console.log('OGP daemon stopped');
  } catch (error) {
    console.error('Failed to stop daemon:', error);
  }
}

export function getDaemonStatus(): { running: boolean; pid?: number } {
  if (!fs.existsSync(DAEMON_PID_FILE)) {
    return { running: false };
  }

  try {
    const pidStr = fs.readFileSync(DAEMON_PID_FILE, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      fs.unlinkSync(DAEMON_PID_FILE);
      return { running: false };
    }

    // Check if process is running
    try {
      process.kill(pid, 0);
      return { running: true, pid };
    } catch (error) {
      fs.unlinkSync(DAEMON_PID_FILE);
      return { running: false };
    }
  } catch (error) {
    return { running: false };
  }
}
