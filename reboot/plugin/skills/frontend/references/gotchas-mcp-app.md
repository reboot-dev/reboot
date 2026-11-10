---
title: MCP App–Specific Gotchas: the React Side
impact: CRITICAL
impactDescription: The gotchas for an MCP App's React UIs and their build. Each entry is a real failure that can happen in the generated client, the Vite build or the host's sandbox.
tags: gotchas, traps, errors, mcp, react, vite, snake-camel, codegen, bearer
---

## MCP App–Specific Gotchas: the React Side

These are the MCP App gotchas about the React UIs, the generated
client and the frontend build. The backend's list, about the API
file, servicers and workflows, is
`python/references/patterns-mcp-app-gotchas.md`.

1. **React bindings use camelCase.** Python `from_index` becomes
   TypeScript `fromIndex`; same for every snake_case field name.

2. **Generated React hook:** `use<TypeName>()` — e.g. `useCounter()`,
   `useInventory()`.

3. **Generated React import path:**
   `@api/<pkg>/v1/<name>_rbt_react`.

4. **Frontend request/response types are Zod** — generated from
   the Python Models.

5. **`frontend/dist/mcp/<name>/index.html` is the right location** for
   the built MCP App — `<--mcp-app-dist-path>/<path>/index.html`,
   with `--mcp-app-dist-path=frontend/dist/mcp` in `.rbtrc`. Reboot's
   Vite plugin (`reboot()` from `@reboot-dev/reboot-react/vite`)
   produces it correctly out of the box: the
   `RBT_BUILD_TARGET=mcp:<name>` build roots itself at `mcp/<name>/`,
   so its `index.html` lands at the nested path while
   `viteSingleFile` inlines the JS/CSS. If you see
   `The '<ui>' MCP App's build '.../index.html' is missing`, run
   `cd frontend && npm run build` — do **not** rewrite the Vite config
   to emit a flat `dist/<name>.html`; that breaks the lookup.

6. **Don't add `generate --react-extensions` to `.rbtrc`.** This is
   a Python-backend app that generates the React client on its own
   into `frontend/api/`. Vite — plus `tsc` under the
   `moduleResolution: "bundler"` the scaffolded tsconfigs use —
   resolves the generated client's relative imports without explicit
   `.js` extensions, so the flag buys nothing here. The two cases
   where a project _does_ need it both require something this skill
   never produces: a webpack/`ts-loader` bundler (this skill uses
   Vite), or a `--nodejs`/`--web` target sharing the React output
   directory and forcing matching extensions (a Python backend has
   no Node.js client). Adding the flag anyway also breaks a future
   `--mobile` (React Native) client — `rbt generate` rejects
   `--react-extensions` with `--mobile`, because Metro can't resolve
   the `.js`-suffixed imports back to their `.ts` sources.

7. **An `<img src>` or `<a href>` pointing at the backend carries
   no bearer.** The UI runs in the host's sandbox, cross-origin to
   the backend, so a plain `src` or `href` arrives with no
   credential and a `require_oauth_token=True` route returns 401.
   Obtain a short-lived signed URL with the client's bearer and give
   that to `src` instead; never put the token in the URL. See the instructions in
   `python/references/auth-http-routes.md`.
