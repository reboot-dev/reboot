// The Vite plugin for a Reboot frontend: a directory holding MCP Apps
// (`<mcpAppPath>/<name>/index.html`, each built into one self-contained
// HTML file the backend serves as an MCP resource), a web app
// (`<webAppPath>/index.html`, a normal SPA), or both, beside the
// generated client (`<apiPath>/`). `vite.config.ts` is the stock Vite
// file with this plugin added:
//
//   import react from "@vitejs/plugin-react";
//   import { defineConfig } from "vite";
//   import { reboot } from "@reboot-dev/reboot-react/vite";
//
//   export default defineConfig({
//     plugins: [
//       react(),
//       reboot({ mcpAppPath: "mcp", webAppPath: "web", apiPath: "api" }),
//     ],
//   });
//
// One config drives three jobs, told apart by Vite's `command` and the
// `RBT_BUILD_TARGET` env var, set per UI by `build()` (`./build`). `mode`
// keeps its conventional Vite values — `development` (serve) /
// `production` (build) — so the matching `.env.<mode>` files load as
// usual:
//
//   * `vite` (serve): a single dev server that delivers HMR for every
//     MCP App AND the web app, all under `base: "/__/frontend/"`. Envoy
//     proxies that prefix to this dev server (`--frontend-url`).
//   * `RBT_BUILD_TARGET=mcp:<name> vite build`: builds one MCP App into
//     a single, self-contained `dist/mcp/<name>/index.html` (assets
//     inlined via `vite-plugin-singlefile`). The framework serves it
//     at `/__/frontend/mcp/<name>/index.html` in dist mode.
//   * `RBT_BUILD_TARGET=web vite build`: builds the web app into
//     `dist/web/` with normal (non-inlined) assets. Its `base` is
//     `/__/frontend/web/` so asset URLs resolve when served at that
//     prefix. In Vite's `production` mode, it reads
//     `<webAppPath>/.env.production`.
//
// A frontend that declares one UI, a web app alone, needs no target:
// a bare `vite build` builds it.
//
// The plugin sets what the layout requires (`root`, `base`, the
// output directories, the dev server's port and host) and raises an
// error when the Vite config already sets one of those, rather than
// silently winning or losing the merge.
import fs from "fs";
import path from "path";
import {
  normalizePath,
  type ConfigEnv,
  type Plugin,
  type UserConfig,
} from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The URL prefix Envoy proxies to the dev server (`--frontend-url`),
// which is also what the backend serves built MCP Apps under.
const BASE = "/__/frontend/";

export interface RebootOptions {
  /**
   * The directory of the MCP Apps, relative to the Vite config's
   * directory: each `<mcpAppPath>/<name>/index.html` is one, built to
   * `dist/mcp/<name>/index.html`. Absent means no MCP Apps.
   */
  mcpAppPath?: string;
  /**
   * The web app's directory, relative to the Vite config's
   * directory, holding its `index.html`, sources, `public/` and
   * `.env.*`. Served at the dev server's `/` and built to `dist/web/`.
   * Absent means no web app.
   */
  webAppPath?: string;
  /**
   * The generated client's directory (`rbt generate --react=...`),
   * relative to the Vite config's directory, for the `@api` import
   * alias. Absent means no alias.
   */
  apiPath?: string;
}

/** What one `vite build` builds, from `RBT_BUILD_TARGET`. */
export type BuildTarget = { kind: "web" } | { kind: "mcp"; name: string };

/**
 * The names of the MCP Apps in a directory: every subdirectory with
 * an `index.html`.
 */
export function mcpUiNames(mcpUiDir: string): string[] {
  return fs
    .readdirSync(mcpUiDir)
    .filter((name) => fs.existsSync(path.join(mcpUiDir, name, "index.html")))
    .sort();
}

/**
 * The `RBT_BUILD_TARGET` values of a frontend's UIs: `mcp:<name>` for
 * each MCP App, then `web` for the web app. The build script runs one
 * `vite build` per target.
 */
export function buildTargets(options: RebootOptions, root: string): string[] {
  const targets: string[] = [];
  if (options.mcpAppPath !== undefined) {
    for (const name of mcpUiNames(path.resolve(root, options.mcpAppPath))) {
      targets.push(`mcp:${name}`);
    }
  }
  if (options.webAppPath !== undefined) {
    targets.push("web");
  }
  return targets;
}

/**
 * The target of this `vite build`: `RBT_BUILD_TARGET`, checked against
 * the frontend's UIs, or, when it is unset, the one UI the frontend
 * declares, so that a frontend with a single UI (a web app alone)
 * builds with plain `vite build`.
 */
export function buildTarget(options: RebootOptions, root: string): BuildTarget {
  const valid = buildTargets(options, root);
  const target =
    process.env.RBT_BUILD_TARGET ?? (valid.length === 1 ? valid[0] : "");
  if (!valid.includes(target)) {
    throw new Error(
      `Unknown build target: ${target || "(unset)"}. ` +
        `Set RBT_BUILD_TARGET to one of: ${valid.join(", ")}; ` +
        "`build()` from `@reboot-dev/reboot-react/vite` does so for each in turn."
    );
  }
  return target === "web"
    ? { kind: "web" }
    : { kind: "mcp", name: target.slice("mcp:".length) };
}

