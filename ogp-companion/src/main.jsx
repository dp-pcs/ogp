// main.jsx — ordered loader. Mirrors the original index.html <script> order so
// the vendored design's global-component pattern resolves correctly.
//
// 1. globals shim (React/ReactDOM on window)
// 2. theme + design-system CSS
// 3. data (mock fallback) + backend bridge
// 4. design components, in their original load order
// 5. app (renders into #root)
//
// Static imports are hoisted by the bundler, but ES guarantees side-effecting
// imports run top-to-bottom in source order — which is exactly the contract the
// design relies on. We keep them as plain `import "..."` statements.

import "./globals-shim.js";

// Theme + design-system CSS are linked from index.html (served from public/).

import "./data.jsx";
import "./backend.js";

import "./tweaks-panel.jsx";
import "./icons.jsx";
import "./ui.jsx";
import "./shell.jsx";
import "./graph.jsx";
import "./peers.jsx";
import "./views1.jsx";
import "./views2.jsx";
import "./wizard.jsx";
import "./comms.jsx";
import "./app.jsx";
