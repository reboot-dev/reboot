---
title: React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css
impact: CRITICAL
impactDescription: The shell files for the `frontend/` tree. `vite.config.ts` is the stock Vite file plus `reboot()` from `@reboot-dev/reboot-react/vite`, which builds each MCP App into the **nested** `frontend/dist/mcp/<name>/index.html` the server resolves. `npm run build` runs the package's `build.mjs`, which builds every UI the plugin declares; tsconfigs split into `app` and `node` halves.
tags: web, react, vite, tsconfig, package-json, css, build, hmr, scaffolding, build.mjs
---

## React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css

Everything below is MCP App-specific. The `frontend/` tree is
owned by this skill — `python` knows nothing about it.

## `frontend/package.json`

**`npm run build` type-checks and then runs `build.mjs`, two lines
that call `build()` from `@reboot-dev/reboot-react/vite`, which
builds every UI the `reboot()` plugin in `vite.config.ts` declares.
Don't hand-maintain per-UI `build:<name>` scripts; a frontend with
more to do calls `build()` between its own steps in that file.**

`build.mjs` is for a frontend with more than one UI: several MCP
Apps, or MCP Apps and the web app. A frontend declaring exactly one
UI builds with plain `vite build` (the plugin builds the one it
declares when no target is set), which is what the `web-app` skill's
web-only shell does. This scaffold starts with `build.mjs` because an
MCP frontend tends to grow UIs, and then nothing about the build
changes when it does.

```json
{
  "name": "<project-name>-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npm run dev:portless",
    "dev:portless": "portless frontend-<project-name> vite",
    "dev:ports": "vite",
    "build": "tsc -b && node build.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "1.5.0",
    "@modelcontextprotocol/sdk": "1.29.0",
    "@reboot-dev/reboot-react": "1.7.2",
    "@reboot-dev/reboot-api": "1.7.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^26.6.4",
    "@types/react": "^18.2.67",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.7.0",
    "portless": "^0.15.7",
    "typescript": "^5.9.2",
    "vite": "^6.3.5",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

The `dev` scripts mirror the `.rbtrc`'s configs: `npm run dev` is
the default, `dev:portless`, which runs `portless frontend-<project-name> vite`
(`portless` is a dev dependency and appends Vite's `--port` itself),
and `dev:ports` is plain `vite`. `<project-name>` is the `.rbtrc`'s
`--application-name`.

Adding or removing a UI needs no script changes: `build()` loads
`vite.config.ts`, asks `reboot()` for the frontend's UIs (every
`mcp/<name>/index.html`, then the `web/` SPA), and runs one
`vite build` per UI with `RBT_BUILD_TARGET` set to it. `vite` and
`vite-plugin-singlefile` are optional peer dependencies of
`@reboot-dev/reboot-react` that the plugin imports, so they stay in
`devDependencies`.

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
    reboot({ mcpAppPath: "mcp", webAppPath: "web", apiPath: "api" }),
  ],
});
```

`reboot()` takes the frontend's directories, relative to the file:
`mcpAppPath`, the directory whose `<path>/index.html` subdirectories
are the MCP Apps, one per `UI(path=...)`; `webAppPath`, the web app's
directory, if there is one; `apiPath`, the generated client, for the
`@api` alias. Leave out what the frontend doesn't have — an MCP-only
frontend passes `reboot({ mcpAppPath: "mcp", apiPath: "api" })`. With
those it drives three jobs: the `serve` dev server (HMR for every MCP
App and the web app under `/__/frontend/`, each MCP App at its
`UI(path=...)` URL `/__/frontend/mcp/<path>/`, on Vite's default port
unless the config sets `server.port`, listening on every interface),
and two builds selected by `RBT_BUILD_TARGET` (set per UI by
`build()`) — `mcp:<path>` builds one MCP App, rooted at `mcp/<path>/`
so its `index.html` lands at the **nested**
`dist/mcp/<path>/index.html` the MCP server reads
(`--mcp-app-dist-path=frontend/dist/mcp`), with the JS/CSS inlined by
`vite-plugin-singlefile`; `web` builds the web app into `dist/web/`.
It also dedupes `react`, `react-dom` and `zod`, and reads `.env*`
from `webAppPath`.

Everything else is ordinary Vite config, added to the literal as in
any project — another plugin
(`plugins: [react(), tailwindcss(), reboot({...})]`),
`build.sourcemap`, and so on. The values the plugin sets — `root`,
`base`, `envDir`, `publicDir`, `build.outDir`, `build.emptyOutDir`,
`allowedHosts`, the `@api` alias — are the contract with the backend's
`--frontend-url` and `--mcp-app-dist-path`; if the
config sets one of them too, `reboot()` raises an error naming it,
rather than one value silently winning. Relative paths elsewhere in
the config resolve against each build's root (`mcp/<name>/` or
`web/`), so write any path the config adds as
`path.resolve(__dirname, ...)`.

**Don't replace this file with a hand-written config.** If you see
`The '<ui>' MCP App's build '.../index.html' is missing`, the fix is
`cd frontend && npm run build`, **not** a Vite config that emits a
flat `dist/<name>.html`; that breaks the lookup.

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
