---
name: frontend
description: The React side of a Reboot application. Covers the client `rbt generate --react=` writes (the `use<Type>()` hooks, mutations, typed errors), a standalone web app at `frontend/web/`, MCP App UIs at `frontend/mcp/<name>/`, the Vite setup both share, and browser scenarios that drive the web app with Playwright. The app skill reads it at the frontend step of a build; use it directly when changing the React code of an existing Reboot app.
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
you read is sent again on every later turn.

| Page | Read it when |
| --- | --- |
| [`react-generated-client.md`](references/react-generated-client.md) | Writing any React code: what the generated client exports, the `use<Type>()` hooks, why mutations return `{ response, aborted }` instead of throwing, the typed errors, and how names change from Python to TypeScript |
| [`react-client.md`](references/react-client.md) | Building a web app: the `frontend/` shell rooted at `web/`, the backend URL, the provider, sign-in and sign-out, showing a typed error |
| [`react-scaffolding.md`](references/react-scaffolding.md) | Building MCP App UIs: `package.json`, `build.mjs`, `vite.config.ts`, the tsconfigs, the theme, each UI's `index.html` and `main.tsx` |
| [`react-app-tsx.md`](references/react-app-tsx.md) | Writing an MCP App UI's `App.tsx`, including a composing reader that pages through many actors |
| [`pop-out-to-web-app.md`](references/pop-out-to-web-app.md) | Only when an MCP App UI needs a button that opens the same thing in the web app |
| [`testing-web-app.md`](references/testing-web-app.md) | Writing scenarios that open the web app in a browser: the `frontend` fixture, the web app steps, the accessible markup the page needs |

An app with both frontends reads both rows that apply to it. An app
with one reads only its own: the web app pages produce web app code,
and the MCP App pages produce `UI()`-shaped code.

## Never read generated code

`frontend/api/**/*_rbt_react.ts` and `node_modules/` run to tens of
thousands of lines, and anything you open is sent again on every
later turn. What you need from the generated client is written out in
[`react-generated-client.md`](references/react-generated-client.md).
If something is genuinely missing, bound the output: a
`grep -n … | head -40`, never the whole file.
