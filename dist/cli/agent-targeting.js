const MULTI_AGENT_CAPABILITY = 'multi-agent-personas';
export async function defaultProbe(peer) {
    const res = await fetch(`${peer.gatewayUrl}/.well-known/ogp`);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const body = await res.json();
    return {
        features: body?.capabilities?.features ?? [],
        agents: body?.agents ?? []
    };
}
export async function validateTargetAgent(peer, toAgent, probe = defaultProbe) {
    if (!toAgent) {
        return { ok: true };
    }
    let result;
    try {
        result = await probe(peer);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            reason: `Could not reach peer ${peer.displayName} (${peer.id}) to verify multi-agent capability: ${message}`
        };
    }
    if (!result.features.includes(MULTI_AGENT_CAPABILITY)) {
        return {
            ok: false,
            reason: `Peer ${peer.displayName} does not advertise the '${MULTI_AGENT_CAPABILITY}' capability — ` +
                `--to-agent ${toAgent} cannot be honored. Drop --to-agent or upgrade the peer.`
        };
    }
    if (!result.agents.some(a => a.id === toAgent)) {
        const known = result.agents.map(a => a.id).join(', ') || '(none)';
        return {
            ok: false,
            reason: `Peer ${peer.displayName} has no persona '${toAgent}'. Known personas: ${known}`
        };
    }
    return { ok: true };
}
//# sourceMappingURL=agent-targeting.js.map