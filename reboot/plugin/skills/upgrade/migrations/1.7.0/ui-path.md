## `UI(path=...)` is a URL path, and `--frontend-root-path` is gone

`UI(path=...)` is now the UI's URL path under Reboot's fixed
`/__/frontend/mcp/`, such as `path="clicker"` (or, nested,
`path="shop/cart"`). It
was a directory relative to the project root
(`path="frontend/mcp/clicker"`), which `rbt` turned into a URL by
stripping `--frontend-root-path` off the front. Now the two sides
meet at the URL instead: in development the frontend's dev server
(`--frontend-url`) serves the UI at `/__/frontend/mcp/<path>/`, which
Reboot's Vite plugin maps onto `<mcpAppPath>/<path>/`; built, `rbt`
reads it from `<--mcp-app-dist-path>/<path>/index.html`. The method
name (`show_clicker`) stays the UI's identity; `path` only says where
it is served. `rbt` refuses a `path` that starts with `frontend/` or
`mcp/`, naming the fix.

With that, `--mcp-app-dist-path` names the directory of built MCP
Apps itself, `frontend/dist/mcp` (one subdirectory per `path`),
served at `/__/frontend/mcp/`; it was the directory above it,
`frontend/dist`, served at `/__/frontend/`. `--frontend-root-path`
(and `RBT_FRONTEND_ROOT_PATH`) is removed: nothing is stripped any
more. `UI(artifact_path=...)`, which overrode where one UI's build
was, is removed too; the build is always at
`<--mcp-app-dist-path>/<path>/index.html`.

To migrate:

1. In every `UI(...)`, replace the project-relative path with its
   last component: `path="frontend/mcp/clicker"` becomes
   `path="clicker"`. Drop any `artifact_path=`. The directory
   `frontend/mcp/clicker/` stays where it is.
2. In `.rbtrc`, delete every `--frontend-root-path=...` line and
   change `--mcp-app-dist-path=frontend/dist` to
   `--mcp-app-dist-path=frontend/dist/mcp` on the `dev run:dist` and
   `serve run` lines. A `Dockerfile`, shell script, or CI config that
   sets `RBT_FRONTEND_ROOT_PATH` drops it, and one that sets
   `RBT_MCP_APP_DIST_PATH` points it at `frontend/dist/mcp`.
3. Run `rbt generate`: the generated code no longer carries
   `artifact_path`.
