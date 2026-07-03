## Reorganize the frontend into `frontend/{mcp,web,api}`

An app's frontend used to be split across `web/ui/` for MCP UIs, `web/`
for everything else, and `web/api/` for generated bindings. The canonical
layout is now a single `frontend/` tree: `mcp/` for the MCP UIs, `web/`
for a browser SPA, and `api/` for generated bindings.

Move your frontend to match:

- `web/ui/` -> `frontend/mcp/`
- `web/api/` -> `frontend/api/`
- the rest of `web/` -> `frontend/web/`

Then update everything that named the old paths: `.rbtrc`
(`--react=frontend/api`, `--frontend-root-path=frontend`,
`--frontend-dist-path=frontend/dist`, watch globs), the Dockerfile, and
any `UI(path=...)` values or imports.

Move your `vite-env.d.ts` — the `/// <reference types="vite/client" />`
shim that types `*.module.css` imports and `import.meta.env` — to the
`frontend/` root (a sibling of `mcp/`, `web/`, and `api/`), not under
`frontend/web/src/`, and list it in each `tsconfig.app.json`'s
`include` alongside your UI directories
(`["mcp", "web", "vite-env.d.ts"]`). Otherwise the shim falls off the
type-check path and MCP UIs fail `tsc` with `TS2307: Cannot find module './App.module.css'`.

Adopt the new `frontend/vite.config.ts`: it auto-discovers your MCP UIs
under `mcp/` and builds each into the single-file
`dist/mcp/<name>/index.html` the framework serves under `/__/frontend/`.
It reads which UI to build from the `RBT_BUILD_TARGET` environment
variable (the build scripts set it for you) instead of overloading
Vite's `--mode`, which stays free for its usual `.env.<mode>`
selection — drop any `vite build --mode <name>` invocations you carry.
Rather than reproduce it here, copy it from the chat-app skill's
`references/react-scaffolding.md`, where it's written out in full, with
commentary.

Add `frontend/build.mjs` too (also from
`references/react-scaffolding.md`): it discovers and builds every UI in
one shot, so `npm run build` keeps working as UIs come and go. Set
`frontend/package.json`'s build script to
`"build": "tsc -b && node build.mjs"`, dropping any per-UI
`build:<name>` scripts and the `concurrently` devDependency.
