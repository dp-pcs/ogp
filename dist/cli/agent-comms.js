/**
 * CLI commands for agent-comms configuration
 */
import { loadAgentCommsConfig, setGlobalTopicPolicy, setDefaultLevel, getAllEffectivePolicies, readActivityLog, clearActivityLog, setActivityLogging } from '../daemon/agent-comms.js';
import { listPeers, getPeer, setPeerTopicPolicy, removePeerTopicPolicy, clearPeerResponsePolicy, setPeerDefaultLevel } from '../daemon/peers.js';
/**
 * Show all policies (global + per-peer)
 */
export function showPolicies(peerId) {
    const config = loadAgentCommsConfig();
    if (peerId) {
        // Show specific peer's effective policies as a readable status page
        const peer = findPeerByIdOrName(peerId);
        if (!peer) {
            console.error(`Peer not found: ${peerId}`);
            return;
        }
        console.log(`\nAGENT-COMMS STATUS FOR ${peer.displayName} (${peer.id}):\n`);
        const effective = getAllEffectivePolicies(peer.id);
        const peerSpecific = peer.responsePolicy || {};
        const effectiveDefault = peer.defaultLevel || config.defaultLevel;
        // Partition into allowed and blocked
        const allowed = [];
        const blocked = [];
        for (const [topic, policy] of Object.entries(effective)) {
            if (policy.level === 'off') {
                blocked.push(topic);
            }
            else {
                const source = peerSpecific[topic] ? '' : ' (global)';
                const notes = policy.notes ? ` — ${policy.notes}` : '';
                allowed.push(`  ✓ ${topic}: ${policy.level}${source}${notes}`);
            }
        }
        if (allowed.length > 0) {
            console.log('  ALLOWED TOPICS (messages will reach your agent):');
            allowed.forEach(l => console.log(l));
        }
        else {
            console.log('  ⚠  No topics currently allowed for this peer.');
        }
        if (blocked.length > 0) {
            console.log('\n  BLOCKED TOPICS (messages are rejected silently to sender):');
            blocked.forEach(t => console.log(`  ✗ ${t}: off`));
        }
        const defaultIsOff = effectiveDefault === 'off';
        console.log(`\n  Default for unknown topics: ${effectiveDefault}${defaultIsOff ? ' (anything not listed above is blocked)' : ''}`);
        if (allowed.length === 0 || defaultIsOff) {
            console.log(`\n  NEXT STEPS:`);
            if (allowed.length === 0) {
                console.log(`    Add a topic so messages get through:`);
                console.log(`    ogp agent-comms add-topic ${peer.id} general --level summary`);
            }
            if (defaultIsOff) {
                console.log(`    Or open all topics by default:`);
                console.log(`    ogp agent-comms set-default ${peer.id} summary`);
            }
        }
        else {
            console.log(`\n  Commands:`);
            console.log(`    Add topic:    ogp agent-comms add-topic ${peer.id} <topic> --level summary`);
            console.log(`    Block topic:  ogp agent-comms set-topic ${peer.id} <topic> off`);
            console.log(`    Remove topic: ogp agent-comms remove-topic ${peer.id} <topic>`);
        }
    }
    else {
        // Show global policies and summary of per-peer
        console.log('\nGLOBAL POLICIES:\n');
        if (Object.keys(config.globalPolicy).length === 0) {
            console.log('  No global policies configured');
        }
        else {
            for (const [topic, policy] of Object.entries(config.globalPolicy)) {
                const notes = policy.notes ? ` - ${policy.notes}` : '';
                console.log(`  ${topic}: ${policy.level}${notes}`);
            }
        }
        console.log(`\n  Default level: ${config.defaultLevel}`);
        console.log(`  Activity logging: ${config.activityLog ? 'enabled' : 'disabled'}`);
        // Show all approved peers and their comms status
        const peers = listPeers('approved');
        if (peers.length > 0) {
            console.log('\nAPPROVED PEERS:\n');
            for (const peer of peers) {
                const effective = getAllEffectivePolicies(peer.id);
                const effectiveDefault = peer.defaultLevel || config.defaultLevel;
                const allowedTopics = Object.entries(effective).filter(([, p]) => p.level !== 'off').map(([t]) => t);
                const blockedTopics = Object.entries(effective).filter(([, p]) => p.level === 'off').map(([t]) => t);
                const hasAnyAllowed = allowedTopics.length > 0 || effectiveDefault !== 'off';
                const statusIcon = hasAnyAllowed ? '✓' : '⚠ ';
                const statusText = hasAnyAllowed
                    ? allowedTopics.length > 0 ? `topics: ${allowedTopics.join(', ')}` : `default: ${effectiveDefault}`
                    : 'NO TOPICS ALLOWED — messages will be blocked';
                console.log(`  ${statusIcon} ${peer.displayName} (${peer.id})`);
                console.log(`      ${statusText}`);
                if (blockedTopics.length > 0)
                    console.log(`      blocked: ${blockedTopics.join(', ')}`);
                if (!hasAnyAllowed) {
                    console.log(`      → Fix: ogp agent-comms add-topic ${peer.id} general --level summary`);
                }
                console.log('');
            }
        }
    }
    console.log('');
}
export function configurePolicies(peerIds, options) {
    const level = options.level || 'summary';
    const topics = options.topics?.split(',').map(t => t.trim()) || [];
    const notes = options.notes;
    if (options.global) {
        // Configure global policies
        if (topics.length === 0) {
            console.error('Error: --topics is required');
            return;
        }
        for (const topic of topics) {
            setGlobalTopicPolicy(topic, level, notes);
        }
        console.log(`\nUpdated global policies:`);
        for (const topic of topics) {
            console.log(`  ${topic}: ${level}`);
        }
        console.log('');
        return;
    }
    if (!peerIds) {
        console.error('Error: Specify peer ID(s) or use --global');
        return;
    }
    if (topics.length === 0) {
        console.error('Error: --topics is required');
        return;
    }
    // Parse peer IDs (comma-separated)
    const ids = peerIds.split(',').map(id => id.trim());
    const results = [];
    for (const id of ids) {
        // Try to find peer by ID or display name
        const peer = findPeerByIdOrName(id);
        if (!peer) {
            results.push({ peer: id, success: false });
            continue;
        }
        for (const topic of topics) {
            setPeerTopicPolicy(peer.id, topic, level, notes);
        }
        results.push({ peer: peer.displayName, success: true });
    }
    console.log('\nConfiguration results:');
    for (const r of results) {
        if (r.success) {
            console.log(`  ✓ ${r.peer}: configured ${topics.join(', ')} as ${level}`);
        }
        else {
            console.log(`  ✗ ${r.peer}: peer not found`);
        }
    }
    console.log('');
}
/**
 * Add a topic to a peer's policy
 */
