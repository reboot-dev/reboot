// Vite configuration for Reboot UIs.
//
// One config drives two jobs, selected by `command`/`mode`:
//
//   * `vite` (serve): a single dev server that delivers HMR for every
//     `mcp/<name>` UI under `base: "/__/frontend/"`. Envoy proxies that
//     prefix to this dev server (`run --config=hmr`).
//   * `vite build --mode <name>`: builds one MCP UI into a single,
//     self-contained `dist/mcp/<name>/index.html` (assets inlined via
//     `vite-plugin-singlefile`). The framework serves it at
//     `/__/frontend/mcp/<name>/index.html` in dist mode.
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Auto-discover MCP UIs: every `mcp/<name>/` with an `index.html`.
// There may be no `mcp/` directory at all (one whose last MCP UI was
// removed), so guard the read.
const mcpDir = path.resolve(__dirname, "mcp");
const mcpNames: string[] = fs.existsSync(mcpDir)
  ? fs
      .readdirSync(mcpDir)
      .filter((name) => fs.existsSync(path.resolve(mcpDir, name, "index.html")))
  : [];

// Path alias for API imports (`@api/...` -> `./api/...`).
const resolve = {
  alias: {
    "@api": path.resolve(__dirname, "./api"),
  },
  dedupe: ["react", "react-dom", "zod"],
};

export default defineConfig(({ command, mode }) => {
  // Dev server: serves the MCP UIs with HMR.
  //
  // UIs use a double iframe architecture:
  //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
  //
  // The inner iframe loads from Envoy ("/__/frontend/**"), which
  // proxies to Vite. Because the inner iframe has a real origin,
  // Vite's URLs work normally. `base: "/__/frontend/"` ensures all
  // paths route through Envoy.
  //
  // Hot Module Replacement works automatically: Vite's client connects
  // to the page's origin, and Envoy proxies WebSocket upgrades to
  // Vite. This also works with tunnels (ngrok) since the tunnel
  // points to Envoy.
  if (command === "serve") {
    const port = parseInt(process.env.RBT_VITE_PORT || "4444", 10);

    return {
      plugins: [react()],
      root: ".",
      resolve,
      base: "/__/frontend/",
      server: {
        port,
        strictPort: true,
        // Listen on all interfaces since requests come through
        // Envoy (and tunnels).
        host: true,
        allowedHosts: true,
      },
    };
  }

  // Build one MCP UI: `vite build --mode <name>`. We root the build at
  // `mcp/<name>/` so the output lands directly at
  // `dist/mcp/<name>/index.html`, a single self-contained file (assets
  // inlined by `vite-plugin-singlefile`). The framework serves it at
  // `/__/frontend/mcp/<name>/index.html` in dist mode.
  const name = mode;
  if (!mcpNames.includes(name)) {
    const valid = mcpNames.map((n) => `--mode ${n}`).join(", ");
    throw new Error(
      `Unknown MCP UI: ${mode || "(unset)"}. Use one of: ${valid}.`
    );
  }

  return {
    plugins: [react(), viteSingleFile()],
    root: path.resolve(__dirname, "mcp", name),
    base: "/__/frontend/",
    build: {
      outDir: path.resolve(__dirname, "dist/mcp", name),
      emptyOutDir: true,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve,
  };
});
