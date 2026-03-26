import express, { type Express, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const OGP_VERSION: string = _require('../../package.json').version;
import { requireConfig, loadConfig, type OGPConfig, getConfigDir } from '../shared/config.js';
import { getPublicKey, getPrivateKey } from './keypair.js';
import { addPeer, getPeer, approvePeer, listPeers, updatePeer, updatePeerReceivedScopes, type Peer } from './peers.js';
import { handleMessage, type FederationMessage } from './message-handler.js';
import { signObject } from '../shared/signing.js';
import { notifyOpenClaw } from './notify.js';
import { startDoormanCleanup, stopDoormanCleanup } from './doorman.js';
import { startReplyCleanup, stopReplyCleanup, getPendingReply, deletePendingReply, storePendingReply, type ReplyPayload } from './reply-handler.js';
import type { ScopeBundle } from './scopes.js';
import { loadIntents } from './intent-registry.js';

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
    // Get supported intents from registry
    const intents = loadIntents();
    const intentNames = intents.map(i => i.name);

    res.json({
      version: OGP_VERSION,
      displayName: cfg.displayName,
      email: cfg.email,
      gatewayUrl: cfg.gatewayUrl,
      publicKey: getPublicKey(),
      capabilities: {
        intents: intentNames,
        features: ['scope-negotiation', 'reply-callback']
      },
      endpoints: {
        request: `${cfg.gatewayUrl}/federation/request`,
        approve: `${cfg.gatewayUrl}/federation/approve`,
        message: `${cfg.gatewayUrl}/federation/message`,
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

      // BUILD-77: Fire immediate OpenClaw notification to agent session
      const notificationText = `[OGP Federation Request] ${peer.displayName} (${peer.id}) requests federation approval\n` +
        `Gateway: ${peer.gatewayUrl}\n` +
        `Email: ${peer.email}\n` +
        `Type: Bidirectional (two-way) federation\n` +
        `Scopes: Pending negotiation during approval\n` +
        `Action: Review and approve/reject using: ogp federation approve ${peer.id}`;

      // Send notification with metadata for agent processing
      const notificationPayload = {
        text: notificationText,
        sessionKey: 'agent:main:main', // Default main agent session
        metadata: {
          ogp: {
            type: 'federation_request',
            peer: {
              id: peer.id,
              displayName: peer.displayName,
              email: peer.email,
              gatewayUrl: peer.gatewayUrl
            },
            requestedAt: peerData.requestedAt,
            federationType: 'bidirectional',
            scopeStatus: 'pending_negotiation',
            approvalCommand: `ogp federation approve ${peer.id}`
          }
        }
      };

      // Fire notification immediately (not via heartbeat)
      try {
        const notified = await notifyOpenClaw(notificationPayload);
        if (notified) {
          console.log(`[OGP] Agent session notified of federation request from ${peer.displayName}`);
        } else {
          console.warn(`[OGP] Failed to notify agent session of federation request from ${peer.displayName}`);
        }
      } catch (error) {
        console.error(`[OGP] Error notifying agent session:`, error);
      }

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
  // Accepts both package format {peerId, approved} and fork format {fromGatewayId, fromGatewayUrl, ...}
  // v0.2.0: Also accepts scopeGrants for scope negotiation
  app.post('/federation/approve', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};

      // Fork format: full identity card sent as approval signal
      const fromGatewayId = body.fromGatewayId;
      const fromGatewayUrl = body.fromGatewayUrl;
      const fromDisplayName = body.fromDisplayName;
      const fromPublicKey = body.fromPublicKey;
      const fromEmail = body.fromEmail;

      // Package format: simple peerId + approved flag
      const peerId = body.peerId;

      // v0.2.0: Scope grants from the approving peer
      const scopeGrants = body.scopeGrants as ScopeBundle | undefined;
      const protocolVersion = body.protocolVersion || (scopeGrants ? '0.2.0' : '0.1.0');

      // Find the peer to approve — try multiple strategies
      let peer = null;

      if (peerId) peer = getPeer(peerId);
      if (!peer && fromGatewayId) peer = getPeer(fromGatewayId);
      if (!peer && fromGatewayUrl) {
        const allPeers = listPeers();
        peer = allPeers.find((p: Peer) => p.gatewayUrl === fromGatewayUrl) || null;
      }
      // Last resort: approve any pending peer
      if (!peer) {
        const allPeers = listPeers();
        peer = allPeers.find((p: Peer) => p.status === 'pending') || null;
      }

      if (!peer) {
        return res.status(404).json({ error: 'No pending peer found' });
      }

      // Update peer info if fork sent richer data
      const peerUpdates: Partial<Peer> = {};
      if (fromDisplayName) peerUpdates.displayName = fromDisplayName;
      if (fromPublicKey) peerUpdates.publicKey = fromPublicKey;
      if (fromEmail) peerUpdates.email = fromEmail;
      peerUpdates.protocolVersion = protocolVersion;

      // Store received scopes (what this peer grants TO us)
      if (scopeGrants) {
        peerUpdates.receivedScopes = scopeGrants;
        console.log(`[OGP] Received scope grants from ${peer.displayName}:`, scopeGrants.scopes.map(s => s.intent).join(', '));
      }

      // Update peer with new info
      if (Object.keys(peerUpdates).length > 0) {
        updatePeer(peer.id, peerUpdates);
      }

      approvePeer(peer.id);
      console.log(`[OGP] Federation approved by ${peer.displayName} (v${protocolVersion})`);

      // BUILD-99/100: Auto-grant default scopes back to the approving peer if they have none yet
      // This ensures bidirectional scope negotiation happens in a single handshake
      const { updatePeerGrantedScopes } = await import('./peers.js');
      const { createScopeBundle, createScopeGrant, DEFAULT_RATE_LIMIT } = await import('./scopes.js');
      const { getPrivateKey: _getPrivateKey } = await import('./keypair.js');
      const { signObject: _signObject } = await import('../shared/signing.js');

      const freshPeer = getPeer(peer.id);
      if (freshPeer && !freshPeer.grantedScopes) {
        const defaultIntents = ['message', 'agent-comms', 'project.join', 'project.contribute', 'project.query', 'project.status'];
        const scopes = defaultIntents.map(intent => createScopeGrant(intent, { rateLimit: DEFAULT_RATE_LIMIT }));
        const bundle = createScopeBundle(scopes);
        updatePeerGrantedScopes(peer.id, bundle);
        console.log(`[OGP] Auto-granted default scopes to ${peer.displayName}: ${defaultIntents.join(', ')}`);

        // Send our grants back to the approving peer
        try {
          const ourConfig = requireConfig();
          const keypair = (await import('./keypair.js')).loadOrGenerateKeyPair();
          await fetch(`${freshPeer.gatewayUrl}/federation/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromGatewayId: `${new URL(ourConfig.gatewayUrl).hostname}:${ourConfig.daemonPort}`,
              fromDisplayName: ourConfig.displayName,
              fromGatewayUrl: ourConfig.gatewayUrl,
              fromPublicKey: keypair.publicKey,
              fromEmail: ourConfig.email,
              timestamp: new Date().toISOString(),
              protocolVersion: '0.2.0',
              scopeGrants: bundle
            })
          });
          console.log(`[OGP] Sent auto-grant confirmation back to ${peer.displayName}`);
        } catch (e) {
          console.warn(`[OGP] Could not send auto-grant back to ${peer.displayName}:`, e);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[OGP] Error handling approval:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /federation/ping - Simple liveness + identity check (no auth required)
  app.get('/federation/ping', (req: Request, res: Response) => {
    res.json({
      pong: true,
      displayName: cfg.displayName,
      gatewayUrl: cfg.gatewayUrl,
      timestamp: new Date().toISOString()
    });
  });

  // POST /federation/message - Receive federated message
  app.post('/federation/message', async (req: Request, res: Response) => {
    try {
      const { message, messageStr, signature } = req.body;

      if (!message || !signature) {
        return res.status(400).json({ error: 'Missing message or signature' });
      }

      const result = await handleMessage(message as FederationMessage, signature, messageStr);

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

  // GET /federation/reply/:nonce - Poll for reply to a message
  app.get('/federation/reply/:nonce', (req: Request, res: Response) => {
    const { nonce } = req.params;
    const reply = getPendingReply(nonce);

    if (!reply) {
      return res.status(404).json({
        nonce,
        status: 'pending',
        message: 'Reply not yet available'
      });
    }

    // Delete after retrieval
    deletePendingReply(nonce);

    res.json({
      nonce,
      status: 'complete',
      reply: {
        success: reply.success,
        data: reply.data,
        error: reply.error,
        timestamp: reply.timestamp
      }
    });
  });

  // POST /federation/reply/:nonce - Receive reply callback from remote gateway
  app.post('/federation/reply/:nonce', (req: Request, res: Response) => {
    const { nonce } = req.params;
    const body = req.body || {};

    // The reply can come in different formats
    const reply = body.reply || body;

    const replyPayload: ReplyPayload = {
      nonce,
      success: reply.success ?? true,
      data: reply.data,
      error: reply.error,
      timestamp: reply.timestamp || new Date().toISOString()
    };

    // Store for later retrieval
    storePendingReply(nonce, replyPayload);
    console.log(`[OGP] Received reply callback for nonce ${nonce}`);

    res.json({ received: true });
  });

  server = app.listen(cfg.daemonPort, () => {
    console.log(`[OGP] Daemon listening on port ${cfg.daemonPort}`);
    console.log(`[OGP] Public key: ${getPublicKey()}`);

    // Start cleanup timers
    startDoormanCleanup();
    startReplyCleanup();
    console.log(`[OGP] Started doorman and reply cleanup timers`);
  });
}

export function stopServer(): void {
  // Stop cleanup timers
  stopDoormanCleanup();
  stopReplyCleanup();

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

export async function getDaemonStatus(): Promise<{ running: boolean; pid?: number; portDetected?: boolean }> {
  const config = loadConfig();
  const port = config?.daemonPort ?? 18790;

  // Check PID file first
  let pidRunning = false;
  let pid: number | undefined;

  if (fs.existsSync(DAEMON_PID_FILE)) {
    try {
      const pidStr = fs.readFileSync(DAEMON_PID_FILE, 'utf-8').trim();
      const parsedPid = parseInt(pidStr, 10);
      if (!isNaN(parsedPid)) {
        try {
          process.kill(parsedPid, 0);
          pidRunning = true;
          pid = parsedPid;
        } catch {
          fs.unlinkSync(DAEMON_PID_FILE);
        }
      } else {
        fs.unlinkSync(DAEMON_PID_FILE);
      }
    } catch {
      // ignore
    }
  }

  if (pidRunning) {
    return { running: true, pid };
  }

  // PID file absent or stale — check if something is actually listening on the port
  // Use net.createServer to attempt binding; if it fails with EADDRINUSE the port is taken
  try {
    const net = await import('node:net');
    const portInUse = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'EADDRINUSE');
      });
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      server.listen(port);
    });
    if (portInUse) {
      return { running: true, portDetected: true };
    }
  } catch {
    // ignore detection errors
  }

  return { running: false };
}
