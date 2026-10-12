---
title: React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css
impact: CRITICAL
impactDescription: The shell files for the `frontend/` tree. `vite.config.ts` is the stock Vite file plus `reboot()` from `@reboot-dev/reboot-react/vite`, which builds each MCP UI into the **nested** `frontend/dist/mcp/<name>/index.html` the server resolves. `npm run build` runs `build.mjs`, which auto-discovers and builds every UI; tsconfigs split into `app` and `node` halves.
tags: web, react, vite, tsconfig, package-json, css, build, hmr, scaffolding, build-mjs
---

## React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css

Everything below is MCP-UI-specific. The `frontend/` tree is
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
    "@reboot-dev/reboot-react": "1.6.0",
    "@reboot-dev/reboot-api": "1.6.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^26.6.4",
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

The stock Vite file with Reboot's plugin added. `reboot()` ships with
`@reboot-dev/reboot-react` and does everything the frontend layout
needs, so the file is:

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

export default defineConfig({
  plugins: [
    react(),
    reboot({ mcpUiPath: "mcp", webPath: "web", apiPath: "api" }),
  ],
});
```

`reboot()` takes the frontend's directories, relative to the file:
`mcpUiPath`, the directory whose `<name>/index.html` subdirectories
are the MCP UIs; `webPath`, the web app's directory, if there is one;
`apiPath`, the generated client, for the `@api` alias. Leave out what
the frontend doesn't have — an MCP-only frontend passes
`reboot({ mcpUiPath: "mcp", apiPath: "api" })`. With those it drives
three jobs: the `serve` dev server (HMR for every MCP UI and the web
app under `/__/frontend/`, on port `RBT_VITE_PORT` or 4444, listening
on every interface), and two builds selected by `RBT_BUILD_TARGET`
(set per UI by `build.mjs`) — `mcp:<name>` builds one MCP UI, rooted
at `mcp/<name>/` so its `index.html` lands at the **nested**
`dist/mcp/<name>/index.html` the MCP server resolves, with the JS/CSS
inlined by `vite-plugin-singlefile`; `web` builds the web app into
`dist/web/`. It also dedupes `react`, `react-dom` and `zod`, and
reads `.env*` from `webPath`.

Everything else is ordinary Vite config, added to the literal as in
any project — another plugin
(`plugins: [react(), tailwindcss(), reboot({...})]`),
`build.sourcemap`, and so on. The values the plugin sets — `root`,
`base`, `envDir`, `publicDir`, `build.outDir`, `build.emptyOutDir`,
the `server` port and host, the `@api` alias — are the contract with the backend's
`--mcp-app-url`, `--mcp-app-dist-path` and `--web-app-dist-path`; if the
config sets one of them too, `reboot()` raises an error naming it,
rather than one value silently winning. Relative paths elsewhere in
the config resolve against each build's root (`mcp/<name>/` or
`web/`), so write any path the config adds as
`path.resolve(__dirname, ...)`.

**Don't replace this file with a hand-written config.** If you see
`Web artifact 'frontend/dist/mcp/<name>/index.html' is missing`, the
fix is `cd frontend && npm run build`, **not** a Vite config that
emits a flat `dist/<name>.html`; that breaks discovery.

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
