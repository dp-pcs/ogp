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
  // Tauri v2 always injects __TAURI_INTERNALS__ into the webview; __TAURI__ is
  // only present when withGlobalTauri is set. Detect on either.
  return (
    typeof window !== "undefined" &&
    (!!window.__TAURI__ || !!window.__TAURI_INTERNALS__)
  );
}

// In the desktop shell, let the OS window be the chrome: drop the centered
// desktop-card padding/gradient the prototype uses.
if (hasTauri() && typeof document !== "undefined") {
  document.documentElement.classList.add("tauri");
}

async function invoke(cmd, args) {
  // Prefer the global bridge (withGlobalTauri); fall back to the internals
  // invoke that v2 always exposes.
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (core && typeof core.invoke === "function") {
    return core.invoke(cmd, args);
  }
  const internals = window.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === "function") {
    return internals.invoke(cmd, args);
  }
  throw new Error("Tauri invoke unavailable");
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
    transport: snap.transport || {},
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
  // Open Terminal.app pre-filled with `ogp --for <fw> <command>`.
  openTerminal: (fw, command) => invoke("ogp_open_terminal", { framework: fw, command }),
  // Edit identity: ogp config set-identity --agent-name/--human-name/--organization.
  setIdentity: (fw, fields) =>
    invoke("ogp_set_identity", {
      framework: fw,
      agentName: fields.agent || null,
      humanName: fields.human || null,
      organization: fields.org || null,
    }),
  // Set transport mode (direct | relay | iroh) + optional relay URL. Daemon must
  // be restarted for relay to take effect — the Settings UI surfaces a button.
  setTransport: (fw, mode, relayUrl) =>
    invoke("ogp_set_transport", { framework: fw, mode, relayUrl: relayUrl || null }),
  // Clear the Rust framework-discovery cache (identity lives there).
  refreshFrameworks: () => invoke("ogp_refresh_frameworks"),

  // ── bd-mmx7: in-app auto-update ──────────────────────────────────
  // Check the GitHub-Releases update endpoint for a newer signed build.
  // Returns { available, version, notes } or { available:false }. In the
  // browser (no Tauri) it resolves to not-available so the UI degrades cleanly.
  checkForUpdate: async () => {
    if (!hasTauri()) return { available: false };
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { available: false };
    return {
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body || "",
      // keep the live handle so installUpdate can reuse it without re-checking
      _handle: update,
    };
  },
  // Download + install the pending update (reusing the handle from checkForUpdate),
  // reporting coarse progress via onProgress(phase, pct). On success the caller
  // should relaunch via relaunchApp().
  installUpdate: async (handle, onProgress) => {
    if (!hasTauri()) throw new Error("Updates are only available in the desktop app");
    const update = handle || (await (async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      return check();
    })());
    if (!update) throw new Error("No update available");
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength || 0;
          onProgress?.("downloading", 0);
          break;
        case "Progress":
          downloaded += event.data.chunkLength || 0;
          onProgress?.("downloading", total ? Math.round((downloaded / total) * 100) : null);
          break;
        case "Finished":
          onProgress?.("installing", 100);
          break;
      }
    });
    onProgress?.("done", 100);
  },
  // Relaunch into the freshly installed version.
  relaunchApp: async () => {
    if (!hasTauri()) return;
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};
