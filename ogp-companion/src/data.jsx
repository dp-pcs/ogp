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

// ── OGP Apps mock data ────────────────────────────────────────────
const APP_PEERS = {
  apollo: { id: "apollo", alias: "apollo", displayName: "Apollo · AICOE", org: "AICOE", publicKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" },
  iris:   { id: "iris",   alias: "iris",   displayName: "Iris · Hermes Net", org: "Hermes Net", publicKey: "bb22cc33dd44ee55ff66aa77bb22cc33dd44ee55" },
  atlas:  { id: "atlas",  alias: "atlas",  displayName: "Atlas · Gauntlet", org: "Gauntlet AI", publicKey: "99aa88bb77cc66dd55ee44ff33aa22bb11cc00dd" },
};

const APP_MANIFESTS = {
  signal: {
    schemaVersion: 1, id: "signal", name: "Signal", version: "1.4.0",
    description: "Federated AI-CoE knowledge hub. Contributes findings to and queries the shared Signal project across your federation.",
    uses_intents: ["project.contribute", "project.query"], uses_projects: ["signal"],
    installs_skills: [
      { name: "signal-contribute", install: "scripts/install-signal-contribute.sh" },
      { name: "signal-query", install: "scripts/install-signal-query.sh" },
      { name: "signal-refresh", install: "scripts/install-signal-refresh.sh" },
    ],
    published_output: "https://aicoe.elelem.expert", status_endpoint: "https://aicoe.elelem.expert/status",
    publisher: { name: "AI CoE", key: APP_PEERS.apollo.publicKey },
  },
  "atlas-pulse": {
    schemaVersion: 1, id: "atlas-pulse", name: "Atlas Pulse", version: "0.9.2",
    description: "Lightweight heartbeat + status digest. Broadcasts cycle health to peers and rolls up their status-updates.",
    uses_intents: ["status-update", "message"], uses_projects: [],
    installs_skills: [{ name: "pulse-broadcast", install: "scripts/install-pulse.sh" }, { name: "pulse-rollup", install: "scripts/install-rollup.sh" }],
    published_output: null, publisher: { name: "Gauntlet AI", key: APP_PEERS.atlas.publicKey },
  },
  sentinel: {
    schemaVersion: 1, id: "sentinel", name: "Sentinel", version: "2.0.1",
    description: "Incident watch. Listens for status-update intents and escalates anomalies to your operator.",
    uses_intents: ["status-update"], uses_projects: [],
    installs_skills: [{ name: "sentinel-watch", install: "scripts/install-sentinel.sh" }],
    published_output: "https://sentinel.trilogy.com",
    publisher: { name: "Trilogy Ops", key: "dead00beef11cafe22face33feed44babe55c0de" },
  },
  beacon: {
    schemaVersion: 1, id: "beacon", name: "Beacon", version: "1.1.0",
    description: "Federated alerting digest — fan out important messages and status across approved peers on a schedule.",
    uses_intents: ["message", "status-update"], uses_projects: [],
    installs_skills: [{ name: "beacon-digest", install: "scripts/install-beacon.sh" }],
    published_output: "https://beacon.aicoe.dev", publisher: { name: "AI CoE", key: APP_PEERS.apollo.publicKey },
  },
  "relay-notes": {
    schemaVersion: 1, id: "relay-notes", name: "Relay Notes", version: "0.6.0",
    description: "Shared standup + handoff notes. Posts and reads a rolling notes feed between two agents.",
    uses_intents: ["message"], uses_projects: [],
    installs_skills: [{ name: "relay-notes-post", install: "scripts/install-notes.sh" }],
    published_output: null, publisher: { name: "Hermes Net", key: APP_PEERS.iris.publicKey },
  },
  "gauntlet-eval": {
    schemaVersion: 1, id: "gauntlet-eval", name: "Gauntlet Eval", version: "3.2.0",
    description: "Eval harness sync. Contributes eval runs to and queries a shared evals project for cross-team benchmarking.",
    uses_intents: ["project.contribute", "project.query"], uses_projects: ["evals"],
    installs_skills: [{ name: "eval-sync", install: "scripts/install-eval-sync.sh" }, { name: "eval-report", install: "scripts/install-eval-report.sh" }],
    published_output: "https://evals.gauntletai.com", publisher: { name: "Gauntlet AI", key: APP_PEERS.atlas.publicKey },
  },
};

const OGP_APPS_DATA = {
  openclaw: {
    installed: [
      { id: "signal", manifest: APP_MANIFESTS.signal, source: "file:/Users/dproctor/projects/signal/ogp-app.json", installedAt: relAgo(8 * 864e5), installedSkills: ["signal-contribute", "signal-query", "signal-refresh"], projectJoinStatus: { signal: "joined" }, advertised: true },
      { id: "atlas-pulse", manifest: APP_MANIFESTS["atlas-pulse"], source: "peer:atlas/atlas-pulse", installedAt: relAgo(3 * 864e5), installedSkills: ["pulse-broadcast", "pulse-rollup"], projectJoinStatus: {}, advertised: false },
      { id: "sentinel", manifest: APP_MANIFESTS.sentinel, source: "github:trilogy-ops/sentinel", installedAt: relAgo(20 * 36e5), installedSkills: ["sentinel-watch"], projectJoinStatus: {}, advertised: false },
    ],
    browse: [
      { peerId: "apollo", apps: [
        { manifest: APP_MANIFESTS.signal, publisherKey: APP_PEERS.apollo.publicKey, advertisedAt: relAgo(2 * 36e5) },
        { manifest: APP_MANIFESTS.beacon, publisherKey: APP_PEERS.apollo.publicKey, advertisedAt: relAgo(5 * 36e5) },
      ] },
      { peerId: "iris", apps: [{ manifest: APP_MANIFESTS["relay-notes"], publisherKey: APP_PEERS.iris.publicKey, advertisedAt: relAgo(26 * 36e5) }] },
      { peerId: "atlas", apps: [
        { manifest: APP_MANIFESTS["atlas-pulse"], publisherKey: APP_PEERS.atlas.publicKey, advertisedAt: relAgo(40 * 6e4) },
        { manifest: APP_MANIFESTS["gauntlet-eval"], publisherKey: APP_PEERS.atlas.publicKey, advertisedAt: relAgo(70 * 6e4) },
      ] },
    ],
    usage: [
      { id: "signal", name: "Signal", totalCalls: 1240, earliestAttributable: relAgo(8 * 864e5), latestAttributable: relAgo(22 * 6e4), byIntent: { "project.contribute": 884, "project.query": 356 }, sharedIntents: [], ambiguous: false },
      { id: "atlas-pulse", name: "Atlas Pulse", totalCalls: 350, earliestAttributable: relAgo(3 * 864e5), latestAttributable: relAgo(4 * 6e4), byIntent: { "status-update": 212, "message": 138 }, sharedIntents: ["status-update"], ambiguous: true },
      { id: "sentinel", name: "Sentinel", totalCalls: 96, earliestAttributable: relAgo(20 * 36e5), latestAttributable: relAgo(11 * 6e4), byIntent: { "status-update": 96 }, sharedIntents: ["status-update"], ambiguous: true },
    ],
    peers: APP_PEERS,
  },
  hermes: { installed: [], browse: [], usage: [], peers: {} },
};

window.OGP_APPS_DATA = OGP_APPS_DATA;
window.OGP_APP_TRUSTED_KEYS = new Set([APP_PEERS.apollo.publicKey, APP_PEERS.iris.publicKey, APP_PEERS.atlas.publicKey]);
