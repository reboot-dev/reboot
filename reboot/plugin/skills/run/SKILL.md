---
name: run
description: Run an existing Reboot application locally. Detects whether the project is an MCP App or a standalone Web App, makes sure dependencies and secrets are in place, then starts every process the app needs — for an MCP App a Cloudflare quick tunnel (so external MCP clients can reach the dev server) via the bundled `cloudflared` shim, the backend (`rbt dev run`), and the frontend dev server (for MCP Apps it also opens the setup wizard, from which the user can launch MCPJam on demand). Use this to bring an app back up, e.g. at the start of a new session.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# run — Run a Reboot Application

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Bring an existing Reboot application up locally. This skill is the
single canonical "start the app" procedure: it figures out what
kind of app the project is, makes sure dependencies and secrets are
ready, and launches every process the app needs.

Use it whenever the user wants to run, start, restart, or "bring
up" an existing Reboot app — most commonly at the start of a fresh
session, where no processes and no exported environment survive
from last time.

> This skill **runs** an app; it does not build or modify one. To
> build, see the [`mcp-app` skill](../mcp-app/SKILL.md) and the
> [web-app skill](../web-app/SKILL.md) — those skills defer here for
> their "run the app" step.

## Step 1 — Locate the project

Work in the directory the user named, or the current directory. The project root is the directory that contains
`.rbtrc`. If there is no `.rbtrc` anywhere obvious, ask the user
where the app is. Every command below runs from the project root.

If the project has no `AGENTS.md`, or its `CLAUDE.md` is not just
`@AGENTS.md`, give it both with the
[`agents-md` skill](../agents-md/SKILL.md) before starting anything,
so the next session in this project starts with its map.

## Step 2 — Detect the app type

A Reboot project is one of two kinds. Decide using these signals,
strongest first.

**MCP App** — any of:

- An API file under `api/` uses `mcp=Tool(` or `UI(` (the `UI()`
  method type). `mcp=None` says nothing: every method of every app
  requires the `mcp=` argument, so a Web App has `mcp=None` on all
  of them.
- There is a `frontend/mcp/<name>/index.html`.
- `.rbtrc` has a `dev run:portless --frontend-url=...` line (or a
  `dev run:ports --frontend-url=...` one, for an app kept on plain
  ports) with `--mcp-app`: Envoy proxying the MCP Apps from the dev
  server.

**Web App** — all of:

- No `mcp=Tool(` / `UI(` anywhere under `api/`.
- The SPA entry `frontend/web/index.html`, and no `frontend/mcp/`.

If the signals genuinely conflict, or none match, ask the user
("Is this an MCP App or a standalone Web App?"). Do not guess —
the app type changes whether the setup wizard is opened.

## Step 3 — Dependencies

From the project root:

- Backend: if `.venv/` is missing, run `uv sync`. If `rbt dev run`
  later warns that `reboot[dev]` is not installed, add
  `reboot[dev]` at the same pin as `reboot` to the dev group of
  `pyproject.toml` (template in
  `../python/references/lifecycle-project-setup.md`) and `uv sync`
  again; the extra is what the tests and the dashboard's Features
  page run on.
- Frontend: if `frontend/node_modules/` is missing, run
  `npm install` in `frontend/`.

## Step 4 — Secrets: the git-ignored env file

Reboot apps read secrets from `os.environ`. `rbt dev run` loads
them from an env file via its `--env-file` flag, configured once
in `.rbtrc`. Set this up **before** starting the backend:

1. **Find the required variables.** Grep the backend for
   `os.environ[...]`, `os.environ.get(...)`, and `os.getenv(...)`,
   and check `main.py` for `Application(oauth=...)` provider
   credentials. Every name found is a variable the app needs.
2. **Make sure `.rbtrc` references the env file.** It must contain
   the line `dev run --env-file=.env`. If it does not, add it.
3. **Make sure `.env` is git-ignored.** `.env` holds secrets and
   must never be committed. Check `.gitignore` at the project root
   for a line that ignores `.env`; if there is none, add `.env` to
   `.gitignore` (creating the file if it does not exist). Do this
   **before** writing any secret into `.env`.
4. **Fill `.env`.** Write standard `.env` `KEY=VALUE` lines — e.g.
   `ANTHROPIC_API_KEY=sk-ant-...`. For every required variable not
   already a line in `.env` (and not already exported in the
   environment), ask the user for the value and write it in.
   Never start the backend with a required
   variable missing — the app fails at boot or on first use, and
   the failure is hard to read.

The full secrets story — dev vs. Reboot Cloud — is in
`python/references/lifecycle-secrets.md`.

