// The Vite plugin for a Reboot frontend: a directory holding MCP Apps
// (`<mcpAppPath>/<path>/index.html` for each `UI(path=...)`, each built
// into one self-contained HTML file the backend serves as an MCP
// resource), a web app
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
//     proxies that prefix to this dev server (`--frontend-url`). Each
//     MCP App is served at `/__/frontend/mcp/<path>/`, its
//     `UI(path=...)` URL, from `<mcpAppPath>/<path>/`.
//   * `RBT_BUILD_TARGET=mcp:<path> vite build`: builds one MCP App into
//     a single, self-contained `dist/mcp/<path>/index.html` (assets
//     inlined via `vite-plugin-singlefile`). The framework reads it
//     from `<--mcp-app-dist-path>/<path>/index.html` in dist mode.
//   * `RBT_BUILD_TARGET=web vite build`: builds the web app into
//     `dist/web/` with normal (non-inlined) assets at `base: "/"`,
//     to be served at `/` by the backend (`--web-app-dist-path`) or any
//     static host. In Vite's `production` mode, it reads
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

// The URL prefix under which the MCP Apps are served: each
// `UI(path=...)` is served at `/__/frontend/mcp/<path>/`, which the dev
// server maps onto `<mcpAppPath>/<path>/` (see `serveMcpAppsAtMcp`).
const MCP_BASE = `${BASE}mcp/`;

export interface RebootOptions {
  /**
   * The directory of the MCP Apps, relative to the Vite config's
   * directory: each `<mcpAppPath>/<path>/index.html` is the UI whose
   * `UI(path=...)` is `<path>`, served at `/__/frontend/mcp/<path>/`
   * and built to `dist/mcp/<path>/index.html`. Absent means no MCP
   * Apps.
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
 * The MCP Apps in a directory, as their `UI(path=...)` values: every
 * directory under it, at any depth, with an `index.html`, relative to
 * it with `/` separators (`clicker`, `shop/cart`).
 */
export function mcpUiNames(mcpUiDir: string): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, "index.html"))) {
        names.push(normalizePath(path.relative(mcpUiDir, full)));
      }
      walk(full);
    }
  };
  walk(mcpUiDir);
  return names.sort();
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

// Serve each MCP App at its `UI(path=...)` URL, `/__/frontend/mcp/<path>/`,
// from `<mcpAppPath>/<path>/`. The dev server's root is the Vite
// config's directory, so when `mcpAppPath` is `mcp` Vite already does
// this; for any other directory, rewrite the URL onto it. Only a URL
// that names something under `mcpAppPath` (a UI's directory, or a
// file in one) is rewritten, so nothing else under `/__/frontend/mcp/`
// changes meaning.
function serveMcpAppsAtMcp(mcpAppPath: string): Plugin {
  const dir = segment(mcpAppPath);
  return {
    name: "reboot:serve-mcp-apps-at-mcp",
    apply: "serve",
    configureServer(server) {
      if (dir === "mcp") return;
      const root = server.config.root;
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith(MCP_BASE)) {
          const queryAt = url.indexOf("?");
          const rest = url.slice(
            MCP_BASE.length,
            queryAt === -1 ? undefined : queryAt
          );
          if (rest !== "" && fs.existsSync(path.join(root, mcpAppPath, rest))) {
            req.url = `${BASE}${dir}/${url.slice(MCP_BASE.length)}`;
          }
        }
        next();
      });
    },
  };
}

// The web app is the dev server's home. Its `index.html` is served at
// `/`, and at any other path outside `/__/frontend/` a browser
// navigates to (so the app's own routing works on a reload or a
// shared link); Vite transforms it as it would at
// `/__/frontend/<webAppPath>/`, so its module URLs still carry the
// base. This is what `rbt dev run --web-app` relies on: Envoy sends
// `/`, and every path the application doesn't answer, here. The bare
// `/__/frontend` and `/__/frontend/`, which otherwise 404 (there's no
// index there), redirect to `/`, the home. Also print
// the friendlier `http://<host>/` at startup instead of the
// `/__/frontend/` base URL Vite would otherwise show.
function serveWebAppAtRoot(webAppPath: string): Plugin {
  const target = `${BASE}${segment(webAppPath)}/`;
  const homes = new Set(["/__/frontend", "/__/frontend/"]);
  return {
    name: "reboot:serve-web-app-at-root",
    apply: "serve",
    configureServer(server) {
      const indexHtml = path.resolve(
        server.config.root,
        webAppPath,
        "index.html"
      );
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const queryAt = url.indexOf("?");
        const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
        if (homes.has(pathname)) {
          const query = queryAt === -1 ? "" : url.slice(queryAt);
          res.statusCode = 302;
          res.setHeader("Location", "/" + query);
          res.end();
          return;
        }
        const navigation =
          req.method === "GET" &&
          (req.headers.accept ?? "").includes("text/html");
        if (pathname === "/" || (navigation && !pathname.startsWith(BASE))) {
          try {
            // Vite leaves the page's own relative URLs (`./src/main.tsx`)
            // alone, and served at `/` they would resolve outside the
            // base, so point them at the web app's directory under it.
            const html = (
              await server.transformIndexHtml(
                `${target}index.html`,
                fs.readFileSync(indexHtml, "utf-8"),
                req.originalUrl
              )
            )
              .replaceAll('"./', `"${target}`)
              .replaceAll("'./", `'${target}`);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (error) {
            next(error);
          }
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
        mcpAppPath !== undefined &&
        webAppPath !== undefined &&
        mcpUiNames(path.resolve(root, mcpAppPath)).some(
          (name) =>
            path.resolve(root, mcpAppPath, name) ===
            path.resolve(root, webAppPath)
        )
      ) {
        throw new Error(
          `\`webAppPath\` names '${webAppPath}', which is inside \`mcpAppPath\` '${mcpAppPath}', so it would be taken for an MCP App. Keep the web app outside the MCP Apps' directory.`
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
          "to `dist/web`, where the deploy skill looks for the built web app"
        );
        claim(
          config,
          "build.emptyOutDir",
          "since `dist/web` is the web app's own directory"
        );
        result.root = path.resolve(root, webAppPath!);
        result.base = "/";
        result.build = {
          outDir: path.resolve(root, "dist/web"),
          emptyOutDir: true,
        };
        return result;
      }

      // Build one MCP App. We root the build at `<mcpAppPath>/<path>/`
      // so the output lands directly at `dist/mcp/<path>/index.html`,
      // a single self-contained file: `vite-plugin-singlefile`, which
      // the plugin adds for this build, inlines the assets and sets
      // the relative `base` that needs. The framework reads it from
      // `<--mcp-app-dist-path>/<path>/index.html` in dist mode, so
      // `dist/mcp` is what `--mcp-app-dist-path` names.
      claim(
        config,
        "build.outDir",
        "to `dist/mcp/<path>`, where `--mcp-app-dist-path=.../dist/mcp` looks for each built MCP App"
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
  if (mcpAppPath !== undefined) {
    plugins.push(serveMcpAppsAtMcp(mcpAppPath));
  }
  if (webAppPath !== undefined) {
    plugins.push(serveWebAppAtRoot(webAppPath));
  }
  return plugins;
}

export { build, type BuildOptions } from "./build.js";
