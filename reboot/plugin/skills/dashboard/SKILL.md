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

Use this skill when a build flow directs you here (the `mcp-app`
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

Where the dashboard serves depends on `.rbtrc`. With
`dashboard --default-config=portless` (every `.rbtrc` these skills
write has it; see `../python/references/lifecycle-rbtrc.md`) it is
`https://dashboard-<app>.localhost/`, `<app>` being the `.rbtrc`'s
`dev run --application-name`, through the portless proxy, which
must be running: check on it, and start it, as the run skill's
"Named URLs with portless" section says, before Step 4. Without
that line, or with `--config=ports`, it is `http://127.0.0.1:9871/`.
Either forwards to
wherever its page is. Probe it:

```sh
curl -sf -o /dev/null --max-time 2 https://dashboard-<app>.localhost/
```

If that succeeds, a dashboard is already up — do not start a second
one. Surface the URL and stop.

(Without portless, if port 9871 is held by something that is _not_
this project's dashboard — rare — start on another port with
`--port=<port>`. Under portless the port is a free one behind the
name.)

## Step 4 — Start the dashboard

From the project root, in its own background shell:

```sh
uv run rbt dashboard
```

It takes the API directory from the `generate <dir>` line in
`.rbtrc` (Step 2), spelled relative to the project root — that is how
file names are shown in the dashboard.

It prints `Your dashboard is at <URL>` immediately and keeps
running; wait
until the probe from Step 3 succeeds before calling it up. It stays running for the life of the
session — leave it alone afterwards; it never needs a restart when
code changes.

It also serves the dashboard as MCP Apps at `/mcp`, which Claude or
ChatGPT can show once they can reach it: the whole dashboard, and a
card of one feature or one state type, inline, for when the user asks
about a specific one; a listing tool gives the host the ids. Step 6
hands the user the steps for that once the app is built.

If it fails to come up (for example the local Envoy check fails
because neither Docker nor an `envoy` executable is available, or
the user declined portless and the proxy is not running: then
`uv run rbt dashboard --config=ports`, on the plain port), warn
the user in one sentence and continue the build without it.

## Step 5 — Hand over the URL

Do not open the page yourself. `rbt dashboard` opens it in the
browser once it is serving, unless a tab is already showing it or
the developer chose "Don't reopen automatically"; opening it as well
gives the developer two tabs.

Tell the user the dashboard is up and what it is for — e.g.
"Developer dashboard (watch the API as I build it) at
https://dashboard-<app>.localhost/. It can also open in Claude or
ChatGPT; I'll give you the steps once the app is built." — and get on
with the build.

If the developer expected a window and none appeared, give them the
URL; that always works.

## Step 6 — Required final hand-over: the connector

Required final hand-over: if you started the developer dashboard,
include the `reboot-connectors` command and the Claude and ChatGPT
connector instructions in your final response. This applies even when the user
asked only for a standalone web app and never mentioned MCP. Do not
omit them for brevity or perceived relevance. A dashboard URL, or
instructions saved in a README, do not satisfy this requirement.

Give them once the app is built and the `run` skill has handed it
over, in the same message; do not interrupt the build for this, and
do not wait to be asked. `rbt dashboard` serves this machine alone,
so an MCP host in the cloud reaches it through a tunnel the user
starts themselves, in their own shell; do not start one for them.

The plugin's `reboot-connectors` command does the tunnels for the
user: run by them (never by you), it starts a Cloudflare quick tunnel
to the app and one to its dashboard in the background (or reuses ones
already running), prints each connector's **name and full address,
`/mcp` already on the end**, and returns. Two random `*.trycloudflare.com` addresses look alike, so
giving them named is what keeps the app's connector from being added
with the dashboard's address. Its path is what `command -v
reboot-connectors` prints in this session (the plugin's `bin/`); give
that path whole, in double quotes when it has a space (the desktop
app installs plugins under "Application Support"), since a terminal of
the user's does not have the plugin on its PATH. With no app running (a dashboard alone), it gives the
dashboard's connector only.

**Write the steps for someone who has never added a connector**, so
no step needs asking about. One section, "Use it from Claude or
ChatGPT":

1. **Type this in the chat, `!` included**:
   `! <path>/reboot-connectors <app>`. The `!` runs it right here, and
   what it prints lands in the conversation, for example:
   ```
     my-app https://quiet-river-1234.trycloudflare.com/mcp
     my-app dashboard      https://swift-lake-5678.trycloudflare.com/mcp
   ```
   Each address is a temporary doorway from the internet to this Mac;
   the tunnels keep running in the background until
   `! <path>/reboot-connectors <app> --stop`. (Away from Claude Code,
   the same command without the `!` in a terminal does the same.)
2. **Add each one as a connector, with its name and address exactly
   as printed.** In Claude (claude.ai or the desktop app): Customize →
   Connectors → Add custom connector; paste the name, paste the
   address, save. A sign-in page may appear: approve it and it
   finishes by itself. In ChatGPT: Settings → Connectors, the same
   way. In Claude the connector also works in the desktop app's Code
   tab, beside the session; say so. The app's connector is the app
   (its tools and UIs); the dashboard's is the developer dashboard
   (features, models, scenarios).
3. **If Claude says "Connecting to the server: 405, Not found"**, the
   address is missing its `/mcp`: cancel, and paste it again exactly
   as printed (never "Continue anyway").
4. **Something to try** in a chat: for the app, a first prompt that
   uses its tools and opens a `UI()`; for the dashboard, "show me the
   <feature> feature", which shows its card in the conversation.

Then two reminders: whoever has the address reaches their dashboard
as them, so not to share it; and a quick tunnel gets a new address
each time it starts, so the connector must then be added again. The
long form is
[The dashboard in Claude or ChatGPT](https://docs.reboot.dev/develop_locally#the-dashboard-in-claude-or-chatgpt).
