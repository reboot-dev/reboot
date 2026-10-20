import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

# Develop locally

This page provides an overview of getting your development environment
ready for building Reboot applications. Once your development
environment is ready you can then start to
[define](/define/overview) and
[implement](/implement/servicers) your API.

New to Reboot? [Build with Claude Code](/get_started/claude_code) or
[Codex](/get_started/codex) gets you a running app in minutes; this
page is the reference behind what they set up.

## Set up your environment

You can use one of Reboot's GitHub Codespaces or set up your environment
manually by installing the prerequisites listed below.
<!-- TODO: explain how to use a GitHub Codespace. -->

### Prerequisites

| OS | |
| -------- | ------- |
| Linux | `x86_64` or `arm64`, glibc>=2.35 (Ubuntu Jammy and other equivalent-generation distributions) |
| macOS | `arm64`, macOS >= 14.0 and Xcode >= 15.2 |

* Python >= 3.10 and < 3.13 is required for Python backends, and fetched automatically for Node.js backends
* Node.js >= 20.10 is required for Node.js backends only
* Docker

:::note
Python 3.13 support is coming soon.
:::

:::note
Your applications don't need to run "inside of" Docker, but Docker is used to
host a service required for local development.
:::

## The `rbt` CLI

The `rbt` command line tool doesn't have a separate installation; it
comes with the Reboot library.

<Tabs groupId="language">
  <TabItem value="python" label="Python">

For Python, installing the
[`reboot`](https://pypi.org/project/reboot) package provides `rbt`:

```shell
uv add reboot
```

Then run it as `uv run rbt ...`, or as plain `rbt ...` in an
activated virtual environment (e.g. `.venv`).

  </TabItem>

  <TabItem value="typescript" label="TypeScript">

For TypeScript, installing the
[`@reboot-dev/reboot`](https://www.npmjs.com/package/@reboot-dev/reboot)
package provides the `rbt` bin:

```shell
npm install @reboot-dev/reboot
```

Then run it as `npx rbt ...`.

  </TabItem>
</Tabs>

## Directory layout

You can lay out your directories however you like, as long as you pass
them correctly to `rbt`.

Here is a suggested file layout:

| Files | Directory |
| -------- | ------- |
| API definitions (`*.py`, `*.ts`) | `api/` |
| Backend source `*.py`, `*.ts/js` | `backend/src` |
| Tests: feature files and `*.py` | `tests` |
| Backend tests `*.ts/js` | `backend/tests` |
| Generated React client | `frontend/api` |
| Browser app | `frontend/web` |
| React Native app | `frontend/mobile` |
| `UI` method apps, one per method | `frontend/mcp/<name>` |

Putting the generated client in `frontend/api` lets every frontend of
your application share one copy of it. See
[One backend, many frontends](/frontends/overview).

## `.rbtrc` and flags

`rbt` loads its flags from an `.rbtrc` file, if present. This is a convenient
way of keeping the options you have to type and remember to a
minimum.

An `.rbtrc` file might look like:
<Tabs groupId="language">
  <TabItem value="python" label="Python">
<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../reboot/examples/bank/.rbtrc&lines=8-21&syntax=shell) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank/.rbtrc -->

```shell
# Watch if any generated or source files are modified.
dev run --watch=backend/**/*.py

# Tell `rbt` that this is a Python application.
dev run --python

# Save state between chaos restarts.
dev run --application-name=bank

# Run the application!
dev run --application=backend/src/main.py

# When expunging, expunge that state we've saved.
dev expunge --application-name=bank
```

<!-- MARKDOWN-AUTO-DOCS:END -->
  </TabItem>

  <TabItem value="typescript" label="TypeScript">
<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../reboot/examples/counter/.rbtrc&lines=5-12&syntax=shell) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/counter/.rbtrc -->

```shell
# Set the name of our application.
dev run --application-name=counter

# Declare that this is a nodejs application.
dev run --nodejs

# And specify where our application entrypoint is.
dev run --application=backend/src/main.ts
```

<!-- MARKDOWN-AUTO-DOCS:END -->

:::note
Note that for Node.js, transpilation of TypeScript will automatically be
executed if the `--application` has a `.ts` extension, but can also be executed
via `--transpile=...` _or_ can be left to you and your favorite tools.

If your `--application` has a `.js` extension, you'll likely want to watch the
files in `dist/` rather than `backend/src` so that `rbt` will only restart
your app when they have been correctly transpiled.
:::
  </TabItem>
</Tabs>

### Syntax

#### Global options

Global options like the `--state-directory` flag can be specified in `.rbtrc`
by prefixing with `...`:
```shell
... --state-directory=non/default
```

#### Passthrough options

Commands like `generate` use the `--` separator to accept arguments to pass
directly to an underlying tool:

In a terminal:

```shell
rbt generate --python=backend/api/ api/ -- --mypy_out=backend/api/
```

In `.rbtrc`:

