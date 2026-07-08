---
name: run
description: Run an existing Reboot application locally. Detects whether the project is an MCP Chat App or a standalone Web App, makes sure dependencies and secrets are in place, then starts every process the app needs — a Cloudflare quick tunnel (so external MCP clients can reach the dev server) via the bundled `cloudflared` shim, the backend (`rbt dev run`), and the frontend dev server (for Chat Apps it also opens the setup wizard, from which the user can launch MCPJam on demand). Use this to bring an app back up, e.g. at the start of a new session.
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
> build, see the [chat-app skill](../chat-app/SKILL.md) and the
> [web-app skill](../web-app/SKILL.md) — those skills defer here for
> their "run the app" step.

## Step 1 — Locate the project

Work in the directory the user named, or the current directory. The project root is the directory that contains
`.rbtrc`. If there is no `.rbtrc` anywhere obvious, ask the user
where the app is. Every command below runs from the project root.

## Step 2 — Detect the app type

A Reboot project is one of two kinds. Decide using these signals,
strongest first.

**MCP Chat App** — any of:

- An API file under `api/` uses `mcp=Tool()`, `mcp=None`, or `UI(`
  (the `UI()` method type).
- `.rbtrc` has a `dev run --default-config=hmr` line together with
  a `dev run:hmr --frontend-host=...` line.
- The frontend uses the nested `frontend/mcp/<name>/index.html` layout.

**Web App** — all of:

- No `mcp=` / `UI(` anywhere under `api/`.
- A single SPA entry at `web/index.html` (top of `web/`, not under
  `frontend/mcp/`).

If the signals genuinely conflict, or none match, ask the user
("Is this an MCP Chat App or a standalone Web App?"). Do not guess —
the app type changes whether the setup wizard is opened.

## Step 3 — Dependencies

From the project root:

- Backend: if `.venv/` is missing, run `uv sync`.
- Frontend: if the frontend's `node_modules/` is missing, run
  `npm install` in the frontend directory — `frontend/` for an MCP
  Chat App, `web/` for a standalone Web App.

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

### Backend — both app types

Before starting the backend, kick off a Cloudflare quick tunnel
pointed at the dev server's port so external MCP clients (e.g.
ChatGPT) can reach it. Run the bundled `cloudflared` shim in its
own background shell with two flags you choose:

- `--url http://localhost:<BACKEND_PORT>` — the dev server's HTTP
  port (the default is `9991`; pick a different free port if `9991`
  is taken and configure `rbt dev run` to match below).
- `--metrics localhost:<METRICS_PORT>` — a free local port for
  cloudflared's metrics endpoint (the default is `4040`; pick a
  different free port if `4040` is taken). Once the tunnel is up,
  `http://localhost:<METRICS_PORT>/quicktunnel` returns the
  allocated `*.trycloudflare.com` URL.

```sh
cloudflared tunnel \
    --metrics localhost:4040 \
    --url http://localhost:9991
```

Pass the **same** `<BACKEND_PORT>` to `rbt dev run` so the dev
server and the tunnel agree on the port — Reboot's default is
`9991`, so no extra flag is needed if you stuck with the default;
otherwise see `python/references/lifecycle-rbtrc.md` for the
`application_port` knob.

Then start the backend itself in its own background shell:

```sh
uv run rbt dev run --no-chaos
```

`--env-file=.env` in `.rbtrc` loads the secrets into the process;
`--no-chaos` disables the Chaos Monkey, a useful bug-finder that is
confusing to a developer who cannot see the backend terminal.

### Frontend — both app types

Run the Vite dev server from the frontend directory: `frontend/` for
an MCP Chat App, `web/` for a standalone Web App.

```sh
cd frontend && npm run dev   # or `cd web` for a standalone Web App
```

### Setup wizard — MCP Chat Apps only

An MCP Chat App's backend serves an interactive **setup wizard** at
its root URL (`http://localhost:9991`) — a browser page that walks
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

**Skip this only for a Web App.** A **Web App** has no MCP surface,
so no wizard is served and there's nothing to connect — don't
announce or open it. Every other app here is an MCP app, and the
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
- for a Chat App — the setup-wizard URL (`http://localhost:9991`,
  already opened for them, for connecting an MCP client) and a
  first prompt to try (e.g. "Create a new todo list and show it to
  me"). Don't hand over an MCPJam URL — MCPJam isn't running, and
  only starts if the user picks it in the wizard (see the on-demand
  step above);
- for a Web App — the frontend dev-server URL and a first page to
  open.

> **Always start every process the app needs.** A Chat App needs
> backend and frontend; a Web App needs the same. (MCPJam is not in
> this set — it is launched on demand from the wizard, only if the
> user picks it.) The app is not usable until both are up, so do
> not stop after one.
