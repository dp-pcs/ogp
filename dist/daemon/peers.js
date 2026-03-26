import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';
const PEERS_FILE = path.join(getConfigDir(), 'peers.json');
export function loadPeers() {
    ensureConfigDir();
    if (!fs.existsSync(PEERS_FILE)) {
        return [];
    }
    const data = fs.readFileSync(PEERS_FILE, 'utf-8');
    return JSON.parse(data);
}
export function savePeers(peers) {
    ensureConfigDir();
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), 'utf-8');
}
export function addPeer(peer) {
    const peers = loadPeers();
    const existing = peers.findIndex(p => p.id === peer.id);
    if (existing >= 0) {
        peers[existing] = peer;
    }
    else {
        peers.push(peer);
    }
    savePeers(peers);
}
export function getPeer(peerId) {
    const peers = loadPeers();
    return peers.find(p => p.id === peerId) || null;
}
export function approvePeer(peerId) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.status = 'approved';
    peer.approvedAt = new Date().toISOString();
    savePeers(peers);
    return true;
}
export function rejectPeer(peerId) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.status = 'rejected';
    savePeers(peers);
    return true;
}
export function listPeers(status) {
    const peers = loadPeers();
    if (status) {
        return peers.filter(p => p.status === status);
    }
    return peers;
}
/**
 * Update the scopes granted TO a peer (what they can request from us)
 */
export function updatePeerGrantedScopes(peerId, scopes) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.grantedScopes = scopes;
    savePeers(peers);
    return true;
}
/**
 * Update the scopes received FROM a peer (what we can request from them)
 */
export function updatePeerReceivedScopes(peerId, scopes) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.receivedScopes = scopes;
    savePeers(peers);
    return true;
}
/**
 * Update the protocol version for a peer
 */
export function updatePeerVersion(peerId, version) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.protocolVersion = version;
    savePeers(peers);
    return true;
}
/**
 * Get a peer's granted scopes (what they can request from us)
 */
export function getPeerGrantedScopes(peerId) {
    const peer = getPeer(peerId);
    return peer?.grantedScopes || null;
}
/**
 * Update multiple peer fields at once
 */
export function updatePeer(peerId, updates) {
    const peers = loadPeers();
    const peerIndex = peers.findIndex(p => p.id === peerId);
    if (peerIndex === -1)
        return false;
    peers[peerIndex] = { ...peers[peerIndex], ...updates };
    savePeers(peers);
    return true;
}
/**
 * Update response policy for a peer
 */
export function updatePeerResponsePolicy(peerId, policy) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.responsePolicy = policy;
    savePeers(peers);
    return true;
}
/**
 * Set a topic policy for a peer
 */
export function setPeerTopicPolicy(peerId, topic, level, notes) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
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
export function removePeerTopicPolicy(peerId, topic) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer || !peer.responsePolicy)
        return false;
    delete peer.responsePolicy[topic];
    savePeers(peers);
    return true;
}
/**
 * Get response policy for a peer (peer-specific only, no global fallback)
 */
export function getPeerResponsePolicy(peerId) {
    const peer = getPeer(peerId);
    return peer?.responsePolicy || null;
}
/**
 * Clear response policy for a peer (reset to global defaults)
 */
export function clearPeerResponsePolicy(peerId) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    delete peer.responsePolicy;
    savePeers(peers);
    return true;
}
/**
 * Set the default response level for a peer (used when no topic-specific policy exists)
 */
export function setPeerDefaultLevel(peerId, level) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.defaultLevel = level;
    savePeers(peers);
    return true;
}
/**
 * Get a peer's default level (or null if not set)
 */
export function getPeerDefaultLevel(peerId) {
    const peer = getPeer(peerId);
    return peer?.defaultLevel || null;
}
//# sourceMappingURL=peers.js.map