```shell
# Find API definitions in 'api/'.
generate api/

# Generate Python code into 'backend/api/'.
generate --python=backend/api/

# Generate 'mypy' stubs into 'backend/api/mypy/'.
generate -- --mypy_out=backend/api/mypy/
```

In these examples, the order of the flags is crucial. All flags that
appear after `--` are passed directly to the underlying code
generator.

#### Frontend flags

When your application has a React frontend — a
[web app](/frontends/web), a
[React Native app](/frontends/react_native), or
[`UI` methods](/frontends/ui_methods) — add these to your `.rbtrc`:

```shell
# Generate typed React hooks, shared by every frontend.
generate --react=frontend/api

# Proxy the frontend through Vite for hot module replacement.
dev run:ports --frontend-url=http://localhost:5173
dev run:ports --mcp-app
dev run:ports --web-app

# Use the `ports` config when --config is not specified.
dev run --default-config=ports
```

| Flag | Description |
| --- | --- |
| `dev run --frontend-url=<url>` | The frontend's dev server (e.g. Vite at `http://localhost:5173`): Envoy proxies `/__/frontend/**` to it, with Hot Module Replacement. Says only where the frontend is; alone it is an error. |
| `dev run --mcp-app` | Serve the application's MCP Apps (its `UI(...)` methods) from `--frontend-url`, which it requires. An application with `UI(...)` methods needs this or `--mcp-app-dist-path`; one without refuses both. |
| `dev run --web-app` | Serve the application's web app from `--frontend-url`, which it requires: Envoy sends `/`, and every path the application doesn't answer, to the dev server, which serves the web app at its `/`. Mutually exclusive with `--web-app-dist-path`. Python applications only. |
| `dev run --mcp-app-dist-path=<dir>` | Dist: serve the built MCP Apps from `<dir>` (e.g. `frontend/dist/mcp`) on disk under `/__/frontend/mcp/`, each `UI(path=...)` from `<dir>/<path>/index.html`; mutually exclusive with `--frontend-url` and `--mcp-app`. |
| `dev run --web-app-dist-path=<dir>` | Serve the built web app from `<dir>` (e.g. `frontend/dist/web`) at `/`, with its `index.html` answering any path the app has no route or file for. Without it, `/` is Reboot's page. Python applications only: with `--nodejs` it is an error. |
| `dev run --portless` | Serve under a named URL via [portless](https://github.com/vercel-labs/portless): the backend becomes `https://<app>.localhost`, on a free port unless `--port` is given, serving the web app at `/` and the MCP Apps from the frontend dev server, which runs under portless as `https://frontend-<app>.localhost` (its `npm run dev:portless`) and is trusted as a browser origin too. See [Named local URLs](#named-local-urls-with---portless). |
| `dev run --tunnel-url=<url>` | The public URL this application is reachable at through a tunnel (e.g. `https://<name>.trycloudflare.com`). The setup wizard shows and verifies it; without it, the wizard asks ngrok and cloudflared, through their local APIs on their default ports, for a tunnel of their own. |
| `dev run --default-config=<name>` | Sets the default configuration profile when `--config` is not specified. |
| `dev run:ports` / `dev run:dist` | Named configurations. Flags prefixed with `dev run:<name>` only apply when `--config=<name>` is used. |

<!-- ## Boilerplate code

The `rbt generate` command can generate boilerplate code based on your API
definitions, giving you copy-paste-able Python/TypeScript method definitions for which
you only need to fill in the implementation. To generate the boilerplate code,
use the `--boilerplate` flag followed by the path to the directory where you
want the boilerplate code to be placed:

In Terminal:

```shell
rbt generate --boilerplate=backend/boilerplate/
```

In `.rbtrc`:

```shell
generate --boilerplate=backend/boilerplate/
```

:::note
It's important not to modify the generated files directly, as they will be
overwritten the next time you run `rbt generate`. Instead, you should copy (parts
of) the generated files to your source directory and make your modifications
there.
::: -->

## Running your app for development

Once you've set up your environment as outlined above, all you'll need to run
to start live developing your app is:
```console
$ rbt dev run
...
```
Or if you're building a Node.js backend with `npm` (after installing
`@reboot-dev/reboot`):
```console
$ npx rbt dev run
...
```

### Named local URLs with `--portless`

