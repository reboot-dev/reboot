## The backend serves a built web app at `/` with `--web-app-dist-path`

`rbt dev run` and `rbt serve run` take a new `--web-app-dist-path=<dir>`
naming the built web app (e.g. `frontend/dist/web`). The backend then
serves it at `/`, and its `index.html` answers any path the
application has no route or file for, so the app's own URL routing
works on reload. Without the flag `/` is Reboot's own page, as before.
The web build is expected at `base: "/"`.

For an app with a `frontend/web/` SPA:

1. In `frontend/vite.config.ts`, in the `RBT_BUILD_TARGET=web` build
   config (the one with `root: path.resolve(__dirname, "web")`),
   change `base: "/__/frontend/web/"` to `base: "/"`. An app whose
   web build already uses `base: "/"` (a web-only app on the stock
   Vite config) needs no change here.
2. In `.rbtrc`, where a `dev run:dist` or `serve run` config has
   `--mcp-app-dist-path=frontend/dist/mcp`, add the web app beside it:

   ```
   dev run:dist --web-app-dist-path=frontend/dist/web
   serve run --web-app-dist-path=frontend/dist/web
   ```

   An app whose web app is published to a static host instead keeps
   `rbt serve run` without the flag.

3. The built web app is no longer served under `/__/frontend/web/`.
   Change any link that pointed there, such as an MCP App's pop-out
   button (`<web app URL>/__/frontend/web/?...`), to the web app's
   root (`<web app URL>/?...`). A `_redirects` rule mapping
   `/__/frontend/web/*` on a static host is no longer needed.

`--web-app-dist-path` is for Python applications; `rbt` refuses it with
`--nodejs`, whose own web framework serves `/`.
