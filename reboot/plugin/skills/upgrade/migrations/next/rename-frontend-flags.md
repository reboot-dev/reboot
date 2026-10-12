## The `--frontend-*` flags are now `--mcp-ui-*`

The `rbt dev run` / `rbt serve run` flags that configure how MCP UIs
are served were named as if they configured the whole frontend. They
only ever affected the MCP UIs: the web app, when there is one, is
served by its own dev server or host and is never proxied or served
through these flags. They are renamed to say so, and their environment
variables with them. The values are unchanged.

| Old flag               | New flag                | Old env var              | New env var               |
| ---------------------- | ----------------------- | ------------------------ | ------------------------- |
| `--frontend-root-path` | `--mcp-app-path-prefix` | `RBT_FRONTEND_ROOT_PATH` | `RBT_MCP_APP_PATH_PREFIX` |
| `--frontend-host`      | `--mcp-app-url`         | `RBT_FRONTEND_HOST`      | `RBT_MCP_APP_URL`         |
| `--frontend-dist-path` | `--mcp-app-dist-path`   | `RBT_FRONTEND_DIST_PATH` | `RBT_MCP_APP_DIST_PATH`   |

`--mcp-app-path-prefix` is the prefix of each MCP `UI(path=...)` that
names the frontend directory (e.g. `frontend` for
`UI(path="frontend/mcp/counter")`), stripped to find the UI under
`/__/frontend/` and under `--mcp-app-dist-path`. `--mcp-app-url` is the
dev server (e.g. Vite) Envoy proxies `/__/frontend/**` to.
`--mcp-app-dist-path` is the directory of built MCP UIs served under
`/__/frontend/`. The old flags still work but print a warning.

In `.rbtrc`, rename each old flag to its new name:

```
dev run --mcp-app-path-prefix=frontend
dev run:hmr --mcp-app-url=http://localhost:5173
dev run:dist --mcp-app-dist-path=frontend/dist
serve run --mcp-app-path-prefix=frontend --mcp-app-dist-path=frontend/dist
```

If a `Dockerfile`, shell script, or CI config sets any of the old
environment variables, rename it to the new one.

(`--frontend-host` was itself renamed from `--mcp-frontend-host` in
1.3.0, when Envoy's `/__/frontend/` proxy also carried the web app at
`/__/frontend/web/`. The web app no longer lives there, which is why
the name goes back to naming the MCP UIs.)
