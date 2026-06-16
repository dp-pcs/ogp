// app/data.jsx — mock OGP state. Shapes mirror `ogp federation … --json`
// (PeerJson, ScopeBundle, WellKnown) and the daemon/tunnel status the CLI reports.

const ALL_INTENTS = ["message", "agent-comms", "task-request", "status-update", "project.join", "project.contribute"];

// ── Frameworks (from `ogp --for all whoami --json`) ──────────────
const FRAMEWORKS = [
  {
    id: "openclaw",
    displayName: "OpenClaw",
    stateDir: "~/.ogp-openclaw",
    gatewayUrl: "https://ogp.dproctor.dev",
    daemonPort: 18790,
    identity: { human: "David Proctor", agent: "Junior", org: "Trilogy" },
  },
  {
    id: "hermes",
    displayName: "Hermes",
    stateDir: "~/.ogp-hermes",
    gatewayUrl: "https://hermes.dproctor.dev",
    daemonPort: 18793,
    identity: { human: "David Proctor", agent: "Apollo", org: "Trilogy" },
  },
];

function scopeBundle(intents, opts = {}) {
  return {
    version: "0.2",
    grantedAt: opts.grantedAt || "2026-05-30T10:00:00Z",
    scopes: intents.map((intent) => ({
      intent,
      enabled: true,
      topics: intent === "agent-comms" ? (opts.topics || ["memory-management", "task-delegation"]) : null,
      rateLimit: opts.rate ? { requests: opts.rate[0], windowSeconds: opts.rate[1] } : null,
    })),
  };
}

// ── Peers per framework ──────────────────────────────────────────
const PEERS = {
  openclaw: [
    {
      id: "302a300506032b6570032100a1b2c3", alias: "apollo", displayName: "Apollo · AICOE",
      status: "approved", gatewayUrl: "https://apollo.aicoe.dev", publicKey: "302a3005…a1b2c3",
      healthState: "healthy", healthy: true,
      grantedScopes: scopeBundle(["message", "agent-comms"], { rate: [100, 3600] }),
      offeredIntents: ["message", "agent-comms", "task-request"],
      lastSeenAt: relAgo(4 * 60 * 1000), tags: ["trusted", "prod"],
      org: "AICOE", agent: "Apollo", human: "Maria Santos",
      latencyMs: 38, messages: 214, msgTrend: [3, 6, 4, 8, 5, 9, 12, 7, 10],
      commsPolicy: { default: "summary", topics: [
        { topic: "memory-management", level: "full", notes: "Trusted context sync" },
        { topic: "task-delegation", level: "full", notes: "" },
        { topic: "calendar", level: "escalate", notes: "Needs my sign-off" },
      ] },
    },
    {
      id: "302a300506032b6570032100d4e5f6", alias: "cosmo", displayName: "Cosmo · Trilogy",
      status: "approved", gatewayUrl: "https://cosmo.trilogy.com", publicKey: "302a3005…d4e5f6",
      healthState: "unhealthy", healthy: false,
      grantedScopes: scopeBundle(["message", "agent-comms", "task-request"], { rate: [200, 3600] }),
      offeredIntents: ["message", "agent-comms"],
      lastSeenAt: relAgo(3 * 60 * 60 * 1000), tags: ["prod"],
      org: "Trilogy", agent: "Cosmo", human: "Devon Park",
      latencyMs: null, messages: 88, msgTrend: [9, 7, 8, 6, 4, 3, 1, 0, 0],
      issue: "No heartbeat for 3h — peer gateway unreachable.",
      commsPolicy: { default: "summary", topics: [
        { topic: "task-delegation", level: "summary", notes: "" },
        { topic: "deployment", level: "escalate", notes: "" },
      ] },
    },
    {
      id: "302a300506032b6570032100998877", alias: "atlas", displayName: "Atlas · Gauntlet",
      status: "approved", gatewayUrl: "https://atlas.gauntletai.com", publicKey: "302a3005…998877",
      healthState: "healthy", healthy: true,
      grantedScopes: scopeBundle(["message"], {}),
      offeredIntents: ["message", "status-update"],
      lastSeenAt: relAgo(45 * 1000), tags: ["partner"],
      org: "Gauntlet AI", agent: "Atlas", human: "Priya N.",
      latencyMs: 64, messages: 31, msgTrend: [0, 1, 2, 1, 3, 2, 4, 3, 5],
    },
    {
      id: "302a300506032b6570032100112233", alias: null, displayName: "nova.skunkworks.io",
      status: "pending", gatewayUrl: "https://nova.skunkworks.io", publicKey: "302a3005…112233",
      healthState: null, healthy: null,
      grantedScopes: null,
      offeredIntents: ["message", "agent-comms", "project.join"],
      lastSeenAt: relAgo(12 * 60 * 1000), tags: [],
      org: "Skunkworks", agent: "Nova", human: "—",
      requestedAt: relAgo(12 * 60 * 1000),
      personas: [
        { id: "nova-1", displayName: "Nova", role: "primary", description: "Lead research agent", skills: ["analysis", "synthesis"] },
        { id: "nova-2", displayName: "Scout", role: "specialist", description: "Web retrieval", skills: ["search"] },
      ],
    },
    {
      id: "302a300506032b6570032100445566", alias: null, displayName: "echo.partnerlab.ai",
      status: "pending", gatewayUrl: "https://echo.partnerlab.ai", publicKey: "302a3005…445566",
      healthState: null, healthy: null, grantedScopes: null,
      offeredIntents: ["message"],
      lastSeenAt: relAgo(40 * 60 * 1000), tags: [],
      org: "PartnerLab", agent: "Echo", human: "—",
      requestedAt: relAgo(40 * 60 * 1000),
      personas: [{ id: "echo-1", displayName: "Echo", role: "primary", description: "Notifications relay" }],
    },
  ],
  hermes: [
    {
      id: "302a300506032b6570032100aabbcc", alias: "iris", displayName: "Iris · Hermes Net",
      status: "approved", gatewayUrl: "https://iris.hermesnet.io", publicKey: "302a3005…aabbcc",
      healthState: "healthy", healthy: true,
      grantedScopes: scopeBundle(["message", "agent-comms"], {}),
      offeredIntents: ["message", "agent-comms"],
      lastSeenAt: relAgo(2 * 60 * 1000), tags: ["prod"],
      org: "Hermes Net", agent: "Iris", human: "Sam O.",
      latencyMs: 52, messages: 140, msgTrend: [4, 5, 6, 5, 7, 6, 8, 7, 9],
      commsPolicy: { default: "full", topics: [
        { topic: "memory-management", level: "full", notes: "" },
      ] },
    },
  ],
};

