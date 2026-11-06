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
sign-in, is in the [`python` skill](../python/SKILL.md). The pages
below send you to these `python` pages; read them from here:

- [`patterns-mcp-app-gotchas.md`](../python/references/patterns-mcp-app-gotchas.md):
  the backend half of the MCP App gotchas.
- [`auth-http-routes.md`](../python/references/auth-http-routes.md):
  signed image URLs for an MCP App UI.
- [`state-collections.md`](../python/references/state-collections.md),
  [`servicer-reader.md`](../python/references/servicer-reader.md) and
  [`stdlib-ordered-map.md`](../python/references/stdlib-ordered-map.md):
  the state behind a composing reader in `react-app-tsx.md`.
- [`testing-features.md`](../python/references/testing-features.md):
  the backend steps that browser scenarios build on.

## Which page to read

Read a page at the step that needs it, and read it once. An app
with both frontends reads the pages for both.

**Every app**, at the frontend step:

- [`react-generated-client.md`](references/react-generated-client.md)
  — what `rbt generate --react=` emits, identically for every
  frontend: the `use<Type>()` overloads, the three-field reader
  return, why mutations resolve to `{ response, aborted }` instead
  of throwing, the typed error classes, and the snake→camel naming
  rules.

**A web app**, at the frontend step:

- [`react-client.md`](references/react-client.md) — the `frontend/`
  folder's Vite setup (the stock config rooted at `web/`, including the
  `server.host` the browser needs), the backend URL
  (`VITE_REBOOT_URL` — the default detection resolves to Vite's
  origin, not the backend's), sign-in/sign-out, and how a typed
  backend error becomes a message the user sees.

and at the tests step:

- [`testing-web-app.md`](references/testing-web-app.md) — the
  `frontend` fixture, the web app steps, and the accessible markup
  the page needs.

**MCP App UIs**, at the frontend step:

- [`react-mcp-scaffolding.md`](references/react-mcp-scaffolding.md) — the
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
  side's gotchas: camelCase names, the build's output path,
  `--react-extensions`, image URLs that carry no bearer.
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
> equivalents are `react-mcp-scaffolding.md` and `react-app-tsx.md`.

> **Never read the MCP App pages for a web app**
> (`react-mcp-scaffolding.md`, `react-app-tsx.md`, `gotchas-mcp-app.md`,
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

## Designing a web app

The design of a web app names, beside its application types and
method map:

- Route surface: which pages the SPA needs, and which methods
  each page calls.

And the State Model Assessment adds:

- **Pages / routes**: Which SPA routes exist? Which methods
  does each page call? React hooks generated by
  `rbt generate --react=...` wrap the calls.

## Building a web app

What a web app adds to the app skill's frontend steps.

**Scaffold:** `npm create vite@latest frontend -- --template react-ts`,
shaped as [`react-client.md`](references/react-client.md) shows: the
SPA's `index.html`, `src/`, and `public/` under `frontend/web/`, the
config rooted there with the `dedupe` and `server.host` entries, and
the Reboot packages in `package.json`. No `VITE_REBOOT_URL` in
development: the web app is served at the backend's origin
(`--web-app`); `.env.production` sets it for a deploy elsewhere.

```
frontend/
└── web/                 # The single-page app
    ├── .env.production  # VITE_REBOOT_URL=<the deployed backend>
    ├── index.html       # The single SPA entry
    ├── public/
    └── src/
        ├── main.tsx     # RebootClientProvider entry
        ├── App.tsx      # Routes + top-level component
        ├── vite-env.d.ts
        └── pages/
            └── <page>.tsx
```

**Build:** from [`react-client.md`](references/react-client.md): the
provider and its `url`, the generated hook/mutator/error
declarations, sign-in, and typed errors are all written out there.

**Scenarios:** every action in the UI ("sign up and see my profile",
"submit the form and see the result", "delete an item and have it
disappear") is a scenario, and the flows a person clicks through are
web app scenarios, in `tests/web_test.py`, per
[`testing-web-app.md`](references/testing-web-app.md): the `frontend`
fixture, the web app steps, and the accessible markup the page needs.
They need `playwright`, `pytest-playwright`,
`uv run playwright install chromium`, and the page's accessible
markup. Point the user at the recordings of the browser scenarios.

**Updates:** read `frontend/web/src/App.tsx` with the rest of the
app; update the routes with the components, keeping the markup
accessible (labels paired with inputs, buttons that say what they
do) so scenarios can drive the new page; add a web app scenario for
a flow a person clicks through.

## Building MCP App UIs

What an MCP App adds to the app skill's frontend steps.

**Scaffold:** `npm create @reboot-dev/ui`.

```
frontend/
└── mcp/                 # One folder per UI
    └── <ui-name>/
        ├── index.html
        ├── index.css        # Theme variables
        ├── main.tsx         # RebootClientProvider entry
        ├── App.tsx          # React component
        └── App.module.css
```

**Build:** [`react-mcp-scaffolding.md`](references/react-mcp-scaffolding.md)
for the `frontend/` shell and
[`react-app-tsx.md`](references/react-app-tsx.md) for `App.tsx`
patterns.

## Building both

The web app's tree and config, plus `frontend/mcp/<name>/` beside
`web/` and `mcpAppPath: "mcp"` in `reboot()`; the same dev server and
`npm run build` serve and build both. Read the pages of both
sections above.

## Web app: feeding the user's identity into hooks

[`frontend/references/react-client.md`](references/react-client.md)
covers the provider (and the `url` it must be given), the generated
hooks, sign-in and sign-out, and reading typed errors. Read it at the
frontend step; don't reconstruct it from memory here. Two of its
rules apply to every page:

- With `Application(oauth=...)`, the signed-in user's own state needs
  no id: call the `User` hook with **no arguments** and it finds the
  signed-in user.
- For hooks that take an id, the id must be real on every render,
  never a placeholder.

## Never read generated code

`frontend/api/**/*_rbt_react.ts` and `node_modules/` run to tens of
thousands of lines, and anything you open is sent again on every
later turn. What you need from the generated client is written out in
[`react-generated-client.md`](references/react-generated-client.md).
If something is genuinely missing, bound the output: a
`grep -n … | head -40`, never the whole file.