[portless](https://github.com/vercel-labs/portless) gives local
servers names instead of ports. Install it once with
`npm install -g portless` and start its proxy with
`portless proxy start` (it asks for `sudo` to bind port 443 and
installs a local certificate authority so the `https://` URLs are
trusted). Then:

```console
$ rbt dev run --portless --application-name=bank
...
  Your API is available at:      https://bank.localhost
```

`rbt dev run` registers the backend with the proxy as
`https://<app>.localhost`. The name is the address, so the port
behind the proxy is a free one unless `--port` says otherwise, and
several applications run at once without colliding on `9991`. It
expects the frontend's dev server at `https://frontend-<app>.localhost`,
which is what running it under portless with that name gives you.
The frontend's `package.json` carries that as scripts mirroring the
`.rbtrc` configs below, with `portless` as a dev dependency:

```json
"dev": "npm run dev:portless",
"dev:portless": "portless frontend-bank vite",
"dev:ports": "vite"
```

```console
$ cd frontend && npm run dev
```

Envoy serves the MCP Apps and the web app at `/` from that dev
server, so the whole app is at `https://<app>.localhost`, one origin,
and no `VITE_REBOOT_URL` is needed. The backend also trusts exactly
the dev server's origin for credentialed requests (a frontend
registered under any other name is refused, so the two names cannot
drift apart), so the web app opened at `https://frontend-<app>.localhost`
works as well, cross-origin. Point `--frontend-url` at the named dev
server, typically as a config that `.rbtrc` makes the default:

```shell
dev run --application-name=bank
dev run --default-config=portless

dev run:portless --portless
dev run:portless --frontend-url=https://frontend-bank.localhost
dev run:portless --mcp-app
dev run:portless --web-app

dashboard --default-config=portless
dashboard:portless --portless
dashboard:ports --no-portless
```

`rbt dashboard --portless` serves the developer dashboard the same
way, as `https://dashboard-<app>.localhost` on a free port the proxy
routes to (the name is the `.rbtrc`'s `dev run --application-name`).
The dashboard's configs are named like `rbt dev run`'s, so
`rbt dashboard --config=ports` goes with `rbt dev run --config=ports`:
the plain port, `http://127.0.0.1:9871`.

A [Cloudflare quick tunnel](/call/from_mcp_client#cloudflared) in
front of the backend reaches it by name too, with `--url` at the
proxy and `<app>.localhost` as `--http-host-header` and
`--origin-server-name`, so it needs no port and one tunnel serves
every `rbt dev run` of a session. cloudflared passes the public
hostname on as `X-Forwarded-Host`, which the OAuth and MCP endpoints
use for the URLs they hand a client.

### The dashboard in Claude or ChatGPT

`rbt dashboard` also serves the dashboard as MCP Apps, at `/mcp`,
which an MCP host such as Claude or ChatGPT shows inside a
conversation: the whole dashboard, for the changelog, the call graph
or the features as a whole, and a card of one feature or one state
type, inline, when you ask about a specific one. The dashboard is a
Reboot application of its own, with its own `/mcp`: the tunnel goes
to the dashboard's address, `https://dashboard-<app>.localhost` or
`http://127.0.0.1:9871`, not to your application's. The dashboard
serves your machine alone, so a host in the cloud reaches it through
a tunnel you start yourself; `rbt dashboard` prints the command for
the mode it runs in. Under `--portless`, point a
[Cloudflare quick tunnel](/call/from_mcp_client#cloudflared) at the
dashboard by name, the way you would at an application:

```sh
cloudflared tunnel \
    --url https://127.0.0.1:443 \
    --http-host-header dashboard-<app>.localhost \
    --origin-server-name dashboard-<app>.localhost \
    --origin-ca-pool ~/.portless/ca.pem
```

With `--config=ports`, at its port instead:

```sh
cloudflared tunnel --url http://127.0.0.1:9871
```

Then add `https://<name>.trycloudflare.com/mcp`, with the hostname
the tunnel printed, as a custom connector in
[Claude](/call/from_mcp_client#claude) or
[ChatGPT](/call/from_mcp_client#chatgpt); signing in completes by
itself. In Claude that includes the desktop app's Code tab: the
connector, added at claude.ai, shows the dashboard and its cards
beside the session that is building the app. Whoever has the address reaches your dashboard, so keep it to
yourself, and a quick tunnel gets a new address each time it starts,
so add the connector again after restarting one.

### Inspecting state

While doing local development you can inspect your application state
by pointing your browser at
`http://localhost:9991/__/inspect` (assuming you aren't using TLS and haven't
changed the default port from `9991`), or at
`https://<app>.localhost/__/inspect` under `--portless`.

### Persisting state during development

By default your application state will not be persisted across
restarts. To persist state, you can pass an `--application-name=...` flag to `rbt dev
run`.

When state is persisted, backwards incompatible changes to your API
definitions are detected, and will trigger errors to encourage
resolving them before they reach production. The `--on-backwards-incompatibility` flag allows you to control
what happens when backwards incompatibility is encountered:

* `ask`: (default) Asks whether you would like to expunge the stored state to
  ignore the backwards incompatibility.
* `expunge`: Automatically expunges stored state after rendering a backwards
  compatibility error.
* `fail`: Waits for a code change that resolves the backwards incompatibility.

During early development of your application, either `ask` or `expunge` are
reasonable choices. Once you have deployed to production, the `fail` option
can encourage more caution while adjusting schemas.

You can also use `rbt dev expunge --application-name=...` to manually expunge data (where
`--application-name=...` is the same value you're using for `rbt dev run`).
