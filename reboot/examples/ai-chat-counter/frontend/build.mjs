// Builds every Reboot UI in this frontend in one shot, so
// `npm run build` keeps working as UIs are added or removed.
//
// `vite.config.ts` knows how to build a *single* MCP UI, selected by
// the `RBT_BUILD_TARGET` env var (`mcp:<name>`). This script is the
// discover-and-loop around it: it finds every `mcp/<name>/index.html`
// and builds each into `dist/mcp/<name>/index.html`.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-discover MCP UIs: every `mcp/<name>/` with an `index.html`.
const mcpDir = path.resolve(__dirname, "mcp");
const mcpNames = fs.existsSync(mcpDir)
  ? fs
      .readdirSync(mcpDir)
      .filter((name) => fs.existsSync(path.resolve(mcpDir, name, "index.html")))
  : [];

// Build each MCP UI. `vite.config.ts` reads the target from
// `RBT_BUILD_TARGET`; we leave Vite's `mode` at its build default
// (`production`).
for (const name of mcpNames) {
  console.log(`Building mcp/${name} ...`);
  process.env.RBT_BUILD_TARGET = `mcp:${name}`;
  await build();
}
