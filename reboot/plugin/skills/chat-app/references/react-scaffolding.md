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

**`npm run build` type-checks and then runs `build.mjs`, which
auto-discovers and builds every UI. Don't hand-maintain per-UI
`build:<name>` scripts.**

```json
{
  "name": "<project-name>-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && node build.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "1.5.0",
    "@modelcontextprotocol/sdk": "1.29.0",
    "@reboot-dev/reboot-react": "1.3.0",
    "@reboot-dev/reboot-api": "1.3.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "@types/react": "^18.2.67",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "^5.9.2",
    "vite": "^6.3.5",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

Adding or removing a UI needs no script changes: `build.mjs`
discovers every `mcp/<name>/index.html` (and the `web/` SPA) and
builds each one.

## `frontend/vite.config.ts`

**CRITICAL: Copy this file EXACTLY.** One config drives three jobs:
the `serve` dev server (HMR for every `mcp/<name>` UI and the `web/`
SPA under `/__/frontend/`), and two builds selected by the
`RBT_BUILD_TARGET` env var (set per UI by `build.mjs`) —
`RBT_BUILD_TARGET=mcp:<name>` (build one MCP UI) and
`RBT_BUILD_TARGET=web` (build the SPA). Each `mcp:<name>` build roots
itself at `mcp/<name>/` so
its `index.html` lands at the **nested** `dist/mcp/<name>/index.html` —
the path the MCP server resolves — with the JS/CSS inlined by
`viteSingleFile`. If you see
`Web artifact 'frontend/dist/mcp/<name>/index.html' is missing`, the
fix is `cd frontend && npm run build`, **not** rewriting this file.

```typescript
// Vite configuration for Reboot UIs.
//
// One config drives three jobs. The dev server is selected by
// `command === "serve"`; the two build shapes are selected by the
// `RBT_BUILD_TARGET` env var, set per UI by `build.mjs`. `mode` keeps
// its conventional Vite values — `development` (serve) / `production`
// (build) — so the matching `.env.<mode>` files load as usual:
//
//   * `vite` (serve): a single dev server that delivers HMR for every
//     `mcp/<name>` UI AND the standalone `web/` SPA, all under
//     `base: "/__/frontend/"`. Envoy proxies that prefix to this dev
//     server (`run --config=hmr`).
//   * `RBT_BUILD_TARGET=mcp:<name> vite build`: builds one MCP UI into
//     a single, self-contained `dist/mcp/<name>/index.html` (assets
//     inlined via `vite-plugin-singlefile`). The framework serves it
//     at `/__/frontend/mcp/<name>/index.html` in dist mode.
//   * `RBT_BUILD_TARGET=web vite build`: builds the `web/` SPA into
//     `dist/web/` with normal (non-inlined) assets. Its `base` is
//     `/__/frontend/web/` so asset URLs resolve when served at that
//     prefix. In Vite's `production` mode, it reads
//     `web/.env.production`.
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// A served directory under `/__/frontend/` requested without its
// trailing slash (e.g. `/__/frontend/web`) doesn't match Vite's static
// index.html serving, which expects `/__/frontend/web/`, so it 404s.
// Redirect the slash-less form to the canonical trailing-slash form so
// the `web/` SPA and each `mcp/<name>` UI load with or without the
// trailing slash — matching how the framework's dist-mode server
// behaves. Only a path that resolves to a real directory with an
// `index.html` is redirected, so Vite's own internal module URLs
// (`@vite/client`, `@react-refresh`) and source or asset files fall
// through untouched.
function redirectFrontendDirTrailingSlash(root: string): Plugin {
  const prefix = "/__/frontend/";
  return {
    name: "reboot-frontend-dir-trailing-slash",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const queryAt = url.indexOf("?");
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
        if (pathname.startsWith(prefix) && !pathname.endsWith("/")) {
          const subpath = pathname.slice(prefix.length);
          if (fs.existsSync(path.join(root, subpath, "index.html"))) {
            const query = queryAt === -1 ? "" : url.slice(queryAt);
            // 302 (not 301): a permanent redirect would be cached by the
            // browser, which is wrong for a dev server whose routes can
            // change between runs.
            res.statusCode = 302;
            res.setHeader("Location", `${pathname}/${query}`);
            res.end();
            return;
          }
        }
        next();
      });
    },
  };
}

// When a `web/` SPA exists, treat it as the dev server's home: the bare
// `/`, `/__/frontend`, and `/__/frontend/` otherwise 404 (there's no
// index there), so silently redirect them to `/__/frontend/web/`. Also
// print the friendlier `http://<host>/` at startup instead of the
// `/__/frontend/` base URL Vite would otherwise show (which is a dead
// link).
function serveWebAppAtRoot(root: string): Plugin {
  const webIndex = path.resolve(root, "web", "index.html");
  const target = "/__/frontend/web/";
  const homes = new Set(["/", "/__/frontend", "/__/frontend/"]);
  return {
    name: "reboot-serve-web-app-at-root",
    configureServer(server) {
      if (!fs.existsSync(webIndex)) return;
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const queryAt = url.indexOf("?");
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
        if (homes.has(pathname)) {
          const query = queryAt === -1 ? "" : url.slice(queryAt);
          res.statusCode = 302;
          res.setHeader("Location", target + query);
          res.end();
          return;
        }
        next();
      });
      // Print `http://<host>/` instead of the `/__/frontend/` base.
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        const urls = server.resolvedUrls;
        if (urls) {
          const toRoot = (u: string) => u.replace(/\/__\/frontend\/$/, "/");
          urls.local = urls.local.map(toRoot);
          urls.network = urls.network.map(toRoot);
        }
        printUrls();
      };
    },
  };
}

