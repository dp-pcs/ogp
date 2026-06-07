import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  // Tauri expects a fixed dev port and relative asset paths in the build.
  base: "./",
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, target: "es2021" },
});
