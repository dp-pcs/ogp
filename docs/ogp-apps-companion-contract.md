# OGP Apps — Companion App Contract

> Design-agent input. Defines the exact data/CLI contract the companion app should use to display the OGP Apps feature. No pixel decisions here — those belong to the design session.

## App context

- **Companion app**: `ogp-companion/` in the OGP repo. Tauri v2 + React (Vite). Tailwind-free; inline styles live in `src/ui.jsx` primitives.
- **Existing views**: `src/views1.jsx` (Overview/Federation), `src/views2.jsx` (Tunnels/Activity/Settings), `src/shell.jsx` (nav), `src/app.jsx` (state/router).
- **Backend contract**: `src/backend.js` exposes `window.OGP_BACKEND`. In the Tauri shell, methods invoke Rust commands that shell out to the `ogp` CLI. In the browser preview, `isLive()` is false and the app falls back to mock data.
- **Drive rule**: read state files for status; shell out to the `ogp` CLI for actions. The daemon's internal HTTP API is intentionally NOT stable.

## OGP Apps layer status

Built:
- `ogp-app.json` manifest schema + `validateManifest` (P1)
- `~/.ogp/apps.json` registry (P2)
- `ogp app list/show/install/remove` + consent gate (P3)

Still needed for a complete UI:
- P4 — `ogp app usage --json` (usage attribution)
- P5 — `ogp app browse --json` (peer-advertised discovery)
- P6 — this contract doc

## Registry file (read-only)

Path: `~/.ogp/apps.json` (per-framework; in practice `~/.ogp-openclaw/apps.json`, `~/.ogp-hermes/apps.json`, etc.)

Shape:

```json
{
  "version": 1,
  "apps": [
    {
      "id": "signal",
      "manifest": {
        "id": "signal",
        "name": "Signal",
        "version": "1.0.0",
        "description": "Federated AI-CoE knowledge hub",
        "uses_intents": ["project.contribute", "project.query"],
        "uses_projects": ["signal"],
        "installs_skills": [
          { "name": "signal-contribute", "install": "skills/signal-contribute/install.sh" },
          { "name": "signal-query", "install": "skills/signal-query/install.sh" },
          { "name": "signal-refresh", "install": "skills/signal-refresh/install.sh" }
        ],
        "published_output": "https://aicoe.elelem.expert",
        "publisher": { "name": "AI CoE", "key": "<ed25519 pubkey>" }
      },
      "source": "file:/Users/.../signal/ogp-app.json",
      "installedAt": "2026-06-13T...",
      "installedSkills": ["signal-contribute", "signal-query", "signal-refresh"],
      "projectJoinStatus": { "signal": "not-joined" }
    }
  ]
}
```

Read this file directly from the backend (no CLI call). The companion app already polls for snapshots; Apps state can piggyback on that poll or be read on demand.

## CLI commands the UI must call

All commands support `--json` and `--for <framework>`.

| UI action | CLI command | Notes |
|---|---|---|
| Browse advertised apps | `ogp app browse --json` | Lists apps advertised by connected peers via well-known/relay card. |
| Show app details | `ogp app show <id> --json` | Reads the local manifest from the registry. |
| Install an app | `ogp app install <ref> --json` | `<ref>` can be `file:<path>`, `github:<owner>/<repo>`, or `peer:<peer-id>/<app-id>`. The CLI validates, shows a consent prompt, and runs `installs_skills`. |
| Remove an app | `ogp app remove <id> --json` | Reverses install: removes registry entry and installed skills. |
| Show usage | `ogp app usage [<id>] --json` | Maps daemon-observed intent calls back to the app via `uses_intents` / `uses_projects`. Omit `<id>` for all installed apps. |

## Screens to design

### 1. Apps Gallery (primary browse)

**Purpose**: discover apps from peers and install them.

**Data sources**:
- `ogp app browse --json` — advertised apps from peers
- `~/.ogp/apps.json` — already-installed app IDs, so the UI can show "Installed" vs "Install"

**Display**:
- Grid or list of App cards.
- Each card: app name, description, version, publisher name, install state.
- If installed: show version and "Open" / "Installed" badge.
- If not installed: "Install" button.
- Clicking a card opens App Detail.

**Empty states**:
- No peers advertising apps: "No apps advertised by your peers."
- No peers connected: "Connect to peers to discover apps."

### 2. Installed Apps (sidebar entry / main screen)

**Purpose**: manage apps already on this machine.

**Data source**: `~/.ogp/apps.json`.

