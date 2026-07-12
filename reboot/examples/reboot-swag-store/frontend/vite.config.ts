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
