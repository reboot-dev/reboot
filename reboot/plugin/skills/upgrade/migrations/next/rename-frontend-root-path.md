## `--frontend-root-path` renamed to `--mcp-ui-path-prefix`

The `rbt dev run` / `rbt serve run` flag `--frontend-root-path` is now
`--mcp-ui-path-prefix`, and the `RBT_FRONTEND_ROOT_PATH` env var is
now `RBT_MCP_UI_PATH_PREFIX`. The value is unchanged: the prefix of
each MCP `UI(path=...)` that names the frontend directory (e.g.
`frontend` for `UI(path="frontend/mcp/counter")`), which is stripped
to find the UI under `/__/frontend/` and under `--frontend-dist-path`.
The old flag still works but prints a warning.

In `.rbtrc`, rename every `--frontend-root-path` to
`--mcp-ui-path-prefix`:

```
dev run --mcp-ui-path-prefix=frontend
serve run --mcp-ui-path-prefix=frontend --frontend-dist-path=frontend/dist
```

If a `Dockerfile`, shell script, or CI config sets
`RBT_FRONTEND_ROOT_PATH`, rename it to `RBT_MCP_UI_PATH_PREFIX`.
