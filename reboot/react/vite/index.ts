// The Vite plugin for a Reboot frontend: a directory holding MCP UIs
// (`<mcpUiPath>/<name>/index.html`, each built into one self-contained
// HTML file the backend serves as an MCP resource), a web app
// (`<webPath>/index.html`, a normal SPA), or both, beside the
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
//       reboot({ mcpUiPath: "mcp", webPath: "web", apiPath: "api" }),
//     ],
//   });
//
// One config drives three jobs, told apart by Vite's `command` and the
// `RBT_BUILD_TARGET` env var, set per UI by `reboot-vite-build`. `mode`
// keeps its conventional Vite values — `development` (serve) /
// `production` (build) — so the matching `.env.<mode>` files load as
// usual:
//
//   * `vite` (serve): a single dev server that delivers HMR for every
//     MCP UI AND the web app, all under `base: "/__/frontend/"`. Envoy
//     proxies that prefix to this dev server (`--mcp-app-url`, which
//     names its port: Vite's default unless the config sets one).
//   * `RBT_BUILD_TARGET=mcp:<name> vite build`: builds one MCP UI into
//     a single, self-contained `dist/mcp/<name>/index.html` (assets
//     inlined via `vite-plugin-singlefile`). The framework serves it
//     at `/__/frontend/mcp/<name>/index.html` in dist mode.
//   * `RBT_BUILD_TARGET=web vite build`: builds the web app into
//     `dist/web/` with normal (non-inlined) assets at `base: "/"`,
//     to be served at `/` by the backend (`--web-app-dist-path`) or any
//     static host. In Vite's `production` mode, it reads
//     `<webPath>/.env.production`.
//
// The plugin sets what the layout requires (`root`, `base`, the
// output directories, the dev server's host) and raises an
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

// The URL prefix Envoy proxies to the dev server (`--mcp-app-url`),
// which is also what the backend serves built MCP UIs under.
const BASE = "/__/frontend/";

