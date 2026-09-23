---
name: dashboard
description: Start the Reboot developer dashboard (`rbt dashboard`) for a project and open it in the browser. Puts the minimum files in place (a `pyproject.toml` depending on `reboot[dev]`, a `.rbtrc`, the API directory), starts the dashboard in a background shell if one is not already serving (it opens itself in the browser), and hands the user its URL. Use this while BUILDING an app — the dashboard watches the API directory from before anything is running, so the developer watches the API take shape as it is written. Not for running an app (see the run skill).
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# dashboard — Start the Reboot Developer Dashboard

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

The developer dashboard is a browser page, served by
`rbt dashboard`, that shows a Reboot application's API (the Models
page), its features as the `.feature` files under `tests/`
specify them (the Features page, with each feature's rules and
scenarios, the methods it uses, its `@wip` and `@blocked` marks, and
the recordings of its browser scenarios), and a changelog of how the
API has evolved. It reads the API and feature **files**, not a
running application, so it works from before the first API file is
written — which is exactly when to start it: bring the dashboard up
early in a build and the developer watches the API take shape while
you write it.

Use this skill when a build flow directs you here (the `mcp-ui`
and `web-app` skills do, right before the API is written) or when
the user asks for the dashboard while an app is being built.

> This skill **starts the dashboard**, nothing else. It does not run
> the application — that is the [run skill](../run/SKILL.md).
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

1. **`pyproject.toml` depending on `reboot` and, in its dev group,
   `reboot[dev]`** (plus `.python-version`), so `uv run rbt`
   resolves. `rbt dashboard` refuses to start without the
   `reboot[dev]` extra, which carries what its Features page runs
   on; a project that pins only `reboot` gets `reboot[dev]` added at
   the same version. If missing, create both files following the
   templates in `../python/references/lifecycle-project-setup.md`.
2. **`.rbtrc`.** Everything the dashboard reads of the project comes
   from here: the API directory from the `generate <dir>` line, and,
   for its code checks, the application from `dev run --application=`
   and the generated Python from `generate --python=`. The file's
   location is also the project anchor (working directory and `.rbt/`
   state directory). Without a `generate <dir>` line, `rbt dashboard`
   refuses to start. If there is no `.rbtrc` yet, create a stub the
   later scaffolding will extend:

   ```
   generate api/
   generate --python=backend/api/
   dev run --application=backend/src/main.py
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

The dashboard serves at `http://127.0.0.1:9871/`, which forwards to
wherever its page is. Probe it:

```sh
curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9871/
```

If that succeeds, a dashboard is already up — do not start a second
one. Surface the URL and stop.

(If port 9871 is held by something that is _not_ this project's
dashboard — rare — start on another port with `--port=<port>` and
surface that port instead.)

## Step 4 — Start the dashboard

From the project root, in its own background shell:

```sh
uv run rbt dashboard
```

It takes the API directory from the `generate <dir>` line in
`.rbtrc` (Step 2), spelled relative to the project root — that is how
file names are shown in the dashboard.

It prints `Your dashboard is at http://127.0.0.1:9871/`
immediately and keeps running; wait until the probe from Step 3
succeeds before calling it up. It stays running for the life of the
session — leave it alone afterwards; it never needs a restart when
code changes.

If it fails to come up (for example the local Envoy check fails
because neither Docker nor an `envoy` executable is available), warn
the user in one sentence and continue the build without it.

## Step 5 — Hand over the URL

Do not open the page yourself. `rbt dashboard` opens it in the
browser once it is serving, unless a tab is already showing it or
the developer chose "Don't reopen automatically"; opening it as well
gives the developer two tabs.

Tell the user the dashboard is up and what it is for — e.g.
"Developer dashboard (watch the API as I build it) at
http://127.0.0.1:9871/" — and get on with the build.

If the developer expected a window and none appeared, give them the
URL; that always works. If they clicked "Don't reopen automatically"
and want automatic opening back, the next `rbt dashboard --auto-open`
turns it back on; `--no-auto-open` turns it off, as the page's
button does.
