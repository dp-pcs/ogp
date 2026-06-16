import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// bd-mmx7: expose the companion's own version (from package.json) to the UI so the
// Settings "App updates" card can show the running version. Injected as a global so
// the classic-runtime component files can read it without an import.
const pkgVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")).version;

// The vendored design files (src/*.jsx from Claude Design) use the classic
// global-component pattern: each file declares components and assigns them to
// `window`, and reads sibling components as free globals. We preserve that
// faithfully by compiling JSX with the CLASSIC runtime (React.createElement,
// React resolved from window) and loading the files in their original order
// from src/main.jsx.
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "classic",
      include: [/\.jsx?$/],
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  // Tauri expects a fixed dev port and relative asset paths in the build.
  base: "./",
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, target: "es2021" },
});
