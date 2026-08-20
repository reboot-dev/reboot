---
name: dashboard
description: Start the Reboot developer dashboard (`rbt dashboard`) for a project and open it in the browser. Puts the minimum files in place (a `pyproject.toml` depending on `reboot`, a `.rbtrc`, the API directory), starts the dashboard in a background shell if one is not already serving, and opens its URL once. Use this while BUILDING an app — the dashboard watches the API directory from before anything is running, so the developer watches the API take shape as it is written. Not for running an app; `rbt dev run` manages its dashboard itself once the app exists (see the run skill).
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# dashboard — Start the Reboot Developer Dashboard

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

The developer dashboard is a browser page, served by
`rbt dashboard`, that shows a Reboot application's API and a
changelog of how it has evolved. It reads the API **files**, not a
running application, so it works from before the first API file is
written — which is exactly when to start it: bring the dashboard up
early in a build and the developer watches the API take shape while
you write it.

Use this skill when a build flow directs you here (the `chat-app`
and `web-app` skills do, right before the API is written) or when
the user asks for the dashboard while an app is being built.

> This skill **starts the dashboard**, nothing else. It does not run
> the application — that is the [run skill](../run/SKILL.md), and
> `rbt dev run` looks after its own dashboard once the app exists.
> The dashboard is optional: if any step below fails, tell the user
> the dashboard is not available and carry on with whatever you were
> building. Do not stop the build to debug it.

## Step 1 — Locate the project

Work in the directory the user named, or the current directory. The
project root is the directory holding (or about to hold) `.rbtrc`.
Every command below runs from the project root.

Decide where the API files live or will live. In every scaffold this
plugin produces that is `api/` at the project root; only deviate if
the project visibly keeps its API elsewhere (look for the
`generate <dir>` line in an existing `.rbtrc`).

## Step 2 — The minimum files

`rbt dashboard` needs three things on disk. In a build flow the
scaffolding step has already created all of them — check, and only
create what is missing:

1. **`pyproject.toml` depending on `reboot`** (plus
   `.python-version`), so `uv run rbt` resolves. If missing, create
   both following the templates in
   `../python/references/lifecycle-project-setup.md`.
2. **`.rbtrc`.** The dashboard never reads its flags; it only uses
   the file's location as the project anchor (working directory and
   `.rbt/` state directory). An existing `.rbtrc` of any shape is
   fine. If there is none yet, create a stub the later scaffolding
   will replace:

   ```
   # Reboot configuration; see the rbt documentation.
   ```

3. **The API directory** from Step 1 (`mkdir -p api`). It may be
   empty — the dashboard watches it and picks up files as they
   appear.

If `uv` is not on PATH (it always is under this plugin, whose `uv`
shim installs it on demand), install it first:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Step 3 — Is a dashboard already serving?

The dashboard serves at `http://127.0.0.1:9871/dashboard/`. Probe it:

```sh
curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9871/dashboard/
```

If that succeeds, a dashboard is already up — do not start a second
one. Surface the URL and stop.

(If port 9871 is held by something that is _not_ this project's
dashboard — rare — start on another port with `--port=<port>`, and
remember that a later `rbt dev run` then needs
`--dashboard-port=<port>` to find it.)

## Step 4 — Start the dashboard

From the project root, in its own background shell:

```sh
uv run rbt dashboard --api-directory=api
```

(`--api-directory=` takes the directory from Step 1, spelled
relative to the project root — that is how file names are shown in
the dashboard.)

It prints `Your dashboard is at http://127.0.0.1:9871/dashboard/`
immediately and keeps running; wait until the probe from Step 3
succeeds before calling it up. It stays running for the life of the
session — leave it alone afterwards; it never needs a restart when
code changes, and `rbt dev run` coexists with it.

If it fails to come up (for example the local Envoy check fails
because neither Docker nor an `envoy` executable is available), warn
the user in one sentence and continue the build without it.

## Step 5 — Open it once

Open the URL in the browser, best-effort, exactly once:

```sh
"$BROWSER" http://127.0.0.1:9871/dashboard/ || \
  xdg-open http://127.0.0.1:9871/dashboard/ || \
  python3 -m webbrowser http://127.0.0.1:9871/dashboard/
```

Once is enough for good: the page tracks its own viewers
(`Presence`) and the developer's preference about reopening, and
`rbt dev run` consults both before ever opening another. Never
re-open the page yourself on reloads or restarts.

Then tell the user the dashboard is up and what it is for — e.g.
"Developer dashboard (watch the API as I build it) at
http://127.0.0.1:9871/dashboard/" — and get on with the build.
