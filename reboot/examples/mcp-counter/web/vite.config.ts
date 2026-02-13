import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Multi-entry build config for MCP Apps.
// Both apps use hybrid mode: MCP host integration + WebSocket reactive state.
export default defineConfig(({ mode }) => {
  const apps: Record<string, { input: string; output: string }> = {
    clicker: {
      input: "src/apps/clicker/index.html",
      output: "clicker.html",
    },
    dashboard: {
      input: "src/apps/dashboard/index.html",
      output: "dashboard.html",
    },
  };

  const app = apps[mode];
  if (!app) {
    // Default dev mode - serve clicker.
    return {
      plugins: [react()],
      root: "src/apps/clicker",
    };
  }

  return {
    plugins: [react(), viteSingleFile()],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        input: app.input,
        output: {
          inlineDynamicImports: true,
          entryFileNames: app.output.replace(".html", ".js"),
          assetFileNames: app.output.replace(".html", ".[ext]"),
        },
      },
    },
    resolve: {
      dedupe: ["react", "react-dom", "zod"],
    },
  };
});
