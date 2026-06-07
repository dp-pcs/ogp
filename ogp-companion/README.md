# OGP Companion

A standalone desktop UI for the OGP federation gateway — see, add, and troubleshoot
federations, watch gateway/tunnel health, and drive the `ogp` CLI from a window
instead of the terminal.

Built from a [Claude Design](https://claude.ai/design) handoff (bd-cn9 redesign):
a **Tauri** (Rust) shell wrapping a **React** frontend on the Totogi design system.
It supersedes the SwiftUI menubar popover in `../macos-menubar-app` (left in place for now).

## What it does

- **Overview** — gateway health at a glance (daemon / tunnel / public reach), a
  troubleshooting banner when the tunnel is down, stat tiles, a live federation-map
  preview, and a pending-requests inbox.
- **Federation** — a live SVG network topology graph (your gateway at center, peers
  radial, animated packets on healthy links, red for unhealthy, amber for pending).
  Toggle to list or cards; click any node for a detail slide-over.
- **Tunnels** — online/offline hero + one-click start/stop per detected tunnel.
- **Activity** — message / event timeline.
- **Add Gateway wizard** — destination → name → authorization → connect.
- **Message composer** and **agent-comms policy editor** per peer.
- Light/dark, multi-framework switching (OpenClaw ⇄ Hermes).

## Architecture

```
index.html ─ Vite ─ React (classic runtime + globals shim)
                     │  src/*.jsx  ← vendored design (faithful)
                     │  src/backend.js  ← bridges UI ⇆ Tauri
                     ▼
            src-tauri (Rust) ── shells out to `ogp <verb> --json`
```

- The vendored design files keep their original global-component pattern; `src/main.jsx`
  loads them in the original order and `vite.config.js` compiles JSX with the classic
  runtime so `window.X` assignment/lookup works unchanged.
- **Live data:** in the Tauri shell, `backend.js` invokes Rust commands
  (`ogp_snapshot`, `ogp_approve`, …) that run the `ogp` CLI with an augmented PATH
  (GUI apps lack `/opt/homebrew/bin`, so the `#!/usr/bin/env node` shebang needs it —
  same fix as the SwiftUI app). The Rust layer maps `whoami` / `federation list` /
  `tunnel list` `--json` output into the snapshot the UI renders.
- **Mock fallback:** in a plain browser (`npm run dev`), there's no Tauri bridge, so
  the app falls back to the design's mock data in `src/data.jsx` — useful for UI work.

## Develop

```bash
npm install
npm run dev        # Vite dev server on :5173 (mock data, browser)
npm run app:dev    # Tauri dev — real window, live ogp data (needs Rust + ogp CLI)
```

## Build

```bash
npm run build      # frontend → dist/
npm run app:build  # full macOS .app + .dmg (release)
```

Requires the `ogp` CLI installed (`npm i -g @dp-pcs/ogp`) and a Rust toolchain
for the desktop build.

## Notes

- Status greens/ambers are introduced tokens (the Totogi brand has no semantic
  status palette), tuned to harmonize with the purple/navy/pink.
- The `_ds/` design-system bundle's marketing `_ds_bundle.js` was dropped (not used);
  only its `colors_and_type.css` tokens and fonts are needed.
- All actions are wired to the CLI: peers (approve/reject/request), tunnels
  (start/stop), daemon (start/stop), message send (`ogp federation agent` for
  agent-comms, `ogp federation send` for plain messages), and agent-comms policy
  persistence (`ogp agent-comms set-default` + `set-topic` per rule).