// Auto-discover MCP UIs: every `mcp/<name>/` with an `index.html`.
// There may be no `mcp/` directory at all (a web-only frontend, or
// one whose last MCP UI was removed), so guard the read.
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

export default defineConfig(({ command }) => {
  // Dev server: serves both the MCP UIs and the `web/` SPA.
  //
  // UIs use a double iframe architecture:
  //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
  //
  // The inner iframe loads from Envoy ("/__/frontend/**"), which
  // proxies to Vite. Because the inner iframe has a real origin,
  // Vite's URLs work normally. `base: "/__/frontend/"` ensures all
  // paths route through Envoy.
  //
  // The standalone `web/` SPA is served at `/__/frontend/web/` by this
  // same server. It reaches the backend via `VITE_REBOOT_URL` (see
  // `web/.env.development`) rather than its own origin, so opening it
  // straight from this dev server exercises the real cross-origin
  // frontend/backend path — the same shape as a production deploy.
  //
  // Hot Module Replacement works automatically: Vite's client connects
  // to the page's origin, and Envoy proxies WebSocket upgrades to
  // Vite. This also works with tunnels (ngrok) since the tunnel
  // points to Envoy.
  if (command === "serve") {
    const port = parseInt(process.env.RBT_VITE_PORT || "4444", 10);

    return {
      plugins: [
        react(),
        redirectFrontendDirTrailingSlash(__dirname),
        serveWebAppAtRoot(__dirname),
      ],
      root: ".",
      // Read `.env*` from `web/` (alongside the SPA), so the `web/`
      // SPA's `VITE_REBOOT_URL` is picked up by both this serve and the
      // `web/` production build, which is also rooted there.
      envDir: path.resolve(__dirname, "web"),
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

  // Which UI a build targets is read from `RBT_BUILD_TARGET` (set by
  // `build.mjs`), not Vite's `mode` — so `mode` stays `production`
  // and the `web/` build below reads `web/.env.production`.
  const target = process.env.RBT_BUILD_TARGET ?? "";

  // Build the standalone `web/` SPA into `dist/web/`. We root the
  // build at `web/` so `index.html` and its `assets/` land directly
  // under `dist/web/` (rather than `dist/web/web/`). Keep assets as
  // separate files (a normal multi-file build) and set `base` so
  // their URLs resolve when the SPA is served at `/__/frontend/web/`.
  if (target === "web") {
    return {
      plugins: [react()],
      root: path.resolve(__dirname, "web"),
      base: "/__/frontend/web/",
      build: {
        outDir: path.resolve(__dirname, "dist/web"),
        emptyOutDir: true,
      },
      resolve,
    };
  }

  // Build one MCP UI (`RBT_BUILD_TARGET=mcp:<name>`). We root the
  // build at `mcp/<name>/` so the output lands directly at
  // `dist/mcp/<name>/index.html`, a single self-contained file
  // (assets inlined by `vite-plugin-singlefile`). The framework
  // serves it at `/__/frontend/mcp/<name>/index.html` in dist mode.
  const name = target.startsWith("mcp:") ? target.slice("mcp:".length) : "";
  if (!mcpNames.includes(name)) {
    const valid = mcpNames.map((n) => `mcp:${n}`).join(", ");
    throw new Error(
      `Unknown build target: ${target || "(unset)"}. Set ` +
        `RBT_BUILD_TARGET=web or one of: ${valid}.`
    );
  }

  return {
    plugins: [react(), viteSingleFile()],
    root: path.resolve(__dirname, "mcp", name),
    base: "/__/frontend/",
    // Read `.env*` from `web/` (the shared frontend env), so an MCP UI
    // can pick up e.g. `VITE_WEB_APP_URL` for a pop-out link.
    envDir: path.resolve(__dirname, "web"),
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

## `frontend/build.mjs`

`npm run build` runs this after `tsc`. It discovers every UI and
builds each through `vite.config.ts` (selecting the UI via
`RBT_BUILD_TARGET`), so adding or removing a UI never touches the
build script.

```javascript
// Builds every Reboot UI in this frontend in one shot, so
// `npm run build` keeps working as UIs are added or removed.
//
// `vite.config.ts` knows how to build a *single* target, selected by
// the `RBT_BUILD_TARGET` env var (`mcp:<name>` for one MCP UI, or
// `web` for the SPA). This script is the discover-and-loop around it:
// it finds every `mcp/<name>/index.html`, builds each into
// `dist/mcp/<name>/index.html`, then builds the `web/` SPA into
// `dist/web/` if a `web/index.html` exists.
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
// (`production`) so a `web/.env.production` would be honored.
for (const name of mcpNames) {
  console.log(`Building mcp/${name} ...`);
  process.env.RBT_BUILD_TARGET = `mcp:${name}`;
  await build();
}

// Build the standalone `web/` SPA if it exists.
if (fs.existsSync(path.resolve(__dirname, "web", "index.html"))) {
  console.log("Building web ...");
  process.env.RBT_BUILD_TARGET = "web";
  await build();
}
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
  "include": ["mcp", "web", "vite-env.d.ts"]
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

## `frontend/vite-env.d.ts`

Vite's ambient client type declarations, which type `*.module.css`
imports and `import.meta.env`. It lives at the `frontend/` root, a
sibling of `mcp/` and `web/`, and `tsconfig.app.json`'s `include` lists
it by name so `tsc -b` type-checks against it.

```ts
/// <reference types="vite/client" />
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