export interface RebootOptions {
  /**
   * The directory of the MCP UIs, relative to the Vite config's
   * directory: each `<mcpUiPath>/<name>/index.html` is one, built to
   * `dist/mcp/<name>/index.html`. Absent means no MCP UIs.
   */
  mcpUiPath?: string;
  /**
   * The web app's directory, relative to the Vite config's
   * directory, holding its `index.html`, sources, `public/` and
   * `.env.*`. Served at the dev server's `/` and built to `dist/web/`.
   * Absent means no web app.
   */
  webPath?: string;
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
 * The names of the MCP UIs in a directory: every subdirectory with
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
 * each MCP UI, then `web` for the web app. The build script runs one
 * `vite build` per target.
 */
export function buildTargets(options: RebootOptions, root: string): string[] {
  const targets: string[] = [];
  if (options.mcpUiPath !== undefined) {
    for (const name of mcpUiNames(path.resolve(root, options.mcpUiPath))) {
      targets.push(`mcp:${name}`);
    }
  }
  if (options.webPath !== undefined) {
    targets.push("web");
  }
  return targets;
}

/**
 * The target of this `vite build`, from `RBT_BUILD_TARGET`, checked
 * against the frontend's UIs.
 */
export function buildTarget(options: RebootOptions, root: string): BuildTarget {
  const target = process.env.RBT_BUILD_TARGET ?? "";
  const valid = buildTargets(options, root);
  if (!valid.includes(target)) {
    throw new Error(
      `Unknown build target: ${target || "(unset)"}. ` +
        `Set RBT_BUILD_TARGET to one of: ${valid.join(", ")}; ` +
        "`reboot-vite-build` (`npm run build`) does so for each in turn."
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
// the web app and each MCP UI load with or without the trailing slash
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

// The web app is the dev server's home. `/` serves its `index.html`,
// put through Vite's HTML transform (which injects the HMR client and
// the React refresh preamble) and with its relative URLs made absolute
// under `/__/frontend/<webPath>/`, where this server serves the web
// app's directory. So does any path a browser navigates to that isn't
// under the `/__/frontend/` base, which is what makes the web app's
// own URL routing survive a reload, and what the backend's
// `--web-app-url` proxies its own `/` to. `/__/frontend` and
// `/__/frontend/` otherwise
// 404 (there's no index there), so they come to `/` too. Also print
// the friendlier `http://<host>/` at startup instead of the
// `/__/frontend/` base URL Vite would otherwise show (which is a dead
// link).
function serveWebAppAtRoot(webPath: string): Plugin {
  const webSegment = segment(webPath);
  const webPrefix = `${BASE}${webSegment}/`;
  return {
    name: "reboot:serve-web-app-at-root",
    apply: "serve",
    configureServer(server) {
      const webDir = path.resolve(server.config.root, webPath);
      const webIndex = path.join(webDir, "index.html");
      const publicDir = path.join(webDir, "public");
      // Whether `rel` names a file in the web app's `public/`, and
      // not one of its sources (which win, as they do for Vite).
      const isPublicFile = (rel: string): boolean => {
        if (rel === "" || fs.existsSync(path.join(webDir, rel))) return false;
        const file = path.resolve(publicDir, rel);
        return (
          file.startsWith(publicDir + path.sep) &&
          fs.existsSync(file) &&
          fs.statSync(file).isFile()
        );
      };
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const queryAt = url.indexOf("?");
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
        const query = queryAt === -1 ? "" : url.slice(queryAt);
        if (pathname === "/__/frontend" || pathname === "/__/frontend/") {
          // 302 (not 301): a permanent redirect would be cached by the
          // browser, which is wrong for a dev server.
          res.statusCode = 302;
          res.setHeader("Location", "/" + query);
          res.end();
          return;
        }
        // A file in the web app's `public/`, asked for as a built
        // app served at `/` would have it (`/favicon.svg`) or through
        // a relative URL in `index.html` rewritten below
        // (`/__/frontend/web/favicon.svg`): Vite serves `publicDir`
        // under the base, so point the request there.
        const rel = pathname.startsWith(webPrefix)
          ? pathname.slice(webPrefix.length)
          : pathname.startsWith(BASE)
          ? undefined
          : pathname.slice(1);
        if (rel !== undefined && isPublicFile(rel)) {
          req.url = `${BASE}${rel}${query}`;
          next();
          return;
        }
        // Vite's own URLs, the web app's sources, and the MCP UIs all
        // live under the base: not ours.
        if (pathname.startsWith(BASE)) {
          next();
          return;
        }
        // Anything else is the web app, but only for a browser
        // navigating to it: a fetch for a missing asset or a JSON path
        // still 404s, so a typo isn't masked by a page.
        const accept = req.headers.accept ?? "";
        if (
          req.method !== "GET" ||
          (pathname !== "/" && !accept.includes("text/html"))
        ) {
          next();
          return;
        }
        try {
          let html = fs.readFileSync(webIndex, "utf-8");
          // The path is as Vite sees it under the base, so the
          // injected script tags resolve there.
          html = await server.transformIndexHtml(
            `/${webSegment}/index.html`,
            html,
            req.originalUrl
          );
          html = html.replace(
            /(src|href)=(["'])\.\//g,
            `$1=$2${BASE}${webSegment}/`
          );
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        } catch (e) {
          next(e);
        }
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
 * for an MCP UI build, `vite-plugin-singlefile`.
 */
export function reboot(options: RebootOptions = {}): Plugin[] {
  const { mcpUiPath, webPath, apiPath } = options;

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
        "to the Vite config's directory, from which `mcpUiPath`, `webPath` and `apiPath` are resolved, and to each UI's directory when building it"
      );
      const root = process.cwd();

      if (
        mcpUiPath !== undefined &&
        !fs.existsSync(path.resolve(root, mcpUiPath))
      ) {
        throw new Error(
          `\`mcpUiPath\` names '${mcpUiPath}', which is not a directory under '${root}'.`
        );
      }
      if (
        webPath !== undefined &&
        !fs.existsSync(path.resolve(root, webPath, "index.html"))
      ) {
        throw new Error(
          `\`webPath\` names '${webPath}', which has no 'index.html' under '${root}'.`
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
      if (webPath !== undefined) {
        // Read `.env*` from the web app's directory, so its `VITE_*`
        // values are picked up by the dev server and every build,
        // including an MCP UI's (e.g. `VITE_WEB_APP_URL` for a
        // pop-out link).
        claim(
          config,
          "envDir",
          "to `webPath`, whose `.env.*` files configure every UI"
        );
        result.envDir = path.resolve(root, webPath);
      }

      // Dev server: serves both the MCP UIs and the web app.
      //
      // UIs use a double iframe architecture:
      //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
      //
      // The inner iframe loads from Envoy ("/__/frontend/**"), which
      // proxies to Vite. Because the inner iframe has a real origin,
      // Vite's URLs work normally. `base: "/__/frontend/"` ensures all
      // paths route through Envoy.
      //
      // The web app is served at `/` by this same server (see
      // `serveWebAppAtRoot`), which the backend's `--web-app-url`
      // proxies its own `/` to, so the app is on the backend's
      // origin as in production. Opened straight from this dev
      // server instead, it reaches the backend via `VITE_REBOOT_URL`
      // (see `<webPath>/.env.development`), cross-origin.
      //
      // Hot Module Replacement works automatically: Vite's client
      // connects to the page's origin, and Envoy proxies WebSocket
      // upgrades to Vite. This also works with tunnels (ngrok) since
      // the tunnel points to Envoy.
      if (env.command === "serve") {
        claim(
          config,
          "base",
          "to `/__/frontend/`, the prefix Envoy proxies to this dev server (`--mcp-app-url`)"
        );
        claim(
          config,
          "server.host",
          "to every interface, since requests come through Envoy (and tunnels)"
        );
        claim(
          config,
          "server.allowedHosts",
          "to every host, since requests come through Envoy (and tunnels)"
        );
        result.base = BASE;
        result.server = {
          host: true,
          allowedHosts: true,
        };
        if (webPath !== undefined) {
          // The web app's `public/` is served at `/`, as it is by its
          // build (whose root is `webPath`) and by any host serving
          // the built app.
          claim(
            config,
            "publicDir",
            "to `<webPath>/public`, the web app's static files"
          );
          result.publicDir = path.resolve(root, webPath, "public");
        }
        return result;
      }

      const target = buildTarget(options, root);

      // Build the web app into `dist/web/`. We root the build at
      // `webPath` so `index.html` and its `assets/` land directly
      // under `dist/web/` (rather than `dist/web/web/`). Keep assets
      // as separate files (a normal multi-file build) at `base: "/"`:
      // the built app is served at `/`, by the backend
      // (`--web-app-dist-path`) or by any static host.
      if (target.kind === "web") {
        claim(
          config,
          "base",
          "to `/`, where the built web app is served (`--web-app-dist-path`, or a static host)"
        );
        claim(
          config,
          "build.outDir",
          "to `dist/web`, where `--web-app-dist-path` and the deploy skill look for the built web app"
        );
        claim(
          config,
          "build.emptyOutDir",
          "since `dist/web` is the web app's own directory"
        );
        result.root = path.resolve(root, webPath!);
        result.base = "/";
        result.build = {
          outDir: path.resolve(root, "dist/web"),
          emptyOutDir: true,
        };
        return result;
      }

      // Build one MCP UI. We root the build at `<mcpUiPath>/<name>/`
      // so the output lands directly at `dist/mcp/<name>/index.html`,
      // a single self-contained file: `vite-plugin-singlefile`, which
      // the plugin adds for this build, inlines the assets and sets
      // the relative `base` that needs. The framework serves it at
      // `/__/frontend/mcp/<name>/index.html` in dist mode.
      claim(
        config,
        "build.outDir",
        "to `dist/mcp/<name>`, where `--mcp-app-dist-path` looks for each built MCP UI"
      );
      claim(
        config,
        "build.emptyOutDir",
        "since `dist/mcp/<name>` is the MCP UI's own directory"
      );
      result.root = path.resolve(root, mcpUiPath!, target.name);
      result.build = {
        outDir: path.resolve(root, "dist/mcp", target.name),
        emptyOutDir: true,
      };
      return result;
    },
  };

  // `vite-plugin-singlefile`, for an MCP UI build only: it sets the
  // inlining options and the relative `base` from its own `config`
  // hook, and must not touch the web app's build.
  const singlefile = viteSingleFile() as Plugin;
  singlefile.apply = isMcpUiBuild;

  const plugins: Plugin[] = [
    plugin,
    singlefile,
    redirectFrontendDirTrailingSlash(),
  ];
  if (webPath !== undefined) {
    plugins.push(serveWebAppAtRoot(webPath));
  }
  return plugins;
}
