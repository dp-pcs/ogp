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
//# sourceMappingURL=peers.js.map