export function addTopic(peerId, topic, level, notes) {
    const peer = findPeerByIdOrName(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    setPeerTopicPolicy(peer.id, topic, level, notes);
    console.log(`\nAdded topic '${topic}' with level '${level}' for ${peer.displayName}\n`);
}
/**
 * Remove a topic from a peer's policy
 */
export function removeTopic(peerId, topic) {
    const peer = findPeerByIdOrName(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    removePeerTopicPolicy(peer.id, topic);
    console.log(`\nRemoved topic '${topic}' from ${peer.displayName}'s policy\n`);
}
/**
 * Set a topic policy for a peer (upsert: create or update)
 */
export function setTopic(peerId, topic, level, notes) {
    const peer = findPeerByIdOrName(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    const existing = peer.responsePolicy?.[topic];
    setPeerTopicPolicy(peer.id, topic, level, notes);
    const action = existing ? 'Updated' : 'Added';
    console.log(`\n${action} topic '${topic}' with level '${level}' for ${peer.displayName}\n`);
}
/**
 * Set the per-peer default level for a specific peer
 */
export function setPeerDefault(peerId, level) {
    const peer = findPeerByIdOrName(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    setPeerDefaultLevel(peer.id, level);
    console.log(`\nSet default level '${level}' for ${peer.displayName}\n`);
}
/**
 * Reset a peer's policy to global defaults
 */
export function resetPolicy(peerId) {
    const peer = findPeerByIdOrName(peerId);
    if (!peer) {
        console.error(`Peer not found: ${peerId}`);
        return;
    }
    clearPeerResponsePolicy(peer.id);
    console.log(`\nReset ${peer.displayName}'s policy to global defaults\n`);
}
/**
 * Show activity log
 */
export function showActivity(peerId, last) {
    const lines = readActivityLog({ peerId, last: last || 50 });
    if (lines.length === 0) {
        console.log('\nNo activity logged yet.\n');
        return;
    }
    console.log('\nAGENT-COMMS ACTIVITY:\n');
    for (const line of lines) {
        console.log(`  ${line}`);
    }
    console.log('');
}
/**
 * Clear activity log
 */
export function clearActivity() {
    clearActivityLog();
    console.log('\nActivity log cleared.\n');
}
/**
 * Set default response level
 */
export function setDefault(level) {
    setDefaultLevel(level);
    console.log(`\nDefault response level set to: ${level}\n`);
}
/**
 * Enable/disable activity logging
 */
export function setLogging(enabled) {
    setActivityLogging(enabled);
    console.log(`\nActivity logging: ${enabled ? 'enabled' : 'disabled'}\n`);
}
/**
 * Helper: Find peer by ID or display name
 */
function findPeerByIdOrName(idOrName) {
    // Try exact ID match first
    let peer = getPeer(idOrName);
    if (peer)
        return peer;
    // Try partial ID match
    const peers = listPeers('approved');
    peer = peers.find(p => p.id.includes(idOrName)) || null;
    if (peer)
        return peer;
    // Try display name match (case-insensitive)
    const lowerName = idOrName.toLowerCase();
    peer = peers.find(p => p.displayName.toLowerCase().includes(lowerName)) || null;
    return peer;
}
/**
 * Interactive peer selection (returns peer IDs)
 */
export function listPeersForSelection() {
    const peers = listPeers('approved');
    return peers.map(p => ({
        id: p.id,
        name: p.displayName,
        hasPolicy: !!(p.responsePolicy && Object.keys(p.responsePolicy).length > 0)
    }));
}
//# sourceMappingURL=agent-comms.js.map