// A URL path segment for a directory option: `./web/` -> `web`.
function segment(dir: string): string {
  return normalizePath(path.normalize(dir))
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

// A served directory under `/__/frontend/` requested without its
// trailing slash (e.g. `/__/frontend/web`) doesn't match Vite's static
// index.html serving, which expects `/__/frontend/web/`, so it 404s.
// Redirect the slash-less form to the canonical trailing-slash form so
// the web app and each MCP App load with or without the trailing slash
// — matching how the framework's dist-mode server behaves. Only a path
// that resolves to a real directory with an `index.html` is
// redirected, so Vite's own internal module URLs (`@vite/client`,
// `@react-refresh`) and source or asset files fall through untouched.
function redirectFrontendDirTrailingSlash(): Plugin {
  return {
    name: "reboot:frontend-dir-trailing-slash",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const queryAt = url.indexOf("?");
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
        if (pathname.startsWith(BASE) && !pathname.endsWith("/")) {
          const subpath = pathname.slice(BASE.length);
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

// The web app is the dev server's home: the bare `/`, `/__/frontend`,
// and `/__/frontend/` otherwise 404 (there's no index there), so
// silently redirect them to `/__/frontend/<webAppPath>/`. Also print the
// friendlier `http://<host>/` at startup instead of the
// `/__/frontend/` base URL Vite would otherwise show (which is a dead
// link).
function serveWebAppAtRoot(webAppPath: string): Plugin {
  const target = `${BASE}${segment(webAppPath)}/`;
  const homes = new Set(["/", "/__/frontend", "/__/frontend/"]);
  return {
    name: "reboot:serve-web-app-at-root",
    apply: "serve",
    configureServer(server) {
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

// Raises if the Vite config already sets `key` (a dotted path), which
// the plugin is about to set: the layout needs the plugin's value,
// and the merge would otherwise pick one silently.
function claim(config: UserConfig, key: string, why: string): void {
  let value: unknown = config;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object") {
      value = undefined;
      break;
    }
    value = (value as Record<string, unknown>)[part];
  }
  if (value !== undefined) {
    throw new Error(
      `\`${key}\` is set in the Vite config, but \`reboot()\` sets it ${why}. ` +
        "Remove it from the config."
    );
  }
}

// Whether the Vite config's `resolve.alias`, in either of its forms,
// already has an entry for `find`.
function hasAlias(config: UserConfig, find: string): boolean {
  const alias = config.resolve?.alias;
  if (alias === undefined) return false;
  if (Array.isArray(alias)) return alias.some((entry) => entry.find === find);
  return Object.prototype.hasOwnProperty.call(alias, find);
}

/**
 * The plugin for a Reboot frontend; see the top of this file. Returns
 * the config plugin plus, for the dev server, the two that serve the
 * web app at `/` and directories without their trailing slash, and,
 * for an MCP App build, `vite-plugin-singlefile`.
 */
export function reboot(options: RebootOptions = {}): Plugin[] {
  const { mcpAppPath, webAppPath, apiPath } = options;

  const isMcpUiBuild = (_config: UserConfig, env: ConfigEnv): boolean =>
    env.command === "build" &&
    (process.env.RBT_BUILD_TARGET ?? "").startsWith("mcp:");

  const plugin: Plugin = {
    name: "reboot",
    // For tools such as the build script: the frontend's `RBT_BUILD_TARGET`s.
    api: {
      options,
      buildTargets: (root: string): string[] => buildTargets(options, root),
    },
    config(config, env): UserConfig {
      // The Vite config's directory, Vite's default root. The plugin
      // sets `root` itself per build, so it has to be the default.
      claim(
        config,
        "root",
        "to the Vite config's directory, from which `mcpAppPath`, `webAppPath` and `apiPath` are resolved, and to each UI's directory when building it"
      );
      const root = process.cwd();

      if (
        mcpAppPath !== undefined &&
        !fs.existsSync(path.resolve(root, mcpAppPath))
      ) {
        throw new Error(
          `\`mcpAppPath\` names '${mcpAppPath}', which is not a directory under '${root}'.`
        );
      }
      if (
        webAppPath !== undefined &&
        !fs.existsSync(path.resolve(root, webAppPath, "index.html"))
      ) {
        throw new Error(
          `\`webAppPath\` names '${webAppPath}', which has no 'index.html' under '${root}'.`
        );
      }

      const result: UserConfig = {
        resolve: {
          // Two copies of `react` or `zod` — one from the app, one
          // pulled through the Reboot packages — break hooks and
          // schema identity checks at runtime.
          dedupe: ["react", "react-dom", "zod"],
        },
      };
      if (apiPath !== undefined) {
        if (hasAlias(config, "@api")) {
          throw new Error(
            "`resolve.alias` has an entry for `@api`, but `reboot()` sets it to `apiPath`. Remove it from the config."
          );
        }
        result.resolve!.alias = { "@api": path.resolve(root, apiPath) };
      }
      if (webAppPath !== undefined) {
        // Read `.env*` from the web app's directory, so its `VITE_*`
        // values are picked up by the dev server and every build,
        // including an MCP App's (e.g. `VITE_WEB_APP_URL` for a
        // pop-out link).
        claim(
          config,
          "envDir",
          "to `webAppPath`, whose `.env.*` files configure every UI"
        );
        result.envDir = path.resolve(root, webAppPath);
      }

      // Dev server: serves both the MCP Apps and the web app.
      //
      // UIs use a double iframe architecture:
      //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
      //
      // The inner iframe loads from Envoy ("/__/frontend/**"), which
      // proxies to Vite. Because the inner iframe has a real origin,
      // Vite's URLs work normally. `base: "/__/frontend/"` ensures all
      // paths route through Envoy.
      //
      // The web app is served at `/__/frontend/<webAppPath>/` by this
      // same server. It reaches the backend via `VITE_REBOOT_URL`
      // (see `<webAppPath>/.env.development`) rather than its own
      // origin, so opening it straight from this dev server
      // exercises the real cross-origin frontend/backend path — the
      // same shape as a production deploy.
      //
      // Hot Module Replacement works automatically: Vite's client
      // connects to the page's origin, and Envoy proxies WebSocket
      // upgrades to Vite. This also works with tunnels (ngrok) since
      // the tunnel points to Envoy.
      if (env.command === "serve") {
        claim(
          config,
          "base",
          "to `/__/frontend/`, the prefix Envoy proxies to this dev server (`--frontend-url`)"
        );
        claim(
          config,
          "server.allowedHosts",
          "to every host, since requests come through Envoy (and tunnels)"
        );
        result.base = BASE;
        result.server = {
          // Every interface unless the config, or the command line,
          // which Vite merges into it before plugins see it, says
          // where to listen (a runner such as portless passes
          // `--host 127.0.0.1`). Not Vite's own default, `localhost`,
          // which Node may bind as `::1` alone while Envoy connects
          // over IPv4.
          host: config.server?.host ?? true,
          allowedHosts: true,
        };
        if (webAppPath !== undefined) {
          // The web app's `public/` is served at `/`, as it is by its
          // build (whose root is `webAppPath`) and by any host serving
          // the built app.
          claim(
            config,
            "publicDir",
            "to `<webAppPath>/public`, the web app's static files"
          );
          result.publicDir = path.resolve(root, webAppPath, "public");
        }
        return result;
      }

      const target = buildTarget(options, root);

      // Build the web app into `dist/web/`. We root the build at
      // `webAppPath` so `index.html` and its `assets/` land directly
      // under `dist/web/` (rather than `dist/web/web/`). Keep assets
      // as separate files (a normal multi-file build) and set `base`
      // so their URLs resolve when the app is served at
      // `/__/frontend/web/`.
      if (target.kind === "web") {
        claim(
          config,
          "base",
          "to `/__/frontend/web/`, where the web app is served"
        );
        claim(
          config,
          "build.outDir",
          "to `dist/web`, where the deploy skill looks for the built web app"
        );
        claim(
          config,
          "build.emptyOutDir",
          "since `dist/web` is the web app's own directory"
        );
        result.root = path.resolve(root, webAppPath!);
        result.base = "/__/frontend/web/";
        result.build = {
          outDir: path.resolve(root, "dist/web"),
          emptyOutDir: true,
        };
        return result;
      }

      // Build one MCP App. We root the build at `<mcpAppPath>/<name>/`
      // so the output lands directly at `dist/mcp/<name>/index.html`,
      // a single self-contained file: `vite-plugin-singlefile`, which
      // the plugin adds for this build, inlines the assets and sets
      // the relative `base` that needs. The framework serves it at
      // `/__/frontend/mcp/<name>/index.html` in dist mode.
      claim(
        config,
        "build.outDir",
        "to `dist/mcp/<name>`, where `--mcp-app-dist-path` looks for each built MCP App"
      );
      claim(
        config,
        "build.emptyOutDir",
        "since `dist/mcp/<name>` is the MCP App's own directory"
      );
      result.root = path.resolve(root, mcpAppPath!, target.name);
      result.build = {
        outDir: path.resolve(root, "dist/mcp", target.name),
        emptyOutDir: true,
      };
      return result;
    },
  };

  // `vite-plugin-singlefile`, for an MCP App build only: it sets the
  // inlining options and the relative `base` from its own `config`
  // hook, and must not touch the web app's build.
  const singlefile = viteSingleFile() as Plugin;
  singlefile.apply = isMcpUiBuild;

  const plugins: Plugin[] = [
    plugin,
    singlefile,
    redirectFrontendDirTrailingSlash(),
  ];
  if (webAppPath !== undefined) {
    plugins.push(serveWebAppAtRoot(webAppPath));
  }
  return plugins;
}

export { build, type BuildOptions } from "./build.js";
