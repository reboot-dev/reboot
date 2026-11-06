---
name: frontend
description: The React side of a Reboot application. Covers the client `rbt generate --react=` writes (a hook per state type, mutations, typed errors), a standalone web app at `frontend/web/`, MCP App UIs under `frontend/mcp/`, the Vite setup both share, and browser scenarios that drive the web app with Playwright. The app skill reads it at the frontend step of a build; use it directly when changing the React code of an existing Reboot app.
---

# frontend — The React Side of a Reboot App

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

A Reboot app's frontend is React, built with Vite, and talks to the
backend through a client that `rbt generate --react=` writes into
`frontend/api/`. An app has one or both of two kinds of frontend:

- **A web app**: a single-page app at `frontend/web/`, opened at a
  URL in a normal browser.
- **MCP App UIs**: one small React app per `UI()` method, at
  `frontend/mcp/<name>/`, which an MCP host such as Claude or ChatGPT
  shows inside the chat.

Both use the same generated client and the same `frontend/` folder.
Everything on the backend side, including the `UI()` declarations and
sign-in, is in the [`python` skill](../python/SKILL.md).

## Which page to read

Read a page at the step that needs it, and read it once: everything
you read is sent again on every later turn. An app with both
frontends reads the pages for both.

**Every app**, at the frontend step:

- [`react-generated-client.md`](references/react-generated-client.md)
  — what `rbt generate --react=` emits, identically for every
  frontend: the `use<Type>()` overloads, the three-field reader
  return, why mutations resolve to `{ response, aborted }` instead
  of throwing, the typed error classes, and the snake→camel naming
  rules.

**A web app**, at the frontend step:

- [`react-client.md`](references/react-client.md) — the `frontend/`
  shell (the stock Vite config rooted at `web/`, including the
  `server.host` the browser needs), the backend URL
  (`VITE_REBOOT_URL` — the default detection resolves to Vite's
  origin, not the backend's), sign-in/sign-out, and how a typed
  backend error becomes a message the user sees.

and at the tests step:

- [`testing-web-app.md`](references/testing-web-app.md) — the
  `frontend` fixture, the web app steps, and the accessible markup
  the page needs.

**MCP App UIs**, at the frontend step:

- [`react-scaffolding.md`](references/react-scaffolding.md) — the
  `frontend/` shell: `package.json` and `build.mjs` (`npm run build`
  calls the package's `build()`, which builds every UI the plugin
  declares; a frontend with one UI could use plain `vite build`, as
  the web-only shell does), `vite.config.ts` (the stock Vite file
  plus `reboot()`), `tsconfig.json` / `tsconfig.app.json` /
  `tsconfig.node.json`, `index.css` theme variables,
  `mcp/<name>/index.html`, `mcp/<name>/main.tsx`.
- [`react-app-tsx.md`](references/react-app-tsx.md) — `App.tsx`
  itself: what an MCP App component renders, and the full Counter
  `App.tsx` + `App.module.css` example.
- [`gotchas-mcp-app.md`](references/gotchas-mcp-app.md) — the React
  side's trip list: camelCase names, the hook's name and import
  path, the build's output path, image URLs that carry no bearer.
- [`pop-out-to-web-app.md`](references/pop-out-to-web-app.md) — only
  when a widget needs a "pop out into the web app" button: recover
  the bound entity ID with the generated hook's `state_id`, build a
  deep-link URL, and open it via the host's
  `useMcpApp().openLink({ url })` (the sandboxed iframe blocks
  `window.open`) with a `window.open` fallback. The web-app side
  reads the ID from the URL; a shared `rbt_session` keeps the user
  signed in across frontends.

> **Never read `react-client.md` for an MCP App.** It covers the
> standalone browser SPA — the `frontend/web/` SPA, the
> `VITE_REBOOT_URL` backend URL, `<RebootClientProvider>`, browser
> sign-in buttons — none of which apply to the nested
> `frontend/mcp/<name>/` bundles an MCP host loads. The MCP App
> equivalents are `react-scaffolding.md` and `react-app-tsx.md`.

> **Never read the MCP App pages for a web app**
> (`react-scaffolding.md`, `react-app-tsx.md`, `gotchas-mcp-app.md`,
> `pop-out-to-web-app.md`). They cover the MCP frontend — `UI()`
> artifacts, the MCPJam inspector, `mcp/<name>/index.html` entries,
> one-file MCP App bundles, `mcp=Tool()` markers, popping a widget out
> into a web app. (The `frontend/` shell itself — `vite.config.ts`
> with `reboot()` — is the same for both, and `react-client.md` has
> it.) Reaching into them costs context and produces MCP App-shaped
> code (`mcp=Tool()` markers and `UI()` methods in an app with no MCP
> frontend).

## Web app: where it is served

In development Envoy serves the SPA at the backend's origin from
the Vite dev server (`--web-app`): `https://<app>.localhost/` under
portless (`cd frontend && npm run dev`, whose default is the
`dev:portless` script, beside `rbt dev run --portless`), or
`http://localhost:9991/` from `npm run dev:ports`, same-origin either
way, so the Reboot client needs no URL. Open it there, not at the
dev server's own origin (`https://frontend-<app>.localhost` or
`http://localhost:5173/`), where the client would take Vite's origin
for the backend. Built,
it lands in `frontend/dist/web/` with `base: "/"`, which a static
host can serve at `/`, or the backend can with
`--web-app-dist-path=frontend/dist/web` on `rbt serve run` (and on a
`dev run:dist` config); in development `dev run:ports --web-app` beside
`--frontend-url` has Envoy send `/` to the Vite dev server instead,
so the SPA is on the backend's origin with HMR; see
`python/references/lifecycle-rbtrc.md`.
An app that later adds an MCP frontend keeps this tree and this
config: it adds `frontend/mcp/<name>/` beside `web/` and
`mcpAppPath: "mcp"` to `reboot()`, and the same dev server and
`npm run build` serve and build both.

## Web app: feeding the user's identity into hooks

With `Application(oauth=...)` the signed-in user's own state needs
no id-threading: call the `User` hook with **no arguments**. For
explicit-id hooks the rule is that the id must be real on every
render — never a placeholder — which is covered with the rest of
the hook mechanics in
[`frontend/references/react-client.md`](references/react-client.md).

## Web app: browser-side wiring (React)

All of it — the provider (and the `url` it must be given), the
generated hook surface, sign-in/sign-out, reading typed errors, and
why a hook's `id` must be real on every render — is in
[`frontend/references/react-client.md`](references/react-client.md). Read it
at the frontend step; don't reconstruct it from memory here.

## Never read generated code

`frontend/api/**/*_rbt_react.ts` and `node_modules/` run to tens of
thousands of lines, and anything you open is sent again on every
later turn. What you need from the generated client is written out in
[`react-generated-client.md`](references/react-generated-client.md).
If something is genuinely missing, bound the output: a
`grep -n … | head -40`, never the whole file.
