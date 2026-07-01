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

Adopt the new `frontend/vite.config.ts`: it auto-discovers your MCP UIs
under `mcp/` and builds each into the single-file
`dist/mcp/<name>/index.html` the framework serves under `/__/frontend/`.
Rather than reproduce it here, copy it from the chat-app skill's
`references/react-scaffolding.md`, where it's written out in full, with
commentary.
