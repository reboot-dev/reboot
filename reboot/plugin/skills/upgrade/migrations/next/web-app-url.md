## `--web-app-url` serves a web app at `/` from its dev server

`rbt dev run` takes `--web-app-url=<url>`, the URL of the Vite dev server
serving the web app. The backend then serves the web app at `/` by
proxying to the dev server, with Hot Module Replacement, so the app
has the same URL as the API in development as it does in production
(`--web-app-dist-path`): one origin, no `VITE_REBOOT_URL`, and sign-in
stays first-party. It is mutually exclusive with `--web-app-dist-path`.

For an app with a `frontend/web/` SPA on the `mcp-ui` skill's
`vite.config.ts` (one dev server for the MCP UIs and the SPA):

1. Replace the `serveWebAppAtRoot` plugin in `frontend/vite.config.ts`
   with the current one from the `mcp-ui` skill's
   `references/react-scaffolding.md`. The old one redirected `/` to
   `/__/frontend/web/`; the new one serves the SPA at `/` (and at any
   path a browser navigates to), which is what the backend proxies.
2. In `.rbtrc`, beside `dev run:hmr --mcp-app-url=http://localhost:5173`,
   add `dev run:hmr --web-app-url=http://localhost:5173`.
3. Change any link to the dev server, such as in a README or a
   `VITE_WEB_APP_URL`-based pop-out, to the backend's own URL
   (`http://localhost:9991/`): that is where the web app is now. The
   dev server's own URL still works, cross-origin, as before.

`--web-app-url` is for Python applications; `rbt` refuses it with
`--nodejs`, whose own web framework serves `/`.
