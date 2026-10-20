## Named local URLs via portless, by default

A Reboot application now runs under
[portless](https://github.com/vercel-labs/portless) by default:
`rbt dev run` serves the app as `https://<app>.localhost`, the Vite
dev server runs at `https://frontend-<app>.localhost`, which Envoy serves
the web app and the MCP Apps from, and `rbt dashboard` serves
as `https://dashboard-<app>.localhost`, each on a free port the proxy
routes to, so several applications run at once. The web app is on the
backend's own origin, so no `VITE_REBOOT_URL` is needed in
development. `<app>` is the `.rbtrc`'s
`dev run --application-name`; if the `.rbtrc` has none, add one.

portless needs a one-time setup per machine: `npm install -g portless`
(the plugin's `portless` shim covers your own commands, but `rbt`
needs the CLI on the developer's PATH), then `portless proxy start`,
which binds port 443 by re-running itself under `sudo`, and
`portless trust`. Where `sudo` asks for no password (a Codespace,
most dev containers) those succeed from your shell, so run them;
`portless doctor` says whether the proxy is up and the CA trusted.
Where `sudo` wants a password they fail, and the setup is the
developer's to do, interactively: tell them, and let them say when
it is done (or that they would rather stay on plain ports, in which
case make the changes below anyway and leave them running with
`--config=ports` for both `rbt dev run` and `rbt dashboard`).

1. **`.rbtrc`:** make portless the default config and add the
   `:portless` config beside the existing `:ports` one. Where the
   `.rbtrc` has

   ```
   dev run --default-config=ports

   dev run:ports --frontend-url=http://localhost:5173
   dev run:ports --mcp-app
   dev run:ports --web-app
   ```

   change the default and add the named-URL config, keeping every
   `:ports` line as it is: `--frontend-url` names the dev server by
   its portless name, and the `--mcp-app` and `--web-app` lines the
   `:ports` config has are repeated:

   ```
   dev run --default-config=portless

   dev run:portless --portless
   dev run:portless --frontend-url=https://frontend-<app>.localhost
   dev run:portless --mcp-app
   dev run:portless --web-app

   dashboard --default-config=portless
   dashboard:portless --portless
   dashboard:ports --no-portless
   ```

   A `.rbtrc` with no `--default-config` (a web-only app that passed
   `--frontend-url=http://localhost:5173` and `--web-app`
   unconditionally) gets the same block, with its unconditional
   `--frontend-url`, `--mcp-app` and `--web-app` lines moved under
   `dev run:ports`.

2. **`frontend/package.json`:** mirror those configs as scripts, and
   add `portless` as a dev dependency so `npm install` brings it:

   ```json
   "scripts": {
     "dev": "npm run dev:portless",
     "dev:portless": "portless frontend-<app> vite",
     "dev:ports": "vite"
   },
   "devDependencies": {
     "portless": "^0.15.7"
   }
   ```

   `<app>` is the same name as in `.rbtrc`. A `"dev": "vite"` script
   becomes the three above; a `"start": "vite"` script likewise. Then
   `npm install` in `frontend/`.

3. **`frontend/web/.env.development`:** delete its `VITE_REBOOT_URL`
   line: with `--web-app` the web app is on the backend's own origin
   in either config, whatever the port, and the client uses the
   page's origin. `VITE_REBOOT_URL` is for a deploy on another origin
   (`.env.production`).

4. **The dashboard:** if a `rbt dashboard` is running for this
   application (started before this upgrade, on
   `http://127.0.0.1:9871/`), stop it and start it again with
   `uv run rbt dashboard`, which now reads `--portless` from its
   `.rbtrc` configs and serves as `https://dashboard-<app>.localhost/`;
   the `dashboard` skill says how.

5. **READMEs and scripts** that tell a developer to run
   `portless <app> npm run dev`, or to visit `http://localhost:9991`
   or `http://127.0.0.1:9871/`, say `npm run dev`,
   `https://<app>.localhost` and `https://dashboard-<app>.localhost/`
   instead, with the plain-port form as the `--config=ports` alternative.
