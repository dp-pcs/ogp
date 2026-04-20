import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';
export const CANONICAL_PEER_ID_LENGTH = 32;
function getPeersFile() {
    return path.join(getConfigDir(), 'peers.json');
}
export function derivePeerIdFromPublicKey(publicKey) {
    return publicKey.substring(0, CANONICAL_PEER_ID_LENGTH);
}
function matchesPeerIdentity(peer, identity) {
    const canonicalLookupId = identity.publicKey ? derivePeerIdFromPublicKey(identity.publicKey) : undefined;
    if (identity.peerId && peer.id === identity.peerId) {
        return true;
    }
    if (identity.publicKey && peer.publicKey === identity.publicKey) {
        return true;
    }
    if (canonicalLookupId) {
        if (peer.id === canonicalLookupId) {
            return true;
        }
        if (peer.publicKey && derivePeerIdFromPublicKey(peer.publicKey) === canonicalLookupId) {
            return true;
        }
    }
    if (identity.gatewayUrl && peer.gatewayUrl === identity.gatewayUrl) {
        return true;
    }
    return false;
}
function rankPeerMatch(peer, identity) {
    const canonicalLookupId = identity.publicKey ? derivePeerIdFromPublicKey(identity.publicKey) : undefined;
    if (peer.status === 'pending' && canonicalLookupId && peer.id === canonicalLookupId)
        return 0;
    if (peer.status === 'pending' && identity.publicKey && peer.publicKey === identity.publicKey)
        return 1;
    if (peer.status === 'pending')
        return 2;
    if (canonicalLookupId && peer.id === canonicalLookupId)
        return 3;
    if (identity.publicKey && peer.publicKey === identity.publicKey)
        return 4;
    if (identity.peerId && peer.id === identity.peerId)
        return 5;
    if (identity.gatewayUrl && peer.gatewayUrl === identity.gatewayUrl)
        return 6;
    return 7;
}
function createPeerTombstone(peer, status, changedAt = new Date().toISOString()) {
    return {
        id: peer.id,
        displayName: peer.displayName,
        email: peer.email,
        gatewayUrl: peer.gatewayUrl,
        publicKey: peer.publicKey,
        status,
        requestedAt: peer.requestedAt,
        ...(peer.approvedAt ? { approvedAt: peer.approvedAt } : {}),
        ...(peer.agentId ? { agentId: peer.agentId } : {}),
        ...(status === 'rejected' ? { rejectedAt: changedAt } : { removedAt: changedAt })
    };
}
export function createPendingPeerRecord(input) {
    return {
        id: input.id,
        displayName: input.displayName,
        email: input.email,
        gatewayUrl: input.gatewayUrl,
        publicKey: input.publicKey,
        status: 'pending',
        requestedAt: input.requestedAt ?? new Date().toISOString(),
        ...(input.humanName ? { humanName: input.humanName } : {}),
        ...(input.agentName ? { agentName: input.agentName } : {}),
        ...(input.organization ? { organization: input.organization } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.offeredIntents && input.offeredIntents.length > 0 ? { offeredIntents: input.offeredIntents } : {})
    };
}
export function loadPeers() {
    ensureConfigDir();
    const peersFile = getPeersFile();
    if (!fs.existsSync(peersFile)) {
        return [];
    }
    const data = fs.readFileSync(peersFile, 'utf-8');
    const peers = JSON.parse(data);
    // Migration: petname → alias (backward compatibility)
    let migrated = false;
    for (const peer of peers) {
        if (peer.petname && !peer.alias) {
            peer.alias = peer.petname;
            migrated = true;
        }
    }
    // Save migration if any changes were made
    if (migrated) {
        savePeers(peers);
    }
    return peers;
}
export function savePeers(peers) {
    ensureConfigDir();
    const peersFile = getPeersFile();
    // Strip deprecated petname field from saved data (migration complete)
    const cleanPeers = peers.map(({ petname, ...peer }) => peer);
    const tempFile = `${peersFile}.tmp`;
    try {
        // BUILD-116: Atomic write - write to temp file first, then rename
        // This prevents race conditions where concurrent reads get stale data
        fs.writeFileSync(tempFile, JSON.stringify(cleanPeers, null, 2), 'utf-8');
        fs.renameSync(tempFile, peersFile);
        return true;
    }
    catch (error) {
        console.error('[OGP] Failed to save peers:', error);
        // Clean up temp file if it exists
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
        catch (cleanupError) {
            // Ignore cleanup errors
        }
        return false;
    }
}
export function addPeer(peer) {
    const peers = loadPeers();
    const matches = peers.filter((existingPeer) => matchesPeerIdentity(existingPeer, {
        peerId: peer.id,
        gatewayUrl: peer.gatewayUrl,
        publicKey: peer.publicKey
    }));
    if (matches.length === 0) {
        peers.push(peer);
        return savePeers(peers);
    }
    const preservedAlias = peer.alias ?? matches.find((candidate) => candidate.alias)?.alias;
    const replacement = preservedAlias ? { ...peer, alias: preservedAlias } : peer;
    const filtered = peers.filter((existingPeer) => !matches.some((candidate) => candidate.id === existingPeer.id));
    filtered.push(replacement);
    return savePeers(filtered);
}
export function getPeer(peerId) {
    // Handle null/undefined peerId gracefully
    if (!peerId) {
        return null;
    }
    const peers = loadPeers();
    // Try exact match first
    let peer = peers.find(p => p.id === peerId) || null;
    // If not found, try matching by public key prefix (BUILD-111)
    if (!peer && peerId.length >= 16) {
        // Use 32-char prefix minimum to avoid false matches on the shared Ed25519 DER header (first 24 chars are identical for all keys)
        const prefixLen = Math.max(32, peerId.length);
        peer = peers.find(p => p.publicKey && p.publicKey.startsWith(peerId.substring(0, prefixLen))) || null;
    }
    return peer;
}
// BUILD-111: Find peer by gateway URL (for port-agnostic lookups)
export function getPeerByUrl(gatewayUrl) {
    const peers = loadPeers();
    return peers.find(p => p.gatewayUrl === gatewayUrl) || null;
}
// BUILD-111: Find peer by public key (full or prefix)
export function getPeerByPublicKey(publicKey) {
    const peers = loadPeers();
    // Try exact match first
    let peer = peers.find(p => p.publicKey === publicKey) || null;
    // If not found, try prefix match
    if (!peer && publicKey.length >= 16) {
        const prefixLen2 = Math.max(32, publicKey.length);
        peer = peers.find(p => p.publicKey && p.publicKey.startsWith(publicKey.substring(0, prefixLen2))) || null;
    }
    return peer;
}
export function findPeersByIdentity(identity) {
    return loadPeers().filter((peer) => matchesPeerIdentity(peer, identity));
}
export function findBestPeerForApproval(identity) {
    const matches = findPeersByIdentity(identity);
    if (matches.length === 0)
        return null;
    return matches
        .slice()
        .sort((a, b) => {
        const rankDelta = rankPeerMatch(a, identity) - rankPeerMatch(b, identity);
        if (rankDelta !== 0)
            return rankDelta;
        return b.id.length - a.id.length;
    })[0] ?? null;
}
export function replacePeersByIdentity(identity, replacement) {
    const peers = loadPeers();
    const filtered = peers.filter((peer) => !matchesPeerIdentity(peer, identity));
    filtered.push(replacement);
    return savePeers(filtered);
}
export function approvePeer(peerId) {
    const peers = loadPeers();
    const peer = peers.find(p => p.id === peerId);
    if (!peer)
        return false;
    peer.status = 'approved';
    peer.approvedAt = new Date().toISOString();
    const saved = savePeers(peers);
    if (!saved) {
        console.error(`[OGP] Failed to persist approval for peer ${peerId}`);
    }
    return saved;
}
export function rejectPeer(peerId) {
    const peers = loadPeers();
    const peerIndex = peers.findIndex(p => p.id === peerId);
    if (peerIndex === -1)
        return false;
    peers[peerIndex] = createPeerTombstone(peers[peerIndex], 'rejected');
    return savePeers(peers);
}
export function removePeer(peerId) {
    const peers = loadPeers();
    const peerIndex = peers.findIndex(p => p.id === peerId);
    if (peerIndex === -1)
        return false;
    // Keep an auditable tombstone, but clear mutable relationship state so it
    // cannot leak into later federation attempts.
    peers[peerIndex] = createPeerTombstone(peers[peerIndex], 'removed');
    return savePeers(peers);
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