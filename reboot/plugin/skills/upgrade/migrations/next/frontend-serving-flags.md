## Frontend serving: CLI flags and the `/__/frontend/` URL prefix

This is the one migration note for the frontend-serving CLI changes; it
grows over the frontend-serving commits.

### `--mcp-frontend-host` renamed to `--frontend-host`

The `rbt dev run` / `rbt serve run` frontend dev-proxy is no longer
MCP-specific — it fronts web apps too — so its flag `--mcp-frontend-host`
is now just `--frontend-host`, and the `RBT_MCP_FRONTEND_HOST` env var is
now `RBT_FRONTEND_HOST`.

In your `.rbtrc`, rename every `--mcp-frontend-host` to `--frontend-host`.

### URL prefix is now `/__/frontend/`, and the frontend root is named explicitly

Reboot now serves every frontend — MCP UIs and web apps alike — under a
single fixed URL prefix `/__/frontend/` (it was `/__/web/`), and it no
longer discovers the frontend root by walking for a `vite.config.ts`; you
name it explicitly with `--frontend-root-path`.

In each `vite.config.ts`, change the dev-server `base` from
`base: "/__/web/"` to `base: "/__/frontend/"`. In `.rbtrc`, name the
frontend root once on the base `dev run` line (both the `:hmr` and
`:dist` configs inherit it, so it isn't repeated), and give the dist
configs `--frontend-dist-path`. For a frontend rooted at `web/`:

```
dev run --frontend-root-path=web
dev run:hmr --frontend-host=http://localhost:4444
dev run:dist --frontend-dist-path=web/dist
serve run --frontend-root-path=web --frontend-dist-path=web/dist
```
