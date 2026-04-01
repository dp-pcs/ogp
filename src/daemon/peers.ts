import fs from 'node:fs';
import path from 'node:path';
import {
  getConfigDir,
  ensureConfigDir,
  type ResponseLevel,
  type ResponsePolicy,
  type TopicPolicy
} from '../shared/config.js';
import type { ScopeBundle } from './scopes.js';

// Re-export types for convenience
export type { ResponseLevel, ResponsePolicy, TopicPolicy };

export interface Peer {
  id: string;           // unique peer ID (hostname or user-chosen)
  displayName: string;
  email: string;
  gatewayUrl: string;
  publicKey: string;    // hex-encoded Ed25519 public key
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;  // ISO timestamp
  approvedAt?: string;
  metadata?: Record<string, any>;
  // v0.2.0 scope negotiation fields
  protocolVersion?: string;          // "0.1.0" or "0.2.0"
  grantedScopes?: ScopeBundle;       // what I grant TO this peer
  receivedScopes?: ScopeBundle;      // what this peer grants TO me
  offeredIntents?: string[];         // BUILD-110: intents offered by peer in request
  // Agent-comms response policy
  responsePolicy?: ResponsePolicy;   // how my agent responds to this peer
  defaultLevel?: ResponseLevel;      // per-peer default for unknown topics
}

const PEERS_FILE = path.join(getConfigDir(), 'peers.json');

export function loadPeers(): Peer[] {
  ensureConfigDir();
  if (!fs.existsSync(PEERS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(PEERS_FILE, 'utf-8');
  return JSON.parse(data) as Peer[];
}

export function savePeers(peers: Peer[]): void {
  ensureConfigDir();
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), 'utf-8');
}

export function addPeer(peer: Peer): void {
  const peers = loadPeers();
  const existing = peers.findIndex(p => p.id === peer.id);
  if (existing >= 0) {
    peers[existing] = peer;
  } else {
    peers.push(peer);
  }
  savePeers(peers);
}

export function getPeer(peerId: string): Peer | null {
  const peers = loadPeers();
  // Try exact match first
  let peer = peers.find(p => p.id === peerId) || null;
  // If not found, try matching by public key prefix (BUILD-111)
  if (!peer && peerId.length >= 16) {
    peer = peers.find(p => p.publicKey && p.publicKey.startsWith(peerId.substring(0, 16))) || null;
  }
  return peer;
}

// BUILD-111: Find peer by gateway URL (for port-agnostic lookups)
export function getPeerByUrl(gatewayUrl: string): Peer | null {
  const peers = loadPeers();
  return peers.find(p => p.gatewayUrl === gatewayUrl) || null;
}

// BUILD-111: Find peer by public key (full or prefix)
export function getPeerByPublicKey(publicKey: string): Peer | null {
  const peers = loadPeers();
  // Try exact match first
  let peer = peers.find(p => p.publicKey === publicKey) || null;
  // If not found, try prefix match
  if (!peer && publicKey.length >= 16) {
    peer = peers.find(p => p.publicKey && p.publicKey.startsWith(publicKey.substring(0, 16))) || null;
  }
  return peer;
}

export function approvePeer(peerId: string): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.status = 'approved';
  peer.approvedAt = new Date().toISOString();
  savePeers(peers);
  return true;
}

export function rejectPeer(peerId: string): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.status = 'rejected';
  savePeers(peers);
  return true;
}

export function listPeers(status?: 'pending' | 'approved' | 'rejected'): Peer[] {
  const peers = loadPeers();
  if (status) {
    return peers.filter(p => p.status === status);
  }
  return peers;
}

/**
 * Update the scopes granted TO a peer (what they can request from us)
 */
export function updatePeerGrantedScopes(peerId: string, scopes: ScopeBundle): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.grantedScopes = scopes;
  savePeers(peers);
  return true;
}

/**
 * Update the scopes received FROM a peer (what we can request from them)
 */
export function updatePeerReceivedScopes(peerId: string, scopes: ScopeBundle): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.receivedScopes = scopes;
  savePeers(peers);
  return true;
}

/**
 * Update the protocol version for a peer
 */
export function updatePeerVersion(peerId: string, version: string): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.protocolVersion = version;
  savePeers(peers);
  return true;
}

/**
 * Get a peer's granted scopes (what they can request from us)
 */
export function getPeerGrantedScopes(peerId: string): ScopeBundle | null {
  const peer = getPeer(peerId);
  return peer?.grantedScopes || null;
}

/**
 * Update multiple peer fields at once
 */
export function updatePeer(peerId: string, updates: Partial<Peer>): boolean {
  const peers = loadPeers();
  const peerIndex = peers.findIndex(p => p.id === peerId);
  if (peerIndex === -1) return false;

  peers[peerIndex] = { ...peers[peerIndex], ...updates };
  savePeers(peers);
  return true;
}

/**
 * Update response policy for a peer
 */
export function updatePeerResponsePolicy(peerId: string, policy: ResponsePolicy): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.responsePolicy = policy;
  savePeers(peers);
  return true;
}

/**
 * Set a topic policy for a peer
 */
export function setPeerTopicPolicy(
  peerId: string,
  topic: string,
  level: ResponseLevel,
  notes?: string
): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  if (!peer.responsePolicy) {
    peer.responsePolicy = {};
  }

  peer.responsePolicy[topic] = { level, ...(notes && { notes }) };
  savePeers(peers);
  return true;
}

/**
 * Remove a topic from peer's response policy
 */
export function removePeerTopicPolicy(peerId: string, topic: string): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer || !peer.responsePolicy) return false;

  delete peer.responsePolicy[topic];
  savePeers(peers);
  return true;
}

/**
 * Get response policy for a peer (peer-specific only, no global fallback)
 */
export function getPeerResponsePolicy(peerId: string): ResponsePolicy | null {
  const peer = getPeer(peerId);
  return peer?.responsePolicy || null;
}

/**
 * Clear response policy for a peer (reset to global defaults)
 */
export function clearPeerResponsePolicy(peerId: string): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  delete peer.responsePolicy;
  savePeers(peers);
  return true;
}

/**
 * Set the default response level for a peer (used when no topic-specific policy exists)
 */
export function setPeerDefaultLevel(peerId: string, level: ResponseLevel): boolean {
  const peers = loadPeers();
  const peer = peers.find(p => p.id === peerId);
  if (!peer) return false;

  peer.defaultLevel = level;
  savePeers(peers);
  return true;
}

/**
 * Get a peer's default level (or null if not set)
 */
export function getPeerDefaultLevel(peerId: string): ResponseLevel | null {
  const peer = getPeer(peerId);
  return peer?.defaultLevel || null;
}