**Display**:
- List of installed apps with name, version, installed-at, quick usage sparkline or count.
- Each row: "Open published output" link (if `published_output` set), "Show details", "Remove".
- Sort: default by installed-at desc; optionally by name or usage.

**Empty state**: "No apps installed yet. Browse the gallery to install one."

### 3. App Detail

**Purpose**: inspect a single app before or after install.

**Data sources**:
- `ogp app show <id> --json` (manifest)
- `ogp app usage <id> --json` (usage count / last-used)
- `~/.ogp/apps.json` (installed status)

**Display**:
- Header: name, version, publisher, install/remove button.
- Description.
- "Uses intents": list of `uses_intents`.
- "Uses projects": list of `uses_projects` with join status.
- "Installs skills": list of `installs_skills`.
- "Published output": link if present.
- Usage section: total calls, last-used date, most-used intents.
- Publisher key: fingerprint or "Verified by AI CoE" style treatment.

### 4. Install Consent

**Purpose**: confirm before an app drops files into the user's agent skills directory.

**Data source**: the manifest being installed.

**Display** (modal / sheet):
- App name, version, publisher.
- What will happen:
  - Skills to be installed: `installs_skills`.
  - Projects it wants to use: `uses_projects`.
  - Intents it will call: `uses_intents`.
  - External surface it owns: `published_output` (if any).
- Actions: "Install", "Cancel".
- Warning if publisher key is unknown / not in a trusted peer list.

**Note**: the CLI already performs its own consent prompt (`--yes` bypasses). The companion UI should either:
- pass `--yes` after its own confirmation, or
- let the CLI prompt in a terminal (not ideal for UI).
Recommended: UI collects consent, then calls `ogp app install <ref> --yes --json`.

### 5. App Usage

**Purpose**: show how much an app is actually being used over OGP.

**Data source**: `ogp app usage [<id>] --json`.

**Display**:
- Total intent calls attributed to this app.
- Breakdown by intent.
- Last-used timestamp.
- "Shared intents" indicator when two apps use the same intent (disambiguated by `uses_projects`).
- No backfill — attribution starts when the app is installed and the daemon logs intents.

## Navigation / entry points

- Add a new sidebar nav item: **Apps**.
- Default view: Apps Gallery (browse + install).
- Secondary tab or section: Installed Apps.
- Deep link from a peer detail card: "Apps from this peer" (uses browse filtered by peer).

## Existing UI patterns to align with

- Navigation: `src/shell.jsx` sidebar.
- Page chrome: `PageHeader` from `src/ui.jsx` (title + sub + optional action).
- Cards/rows: `PeerCard`, `PeerRow`, `StatTile` in `src/peers.jsx`, `src/ui.jsx`.
- Empty states: `Empty` component from `src/ui.jsx`.
- Toast feedback: `showToast()` from `src/ui.jsx`.
- Settings modal pattern: `src/identity.jsx`.
- Framework switcher: already in `src/shell.jsx`; every backend call should accept `framework`.

## Backend additions needed

Add these to `src/backend.js`:

```js
fetchApps: (fw) => invoke("ogp_app_list", { framework: fw }),
browseApps: (fw) => invoke("ogp_app_browse", { framework: fw }),
showApp: (fw, id) => invoke("ogp_app_show", { framework: fw, id }),
installApp: (fw, ref) => invoke("ogp_app_install", { framework: fw, ref }),
removeApp: (fw, id) => invoke("ogp_app_remove", { framework: fw, id }),
appUsage: (fw, id) => invoke("ogp_app_usage", { framework: fw, id }),
```

Add corresponding Tauri commands in `ogp-companion/src-tauri/src/ogp.rs` that shell out to the CLI commands above.

## Prerequisites before this UI is useful

1. P4 — `ogp app usage` CLI must exist.
2. P5 — `ogp app browse` CLI must exist.
3. P6 — this contract doc must be finalized (now done).

Without P4/P5, the UI can still show installed apps and install/remove, but the Gallery and Usage screens will be empty or broken.

## Out of scope for this UI pass

- Enable/Disable toggle (deferred in Apps layer brief).
- Central catalog / Apps from strangers (deferred).
- OGP auto-installer (`bd-va1z` — companion bootstrapping the ogp CLI when missing).
- Pixel-perfect layout; the design session owns that.

## Beads this unblocks

- `bd-9xbp` — Signal ships `ogp-app.json` manifest once the Apps layer + UI contract is ready.
- `bd-eop0` — Apps P6 companion contract doc.
