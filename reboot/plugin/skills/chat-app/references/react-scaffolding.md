---
title: React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css
impact: CRITICAL
impactDescription: The shell files for the `frontend/` tree. `vite.config.ts` is load-bearing — flattening the HTML output breaks MCP UI artifact discovery (the server resolves `frontend/dist/mcp/<name>/index.html`, the **nested** Vite default). `npm run build` runs `build.mjs`, which auto-discovers and builds every UI; tsconfigs split into `app` and `node` halves.
tags: web, react, vite, tsconfig, package-json, css, build, hmr, scaffolding, build-mjs
---

## React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css

Everything below is MCP-Chat-App-specific. The `frontend/` tree is
owned by this skill — `python` knows nothing about it.

## `frontend/package.json`

**Use explicit per-UI build scripts as shown below. Do NOT create a
`build.js` or any auto-discovery wrapper — use `npm run build:<name>`
scripts directly.**

```json
{
  "name": "<project-name>-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build:<ui-name>": "vite build --mode <ui-name>",
    "build:watch:<ui-name>": "vite build --mode <ui-name> --watch",
    "build": "tsc --noEmit && npm run build:<ui-name>",
    "build:watch": "concurrently \"npm:build:watch:*\""
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "1.5.0",
    "@modelcontextprotocol/sdk": "1.29.0",
    "@reboot-dev/reboot-react": "1.2.1",
    "@reboot-dev/reboot-api": "1.2.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.67",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.7.0",
    "concurrently": "^9.1.2",
    "typescript": "^5.9.2",
    "vite": "^6.3.5",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

For multiple UIs, add `build:<name>` and `build:watch:<name>` entries
for each UI, and update the `build` script to chain them:

```
"build": "tsc --noEmit && npm run build:ui1 && npm run build:ui2"
```

## `frontend/vite.config.ts`

**CRITICAL: Copy this file EXACTLY.** One config drives two jobs,
selected by `command`/`mode`: the `serve` dev server (HMR for every
`mcp/<name>` UI under `/__/frontend/`) and `--mode <name>` (build one
MCP UI). Each `--mode <name>` build roots itself at `mcp/<name>/` so
its `index.html` lands at the **nested** `dist/mcp/<name>/index.html` —
the path the MCP server resolves — with the JS/CSS inlined by
`viteSingleFile`. If you see
`Web artifact 'frontend/dist/mcp/<name>/index.html' is missing`, the
fix is `cd frontend && npm run build`, **not** rewriting this file.

```typescript
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
```

## `frontend/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

## `frontend/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@api/*": ["./api/*"]
    }
  },
  "include": ["mcp", "web", "src"]
}
```

## `frontend/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

## `frontend/mcp/<ui-name>/index.css`

```css
:root {
  --color-bg: #1a1a2e;
  --color-bg-dark: #0f0f1a;
  --color-border: #2d2d4a;
  --color-text: #e0e0e0;
  --color-text-muted: #888899;
  --color-green: #4ade80;
  --color-blue: #60a5fa;
  --color-yellow: #fbbf24;
  --color-pink: #f472b6;
  --color-purple: #a78bfa;
  --color-orange: #fb923c;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    monospace;
}

[data-theme="light"] {
  --color-bg: #f8f9fa;
  --color-bg-dark: #e9ecef;
  --color-border: #dee2e6;
  --color-text: #212529;
  --color-text-muted: #6c757d;
  --color-green: #16a34a;
  --color-blue: #2563eb;
  --color-yellow: #ca8a04;
  --color-pink: #db2777;
  --color-purple: #7c3aed;
  --color-orange: #ea580c;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-mono);
  background: var(--color-bg);
  color: var(--color-text);
}
```

## `frontend/mcp/<ui-name>/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><UI Title></title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

## `frontend/mcp/<ui-name>/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { ClickerApp } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <ClickerApp />
    </RebootClientProvider>
  </StrictMode>
);
```
