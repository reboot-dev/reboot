## `--frontend-url`, `--mcp-app-dist-path`, and `--mcp-app`

Two `rbt` flags are renamed for what they take and serve, and one is
new:

| Old flag               | New flag              | Old env var              | New env var             |
| ---------------------- | --------------------- | ------------------------ | ----------------------- |
| `--frontend-host`      | `--frontend-url`      | `RBT_FRONTEND_HOST`      | `RBT_FRONTEND_URL`      |
| `--frontend-dist-path` | `--mcp-app-dist-path` | `RBT_FRONTEND_DIST_PATH` | `RBT_MCP_APP_DIST_PATH` |

`--frontend-url` takes a URL (the frontend's dev server, e.g. Vite at
`http://localhost:5173`), so its suffix is `url`; `--mcp-app-dist-path`
is the directory of built MCP Apps, which is all it ever served. The
old flags still work but print a warning.

`--frontend-url` now only says where the frontend is. What to serve
from it is said separately: `dev run --mcp-app` serves the
application's MCP Apps (its `UI(...)` methods) from that dev server,
and `--frontend-url` without it is an error. An application with
`UI(...)` methods must be given `--mcp-app` (with `--frontend-url`) or
`--mcp-app-dist-path`; one without refuses both.

In `.rbtrc`, rename the flags and add `--mcp-app` beside
`--frontend-url`:

```
dev run:ports --frontend-url=http://localhost:5173
dev run:ports --mcp-app

dev run:dist --mcp-app-dist-path=frontend/dist/mcp

serve run --mcp-app-dist-path=frontend/dist/mcp
```

(`frontend/dist/mcp`, not `frontend/dist`: see the `UI(path=...)`
migration below, which the same release makes.)

If a `Dockerfile`, shell script, or CI config sets any of the old
environment variables, rename it to the new one.
