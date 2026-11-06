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

**A web app**, at the design and again at the frontend step:

- [`visual-interactive.md`](references/visual-interactive.md) — every
  web feature is seen and handled: the design tokens, the app shell,
  each feature's view and gesture, the gesture steps for the
  scenarios, and the proof.

At the frontend step:

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

## Designing a web app

The design of a web app names, beside its application types and
method map:

- Route surface: which pages the SPA needs, and which methods
  each page calls: the page map, below.
- Each feature's **view and gesture**: a board to drag tiles across,
  a timeline to drag bars along, as
  [`visual-interactive.md`](references/visual-interactive.md) has
  them.

And the State Model Assessment adds:

- **Pages / routes**: Which SPA routes exist? Which methods
  does each page call? React hooks generated by
  `rbt generate --react=...` wrap the calls.

### The page map

Pages are the app's, not a feature's: a person moves between them,
and the pages that join features are the ones that make it a product.
The design lists every route, and for each the feature that first
builds it:

- **The app shell** around every page ([`visual-interactive.md`](references/visual-interactive.md), "The
  app shell"): the masthead with the brand, the navigation of the
  top-level pages below, and the app's **working context** (a business date, a store, a team's week) that every page reads.
- **A home page that answers the app's one question** for the person
  who opens it first (a team lead: "what needs attention today?"): a few figures that matter large (open, due today, overdue, done this week), the one breakdown behind them (open by project),
  and what needs doing now, each item linking to where it is done.
  The design states the question in one line. The first feature
  builds the page with its part; each later feature adds its part.
- **For each kind of thing a person finds again** (a task, a project, a person): **a list** that searches and filters, and **a detail page**
  at its own URL (`/projects/:id`) that shows everything about it,
  including what other features attach (a project's tasks, a task's comments), with its actions. The feature that introduces the thing
  builds both; later features add their sections to its detail page.
- **Each creation as a flow**: a form or a short sequence with
  validation, at its own URL (`/tasks/new`) or a dialog,
  reachable from the list and from the home page.
- **Links wherever a thing is named**: a person's name on a task opens the person; a project's name opens the project.

A feature's view (a board, a timeline) is one of these pages or a
section of one, not the whole of what the feature builds.

## Building a web app

What a web app adds to the app skill's frontend steps.

**Scaffold:** `npm create vite@latest frontend -- --template react-ts`,
shaped as [`react-client.md`](references/react-client.md) shows: the
SPA's `index.html`, `src/`, and `public/` under `frontend/web/`, the
config rooted there with the `dedupe` and `server.host` entries, and
the Reboot packages in `package.json`. No `VITE_REBOOT_URL` in
development: the web app is served at the backend's origin
(`--web-app`); `.env.production` sets it for a deploy elsewhere.
Then, before any page, the design tokens (`frontend/web/src/tokens.css`)
and the app shell, as
[`visual-interactive.md`](references/visual-interactive.md) has them.

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
Each feature's page is its view and gesture, from
[`visual-interactive.md`](references/visual-interactive.md), on the
tokens and inside the shell.

The app's root gates on `useUser()` before it renders the shell:
`isLoading` shows the shell's calm line, `user === undefined` the
sign-in screen, and only then the signed-in shell. Without the gate a
signed-in browser flashes the sign-in screen first, and a browser
scenario's first click races it.

Build each page with accessible
markup from the start: labels paired with inputs, buttons that say
what they do, tables with a labelled heading; that is what a
scenario drives. **Each item is reachable on its own**: a list's row
or card carries the item's name as its accessible name
(`<tr aria-label="Task 14">`), so a scenario says `sees "Blocked" in the "Task 14" row` rather than matching a word that appears on the
page fifty times, or elsewhere ("Done" in "Nothing done yet").
**A select's options are labelled for a person** ("Task 14", a person's name), since the select step picks an option by its visible
text, never by its value or an id; and no step waits for an option to
be seen, since an option inside a closed `<select>` is never visible
(the select step waits for it itself). **The step names the whole
label as the page builds it, from the real data**: "Task 14, Design" is read from the code that creates the tasks (which project each is in), never guessed from what looks right. When a select
step cannot find its option, read the option's text in the live page
first (the page's own `<option>`s); change the label or the page only
once that shows the label is what is wrong.

**Scenarios:** every action in the UI ("sign up and see my profile",
"submit the form and see the result", "delete an item and have it
disappear") is a scenario, and the flows a person clicks through are
web app scenarios, in `tests/web_test.py`, per
[`testing-web-app.md`](references/testing-web-app.md): the `frontend`
fixture, the web app steps, and the accessible markup the page needs.
They need `playwright`, `pytest-playwright`,
`uv run playwright install chromium`, and the page's accessible
markup. The gesture steps go in `tests/conftest.py` before the first
browser scenario, and each feature's browser scenario performs its
gesture ([`visual-interactive.md`](references/visual-interactive.md),
"The proof"). A scenario that still fails after two fixes aimed at
it is `@blocked` with what was seen, and the build goes on: a drag a
browser driver will not deliver is the usual one, and a third guess
costs more than the feature. Never restyle the page to get a drop to
land. Point the user at the recordings of the browser scenarios.

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

**Build:** [`react-scaffolding.md`](references/react-scaffolding.md)
for the `frontend/` shell and
[`react-app-tsx.md`](references/react-app-tsx.md) for `App.tsx`
patterns.

## Building both

The web app's tree and config, plus `frontend/mcp/<name>/` beside
`web/` and `mcpAppPath: "mcp"` in `reboot()`; the same dev server and
`npm run build` serve and build both. Read the pages of both
sections above.

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
