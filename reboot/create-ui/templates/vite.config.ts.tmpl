// Vite configuration for Reboot UIs.
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Auto-discover UIs from ui/ directory.
const uiDir = path.resolve(__dirname, "ui");
const uis: Record<string, { input: string; output: string }> =
  Object.fromEntries(
    fs
      .readdirSync(uiDir)
      .filter((d) => fs.existsSync(path.join(uiDir, d, "index.html")))
      .map((name) => [
        name,
        { input: `ui/${name}/index.html`, output: `${name}.html` },
      ])
  );

export default defineConfig(({ command, mode }) => {
  // Path alias for API imports (@api/... -> ./api/...).
  const resolve = {
    alias: {
      "@api": path.resolve(__dirname, "./api"),
    },
    dedupe: ["react", "react-dom", "zod"],
  };

  // Dev server configuration.
  //
  // UIs use a double iframe architecture:
  //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
  //
  // The inner iframe loads from Envoy ("/__/web/**"), which proxies
  // to Vite. Because the inner iframe has a real origin, Vite's URLs
  // work normally. `base: "/__/web/"` ensures all paths route through
  // Envoy.
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
      base: "/__/web/",
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

  // Build mode: `vite build --mode <ui-name>`
  const ui = uis[mode];
  if (!ui) {
    const valid = Object.keys(uis).join(", ");
    throw new Error(`Unknown UI: ${mode}. Use --mode with: ${valid}`);
  }

  return {
    plugins: [react(), viteSingleFile()],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        input: ui.input,
        output: {
          inlineDynamicImports: true,
          entryFileNames: ui.output.replace(".html", ".js"),
          assetFileNames: ui.output.replace(".html", ".[ext]"),
        },
      },
    },
    resolve,
  };
});