// ── Tunnels (TunnelManager equivalents) ───────────────────────────
const TUNNELS = {
  openclaw: {
    active: null, // none running — gateway is DOWN (troubleshooting state)
    options: [
      { id: "cf-named", name: "dproctor-prod", type: "cloudflareNamed", hostname: "ogp.dproctor.dev", configured: true, installed: true },
      { id: "cf-free", name: "Quick Cloudflare Tunnel", type: "cloudflareFree", hostname: null, configured: true, installed: true },
      { id: "ngrok", name: "ngrok", type: "ngrok", hostname: null, configured: false, installed: true },
    ],
  },
  hermes: {
    active: { id: "cf-named", name: "hermes-prod", type: "cloudflareNamed", hostname: "hermes.dproctor.dev", since: relAgo(6 * 60 * 60 * 1000) },
    options: [
      { id: "cf-named", name: "hermes-prod", type: "cloudflareNamed", hostname: "hermes.dproctor.dev", configured: true, installed: true },
      { id: "cf-free", name: "Quick Cloudflare Tunnel", type: "cloudflareFree", hostname: null, configured: true, installed: true },
    ],
  },
};

// ── Daemon status per framework ───────────────────────────────────
const DAEMON = {
  openclaw: { running: true, pid: 48211, port: 18790, uptimeMs: 5 * 60 * 60 * 1000 + 12 * 60 * 1000, version: "0.2.29" },
  hermes:   { running: true, pid: 49003, port: 18793, uptimeMs: 26 * 60 * 60 * 1000, version: "0.2.29" },
};

// ── Activity log ──────────────────────────────────────────────────
const ACTIVITY = {
  openclaw: [
    { id: 1, t: relAgo(45 * 1000),        kind: "message",  dir: "in",  peer: "atlas",  topic: "status-update", level: "summary", text: "Heartbeat OK · cycle 1182" },
    { id: 2, t: relAgo(8 * 60 * 1000),    kind: "request",  dir: "in",  peer: "nova.skunkworks.io", topic: null, level: null, text: "Federation request received" },
    { id: 3, t: relAgo(14 * 60 * 1000),   kind: "agent",    dir: "out", peer: "apollo", topic: "task-delegation", level: "full", text: "Delegated: summarize Q2 incident logs" },
    { id: 4, t: relAgo(22 * 60 * 1000),   kind: "agent",    dir: "in",  peer: "apollo", topic: "memory-management", level: "full", text: "Context sync · 3 entries merged" },
    { id: 5, t: relAgo(3 * 60 * 60 * 1000), kind: "error",  dir: "in",  peer: "cosmo",  topic: null, level: null, text: "Heartbeat timeout — marked unhealthy" },
    { id: 6, t: relAgo(40 * 60 * 1000),   kind: "request",  dir: "in",  peer: "echo.partnerlab.ai", topic: null, level: null, text: "Federation request received" },
    { id: 7, t: relAgo(5 * 60 * 60 * 1000), kind: "message", dir: "out", peer: "apollo", topic: "message", level: "summary", text: "Sent: deployment window confirmed" },
    { id: 8, t: relAgo(6 * 60 * 60 * 1000), kind: "tunnel", dir: null, peer: null, topic: null, level: null, text: "Tunnel 'dproctor-prod' stopped" },
  ],
  hermes: [
    { id: 1, t: relAgo(2 * 60 * 1000),  kind: "agent", dir: "in",  peer: "iris", topic: "memory-management", level: "full", text: "Context sync · 1 entry" },
    { id: 2, t: relAgo(30 * 60 * 1000), kind: "message", dir: "out", peer: "iris", topic: "message", level: "summary", text: "Sent: standup notes" },
  ],
};

function relAgo(ms) { return new Date(Date.now() - ms).toISOString(); }

// ── Transport mode (bd-b7em) ──────────────────────────────────────
// How this daemon is reached: direct (default) | relay | iroh.
const TRANSPORT = {
  openclaw: { mode: "direct", relayUrl: null, irohRelayUrl: null },
  hermes:   { mode: "direct", relayUrl: null, irohRelayUrl: null },
};

window.OGP_DATA = { FRAMEWORKS, PEERS, TUNNELS, DAEMON, ACTIVITY, TRANSPORT, ALL_INTENTS, scopeBundle };

// OGP Apps data: populated at runtime by the Tauri backend (ogp app list/browse/usage --json).
// No mock data — the gallery/installed/usage views show real state or empty states.
window.OGP_APPS_DATA = null;
window.OGP_APP_TRUSTED_KEYS = null;
