## Frontend serving: CLI flags and the `/__/frontend/` URL prefix

This is the one migration note for the frontend-serving CLI changes; it
grows over the frontend-serving commits.

### `--mcp-frontend-host` renamed to `--frontend-host`

The `rbt dev run` / `rbt serve run` frontend dev-proxy is no longer
MCP-specific — it fronts web apps too — so its flag `--mcp-frontend-host`
is now just `--frontend-host`, and the `RBT_MCP_FRONTEND_HOST` env var is
now `RBT_FRONTEND_HOST`.

In your `.rbtrc`, rename every `--mcp-frontend-host` to `--frontend-host`.
