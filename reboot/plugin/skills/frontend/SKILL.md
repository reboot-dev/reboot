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

Read a page at the step that needs it, and read it once: everything
you read is sent again on every later turn.

| Page | Read it when |
| --- | --- |
| [`react-generated-client.md`](references/react-generated-client.md) | Writing any React code: what the generated client exports, the `use<Type>()` hooks, why mutations return `{ response, aborted }` instead of throwing, the typed errors, and how names change from Python to TypeScript |
| [`react-client.md`](references/react-client.md) | Building a web app: the `frontend/` folder's Vite setup, rooted at `web/`, the backend URL, the provider, sign-in and sign-out, showing a typed error |
| [`react-mcp-scaffolding.md`](references/react-mcp-scaffolding.md) | Building MCP App UIs: `package.json`, `build.mjs`, `vite.config.ts`, the tsconfigs, the theme, each UI's `index.html` and `main.tsx` |
| [`react-app-tsx.md`](references/react-app-tsx.md) | Writing an MCP App UI's `App.tsx`, including a composing reader that pages through many state types |
| [`pop-out-to-web-app.md`](references/pop-out-to-web-app.md) | Only when an MCP App UI needs a button that opens the same thing in the web app |
| [`gotchas-mcp-app.md`](references/gotchas-mcp-app.md) | Building MCP App UIs: camelCase names, the build's output path, `--react-extensions`, image URLs that carry no bearer |
| [`testing-web-app.md`](references/testing-web-app.md) | Writing scenarios that open the web app in a browser: the `frontend` fixture, the web app steps, the accessible markup the page needs |

An app with both a web app and MCP App UIs reads the rows for both.
An app with only one reads only the rows for that one: the web app
pages produce web app code, and the MCP App pages produce
`UI()`-shaped code.

## Web app: hooks and the browser-side wiring

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