## Step 5 — Start the processes

Run each process in its own background shell, from the project
root.

### Named URLs with portless — ask the user first

Reboot recommends running the app under
[portless](https://github.com/vercel-labs/portless), which gives
each local server a name instead of a port: the app is
`https://<app>.localhost`, where `<app>` is the `.rbtrc`'s
`--application-name`, serving the API, the web app at `/` and the
MCP Apps, the latter two proxied from the frontend dev server, which
runs as `https://frontend-<app>.localhost`. One origin, so no
`VITE_REBOOT_URL` is needed and one tunnel carries everything; the
backend trusts exactly that dev server origin too. An app scaffolded
by these skills defaults to it: its `.rbtrc` has
`dev run --default-config=portless`.

**Ask the user whether they want portless before starting anything**
(recommend it). If they decline, start the processes on plain ports
as the sections below describe, passing `--config=ports` to
`rbt dev run` when the `.rbtrc` defaults to portless, and reading
`http://localhost:9991` wherever this skill says
`https://<app>.localhost`.

If they accept, before the backend and frontend:

1. **Check the CLI and the proxy:** `portless doctor`. The plugin's
   `portless` shim installs the pinned CLI on first use, so a
   missing CLI needs nothing from the user; read the output for the
   proxy's liveness and whether the local CA is trusted.
2. **Start the proxy if it is not running:** `portless proxy start`,
   from your own shell. Binding port 443 needs root, which portless
   takes itself by re-running under `sudo`; where `sudo` asks for no
   password (a Codespace, most dev containers) that succeeds without
   a terminal, and `portless trust` likewise, so run them yourself
   when `doctor` said the proxy is down or the CA is not trusted.
   Where `sudo` wants a password, portless cannot ask for one from
   your shell and fails saying so; then stop and ask the user to run
   `portless proxy start` (and `portless trust`) in their own
   terminal, and continue once they say it is up. Do not elevate any
   other way; `sudo` without a password is the one case you may use.
3. Start the frontend with its `dev:portless` script and the
   backend with its portless config, as the sections below say.

### Tunnel — MCP Apps only

An MCP App's backend needs a Cloudflare quick tunnel so external MCP
clients (e.g. ChatGPT) can reach it. Skip the tunnel for a **Web
App**: it has no MCP clients, and a tunnel would publish a dev server
where the `Development()` picker lets anyone sign in as anyone.

One tunnel per app, for the whole session: a quick tunnel's
`*.trycloudflare.com` URL is new every time one starts, and the
user's MCP client holds the old one. So first look for one that is
already up, from earlier in this session or from another:

```sh
pgrep -af cloudflared
```

A `cloudflared tunnel` line whose target is this app is the tunnel
to use: under portless, `--http-host-header <app>.localhost`;
otherwise `--url http://localhost:<BACKEND_PORT>`. Its
`--metrics localhost:<METRICS_PORT>` says where
`http://localhost:<METRICS_PORT>/quicktunnel` returns the URL. Leave
every other line alone; those are other apps' tunnels.

If there is none, run the bundled `cloudflared` shim in its own
background shell, with `--metrics localhost:<METRICS_PORT>` a free
local port for its metrics endpoint: `4040`, unless another app's
tunnel holds it. Under portless the tunnel reaches the backend by
name through the portless proxy, so it needs no port, can start
before the backend, and outlives every `rbt dev run` after it:

```sh
cloudflared tunnel \
    --metrics localhost:4040 \
    --url https://127.0.0.1:443 \
    --http-host-header <app>.localhost \
    --origin-server-name <app>.localhost \
    --origin-ca-pool ~/.portless/ca.pem
```

(`443` is `PORTLESS_PORT` if the user set it.) cloudflared passes
the public hostname on as `X-Forwarded-Host`, which the backend uses
for the URLs it hands the MCP client. Without portless, point the
tunnel at the backend's port instead, `9991` unless `rbt dev run` is
given `--port` (see `python/references/lifecycle-rbtrc.md` for the
`application_port` knob):

```sh
cloudflared tunnel \
    --metrics localhost:4040 \
    --url http://localhost:9991
```

Either way, read the tunnel's URL,
`https://<hostname>` from `http://localhost:<METRICS_PORT>/quicktunnel`
(it can take a few seconds to appear), and pass it to `rbt dev run`
below as `--tunnel-url=<URL>`: the setup wizard then shows and
verifies this app's tunnel at once, rather than looking for one
through the providers' local APIs, which with several apps up can
find another app's.

### Backend — both app types

Start the backend in its own background shell:

```sh
uv run rbt dev run --no-chaos
```

For an MCP App, add `--tunnel-url=<URL>`, the tunnel's URL from
above. `--env-file=.env` in `.rbtrc` loads the secrets into the process;
`--no-chaos` disables the Chaos Monkey, a useful bug-finder that is
confusing to a developer who cannot see the backend terminal. With
portless, the `.rbtrc`'s default config passes `--portless` (add it
yourself for an `.rbtrc` that has no such config), and the backend
logs its named URLs once it is serving; without, pass
`--config=ports` if the `.rbtrc` defaults to portless.

