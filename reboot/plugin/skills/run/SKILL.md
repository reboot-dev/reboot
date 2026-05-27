---
name: run
description: Run an existing Reboot application locally. Detects whether the project is an MCP Chat App or a standalone Web App, makes sure dependencies and secrets are in place, then starts every process the app needs — the backend (`rbt dev run`), the frontend dev server, and (for Chat Apps) the MCPJam inspector. Use this to bring an app back up, e.g. at the start of a new session.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# run — Run a Reboot Application

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

- `mcp_servers.json` exists in the project root.
- An API file under `api/` uses `mcp=Tool()`, `mcp=None`, or `UI(`
  (the `UI()` method type).
- `.rbtrc` has a `dev run --default-config=hmr` line together with
  a `dev run:hmr --mcp-frontend-host=...` line.
- The frontend uses the nested `web/ui/<name>/index.html` layout.

**Web App** — all of:

- No `mcp_servers.json`.
- No `mcp=` / `UI(` anywhere under `api/`.
- A single SPA entry at `web/index.html` (top of `web/`, not under
  `web/ui/`).

If the signals genuinely conflict, or none match, ask the user
("Is this an MCP Chat App or a standalone Web App?"). Do not guess —
the app type changes whether the MCPJam inspector is started.

## Step 3 — Dependencies

From the project root:

- Backend: if `.venv/` is missing, run `uv sync`.
- Frontend: if `web/node_modules/` is missing, run
  `cd web && npm install`.

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

```sh
uv run rbt dev run --no-chaos
```

`--env-file=.env` in `.rbtrc` loads the secrets into the process;
`--no-chaos` disables the Chaos Monkey, a useful bug-finder that is
confusing to a developer who cannot see the backend terminal.

### Frontend — both app types

```sh
cd web && npm run dev
```

### MCPJam inspector — Chat Apps only

First wait until the backend logs show a passed health check and
the printed inspect-page URL — that confirms the backend is ready.
Then read the server name from `mcp_servers.json` and start the
inspector:

```sh
npx @mcpjam/inspector@2.4.12 --config mcp_servers.json --server <name>
```

If `mcp_servers.json` is missing, create it first (the server name
is the application name from `.rbtrc`):

```json
{
  "mcpServers": {
    "<name>": { "url": "http://localhost:9991/mcp", "useOAuth": true }
  }
}
```

The inspector binds the fixed port 6274; its launcher orphans the
server on `SIGTERM`, so the plugin reaps it when the agent session
ends. Claude Code does this automatically via a `SessionEnd` hook;
Codex has no session-end event, so see the README for how cleanup
is handled there.

## Step 6 — Hand off

Confirm every process is up from its logs, then give the user:

- the application's own inspect-page URL;
- for a Chat App — the MCPJam inspector URL and a first prompt to
  try (e.g. "Create a new todo list and show it to me");
- for a Web App — the frontend dev-server URL and a first page to
  open.

> **Always start every process the app needs.** A Chat App needs
> all three — backend, frontend, MCPJam inspector; a Web App needs
> both — backend, frontend. The app is not usable until they are
> all up, so do not stop after one or two.
