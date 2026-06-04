---
title: React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css
impact: CRITICAL
impactDescription: The shell files for the `web/` tree. `vite.config.ts` is load-bearing — flattening the HTML output breaks MCP UI artifact discovery (the server resolves `web/dist/<ui-path>/index.html`, the **nested** Vite default). Per-UI build scripts (no auto-discovery wrappers); tsconfigs split into `app` and `node` halves.
tags: web, react, vite, tsconfig, package-json, css, build, hmr, scaffolding, ui-name
---

## React Scaffolding — package.json, vite.config.ts, tsconfigs, index.css

Everything below is MCP-Chat-App-specific. The `web/` tree is owned
by this skill — `python` knows nothing about it.

## `web/package.json`

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
    "@reboot-dev/reboot-react": "1.0.3",
    "@reboot-dev/reboot-api": "1.0.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^3.25.0"
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

## `web/vite.config.ts`

**CRITICAL: Copy this file EXACTLY.** Don't try to "flatten" the HTML
output. The MCP server resolves the UI artifact at
`web/dist/<ui-path>/index.html` (where `<ui-path>` matches the
`path=` you set in `UI(...)`) — i.e. the **nested** Vite default.
The `entryFileNames` / `assetFileNames` overrides in this config
flatten the JS/CSS bundle names (which `viteSingleFile` then inlines
into the HTML), but the HTML itself stays at its source-relative
path. If you see `Web artifact 'web/dist/ui/<name>/index.html' is missing`,
the fix is `cd web && npm run build`, **not** rewriting this file
to emit `dist/<name>.html`.

```typescript
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
  // The inner iframe loads from Envoy ("/__/web/**"), which proxies to
  // Vite. Because the inner iframe has a real origin, Vite's URLs work
  // normally. `base: "/__/web/"` ensures all paths route through Envoy.
  //
  // Hot Module Replacement works automatically: Vite's client connects
  // to the page's origin, and Envoy proxies WebSocket upgrades to Vite.
  // This also works with tunnels (ngrok) since the tunnel points to
  // Envoy.
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
        // Listen on all interfaces since requests come through Envoy
        // (and tunnels).
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
```

## `web/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

## `web/tsconfig.app.json`

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
  "include": ["ui"]
}
```

## `web/tsconfig.node.json`

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

## `web/index.css`

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

## `web/ui/<ui-name>/index.html`

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

## `web/ui/<ui-name>/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { ClickerApp } from "./App";
import "../../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <ClickerApp />
    </RebootClientProvider>
  </StrictMode>
);
```