### Frontend — both app types

Run the Vite dev server from `frontend/`. Its `package.json`
mirrors the `.rbtrc`: `npm run dev` is the default, `dev:portless`,
which runs `portless frontend-<app> vite` (portless is a dev dependency, so
`npm install` brought it), and `dev:ports` is plain `vite` on Vite's
port. Under portless, when the user chose it:

```sh
cd frontend && npm run dev:portless
```

or on a plain port otherwise:

```sh
cd frontend && npm run dev:ports
```

### Setup wizard — MCP Apps only

An MCP App's backend serves an interactive **setup wizard** at
its root URL (`https://<app>.localhost` with portless, else
`http://localhost:9991`) — a browser page that walks
the user through connecting the app to an MCP client (such as
MCPJam: picking a client, copying the `/mcp` endpoint, completing
the OAuth handshake). It is the natural starting point — and the
place the user launches MCPJam from, if they pick it — so open it.

Once the backend logs show it is serving traffic, do two things:

1. **Tell the user the wizard exists and what it's for** — e.g.
   "Setup wizard (connect an MCP client) at http://localhost:9991".
2. **Open it once in the browser**, best-effort:

   ```sh
   "$BROWSER" http://localhost:9991 || xdg-open http://localhost:9991 || \
     python3 -m webbrowser http://localhost:9991
   ```

Open the wizard **exactly once, at first startup — never on
reloads.** The backend runs under `--watch` and reprints its
"serving traffic" banner every time it hot-reloads on a code change;
re-opening a browser tab on each reload would be hostile. Because
you open it as a one-shot step during initial startup (not from a
loop that watches for the backend coming back up), this is naturally
satisfied — just don't add any reload-driven re-open.

**Skip this only for a Web App.** A **Web App** has no MCP frontend,
so no wizard is served and there's nothing to connect — don't
announce or open it. Every other app here is an MCP App, and the
wizard is how you point a client at it, so open it even for a
**tools-only app** with no `UI()` methods: connecting MCPJam or
Claude through the wizard is exactly how the user tries those MCP
tools out.

### MCPJam inspector — on demand, never during startup

Do **not** start the MCPJam inspector as part of bringing the app
up. MCPJam is just one of the MCP clients the setup wizard offers
(alongside Claude and ChatGPT), so starting it is only relevant
once the user picks **MCPJam** in the wizard. When they do, the
wizard's MCPJam step shows the exact launch command — pointed at
the app's `/mcp` endpoint with OAuth — for the user to run from
their own terminal:

```sh
npx @mcpjam/inspector@2.23.3 --url http://localhost:9991/mcp --oauth
```

Leave the launch to the wizard. Only run it yourself if the user
explicitly asks you to, and then use the plugin's
`mcpjam-inspector` shim (it pins the version and passes `--no-open`
so it does not pop a browser tab — you surface the URL instead):

```sh
mcpjam-inspector --url http://localhost:9991/mcp --oauth
```

Either way the inspector binds the fixed port 6274.

## Step 6 — Hand off

Confirm every process is up from its logs, then give the user:

- the application's own inspect-page URL (and that `rbt inspect`
  inspects the same state from the CLI — see the
  [inspect skill](../inspect/SKILL.md));
- for an MCP App — the setup-wizard URL (`http://localhost:9991`,
  already opened for them, for connecting an MCP client) and a
  first prompt to try (e.g. "Create a new todo list and show it to
  me"). Don't hand over an MCPJam URL — MCPJam isn't running, and
  only starts if the user picks it in the wizard (see the on-demand
  step above);
- for a Web App — the backend's URL, where the web app is served
  (`https://<app>.localhost/` with portless, `http://localhost:9991/`
  without), and a first page to open.

> **Always start every process the app needs.** An MCP App needs
> backend and frontend; a Web App needs the same. (MCPJam is not in
> this set — it is launched on demand from the wizard, only if the
> user picks it.) The app is not usable until both are up, so do
> not stop after one.
