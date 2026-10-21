## Web app scenarios serve the app through the backend, on Vite 8

`reboot.bdd.vite.vite(...)` now starts the dev server with Vite's
`--port 0`, a free port of the OS's choosing, instead of reserving
one itself, which collided with other dev servers on macOS. That
needs Vite 8 or later in the frontend. The backend's Envoy then
routes to the dev server, the way `rbt dev run --web-app` does, so
the browser opens the web app at the backend's own origin and the
app finds the backend there; the app's origin is no longer the dev
server's, and `Frontend.origin` is gone.

1. If `frontend/package.json` (the directory the `frontend` fixture
   names) pins `"vite"` below `^8`, upgrade it along with its React
   plugin, whose 6.x is the one for Vite 8:

   ```sh
   cd frontend && npm install -D vite@^8.3.4 @vitejs/plugin-react@^6.1.2 vite-plugin-singlefile@^2.3.4
   ```

   A `@tailwindcss/vite` below `^4.3.0` needs the same
   (`npm install -D @tailwindcss/vite@^4.3.0`), as does a `vitest`
   below `^4` (`npm install -D vitest@^4.1.12`; its `basic` reporter
   is gone, and the `BetterErrorTracingReporter` of
   `@reboot-dev/reboot-std/vitest` builds on `default` now).

2. If a test module's `application` fixture takes the `frontend`
   fixture to list its origin, drop that: in a file under `tests/`
   matching `def application(frontend: Frontend)`, remove the
   parameter, the `assert frontend.origin is not None`, and replace
   `allowed_origins=[frontend.origin]` with `allowed_origins=[]`,
   since the web app is served at the backend's own origin and no
   other origin may act on its session cookie.

3. A `Frontend` subclass of the project's own implements
   `serve(self)` with no `backend_url` (the app finds the backend at
   the page's origin), and `url` (the dev server's URL for Envoy to
   route to) instead of `origin`.
