// backend.js — bridges the React UI to real OGP state.
//
// In the Tauri desktop shell, window.__TAURI__ is present and we invoke Rust
// commands that shell out to the `ogp` CLI (federation list/status --json,
// whoami --json, tunnel list --json) and map them into the shapes data.jsx
// defines (FRAMEWORKS / PEERS / TUNNELS / DAEMON / ACTIVITY).
//
// In a plain browser (`npm run dev`) there is no Tauri bridge, so isLive() is
// false and the app falls back to the mock window.OGP_DATA from data.jsx.

function hasTauri() {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

// In the desktop shell, let the OS window be the chrome: drop the centered
// desktop-card padding/gradient the prototype uses.
if (hasTauri() && typeof document !== "undefined") {
  document.documentElement.classList.add("tauri");
}

async function invoke(cmd, args) {
  // Tauri v2 exposes invoke at window.__TAURI__.core.invoke.
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core || typeof core.invoke !== "function") {
    throw new Error("Tauri invoke unavailable");
  }
  return core.invoke(cmd, args);
}

// ── shape mappers ────────────────────────────────────────────────
// The Rust side returns the raw `ogp … --json` payloads; we normalize the
// few field-name differences (lastSeenAt, grantedScopes already match the
// PeerJson the CLI emits) and derive the display fields the UI expects.

function mapPeer(p) {
  const org = p.displayName && p.displayName.includes("·")
    ? p.displayName.split("·").pop().trim()
    : (p.alias || p.displayName || "").split(".")[0];
  return {
    id: p.id,
    alias: p.alias ?? null,
    displayName: p.displayName || p.alias || p.id,
    status: p.status,
    gatewayUrl: p.gatewayUrl || "",
    publicKey: p.publicKey || "",
    healthState: p.healthState ?? null,
    healthy: p.healthy ?? (p.status === "approved" ? true : null),
    grantedScopes: p.grantedScopes ?? null,
    offeredIntents: p.offeredIntents ?? null,
    lastSeenAt: p.lastSeenAt ?? null,
    tags: p.tags ?? [],
    org,
    agent: p.agentName ?? null,
    human: p.humanName ?? "—",
    latencyMs: p.healthy === false ? null : (p.latencyMs ?? null),
    messages: p.messages ?? 0,
    msgTrend: p.msgTrend ?? [0, 0, 0, 0, 0, 0, 0, 0, 0],
    issue: p.healthy === false ? (p.issue || "Peer gateway unreachable.") : undefined,
    requestedAt: p.requestedAt ?? p.lastSeenAt ?? null,
    personas: p.personas ?? p.agents ?? null,
    commsPolicy: p.commsPolicy ?? undefined,
  };
}

// Fetch the full live snapshot keyed by framework id, matching the structure
// initStore() in app.jsx expects: { [fwId]: { daemon, tunnel, peers, activity } }
// plus a frameworks[] list.
async function fetchSnapshot() {
  const snap = await invoke("ogp_snapshot");
  // snap = { frameworks: [...], peers: {fw:[...]}, tunnels: {...}, daemon: {...}, activity: {...} }
  const peers = {};
  for (const [fw, list] of Object.entries(snap.peers || {})) {
    peers[fw] = (list || []).map(mapPeer);
  }
  return {
    frameworks: snap.frameworks || [],
    peers,
    tunnels: snap.tunnels || {},
    daemon: snap.daemon || {},
    activity: snap.activity || {},
  };
}

window.OGP_BACKEND = {
  isLive: hasTauri,
  fetchSnapshot,
  // action passthroughs — return promises; the UI updates optimistically and
  // re-fetches on the next refresh.
  startTunnel: (fw, optId) => invoke("ogp_start_tunnel", { framework: fw, optionId: optId }),
  stopTunnel: (fw) => invoke("ogp_stop_tunnel", { framework: fw }),
  toggleDaemon: (fw, run) => invoke("ogp_toggle_daemon", { framework: fw, run }),
  approve: (fw, peerId, intents) => invoke("ogp_approve", { framework: fw, peerId, intents }),
  reject: (fw, peerId) => invoke("ogp_reject", { framework: fw, peerId }),
  addGateway: (fw, peerUrl, alias) => invoke("ogp_request", { framework: fw, peerUrl, alias }),
  // Message composer: agent-comms (topic+priority+wait) or a plain message intent.
  sendMessage: (fw, peerId, opts) =>
    invoke("ogp_send_message", {
      framework: fw,
      peerId,
      agent: opts.intent === "agent-comms",
      topic: opts.topic || "general",
      text: opts.text,
      priority: opts.priority || "normal",
      wait: !!opts.wait,
    }),
  // Agent-comms policy editor: per-peer default + per-topic rules.
  setPolicy: (fw, peerId, policy) =>
    invoke("ogp_set_policy", {
      framework: fw,
      peerId,
      defaultLevel: policy.default,
      topics: (policy.topics || []).map((t) => ({ topic: t.topic, level: t.level, notes: t.notes || "" })),
    }),
};
