import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

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
  const resolve = {
    alias: { "@api": path.resolve(__dirname, "./api") },
    dedupe: ["react", "react-dom", "zod"],
  };

  if (command === "serve") {
    const port = parseInt(process.env.RBT_VITE_PORT || "4444", 10);
    return {
      plugins: [react()],
      root: ".",
      resolve,
      base: "/__/web/",
      server: { port, strictPort: true, host: true, allowedHosts: true },
    };
  }

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
