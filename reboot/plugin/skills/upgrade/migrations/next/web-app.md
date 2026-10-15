## `rbt dev run --web-app` serves the web app from the dev server at `/`

`rbt dev run` takes a new bare switch, `--web-app`, beside
`--frontend-url`: Envoy sends `/`, and every path the application
doesn't answer itself, to the frontend's dev server, which serves the
web app there. The web app is then on the backend's origin in
development, with hot module replacement, the way `--web-app-dist-path`
puts its build there in production. `--frontend-url` now needs
`--mcp-app`, `--web-app`, or both, to say what to serve from the dev
server; alone it is still an error. `--web-app` and
`--web-app-dist-path` are mutually exclusive, and an application that
mounts `/` itself is refused with either.

Reboot's Vite plugin now serves the web app's `index.html` at the dev
server's `/` (and at any path a browser navigates to outside
`/__/frontend/`) instead of redirecting `/` to `/__/frontend/web/`;
`/__/frontend/web/` still works.

For an app with a `frontend/web/` SPA:

1. In `.rbtrc`, add `dev run:ports --web-app` beside
   `dev run:ports --mcp-app` (or in place of it, for an app with no
   `UI(...)` methods).
2. Open the app at the backend's URL, `http://localhost:9991/`, rather
   than the dev server's. A link or bookmark to
   `http://localhost:5173/__/frontend/web/` still works.
