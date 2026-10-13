# Known issues in released Reboot versions

This file lists defects in released versions of Reboot that a build can
run into, and how to work around each one until a release fixes it.
Each entry says which versions it affects. Check the version a project
pins (`rbt --version`, or the `reboot` pin in `pyproject.toml`) before
applying a workaround: an entry that doesn't affect that version doesn't
apply.

When the release that fixes an entry becomes the oldest version the
plugin supports, the entry is removed. "Fixed on main" means the fix is
merged in reboot-dev/reboot but not yet in a release.

## Dev loop and Envoy

### Fan-out reads fail with `Unavailable: ping timeout` after a restart on an Apple Silicon Mac

Affects: 1.6.0 on macOS arm64.

For several minutes after every `rbt dev run` start or restart, the
local Envoy's LuaJIT compiler keeps most of its workers busy compiling
Reboot's Lua routing filters. Envoy stops answering HTTP/2 keepalives,
so readers that fan out to other states fail with
`Unavailable: ping timeout`, and writes can hang.

Workaround: turn the JIT off in the routing filters. In the project's
virtual environment, edit `reboot/routing/envoy_config.py` so that
`_lua_any` prepends `if jit then jit.off() end` to the filter source:

```python
def _lua_any(source_code: str) -> any_pb2.Any:
    source_code = "if jit then jit.off() end\n" + source_code
    ...
```

Then stop `rbt dev run` and any Envoy it left running before starting
it again, since a running Envoy keeps its old filters. `uv sync`, a
version bump or a fresh clone reinstalls the package and undoes the
edit, so check for it after each.

Fixed on main (reboot#189), not yet released.

### Stopping `rbt dev run` with SIGTERM leaves the application and Envoy running

Affects: 1.6.0.

`rbt dev run` cleans up its subprocesses only on Ctrl-C (SIGINT). Any
other way of stopping it, such as SIGTERM from a tool, an agent or a
process manager, ends `rbt` and leaves the application's processes and
its Envoy running and holding their ports. The next start or test run
then fails on ports or on the database lock that is still held.

Workaround: stop `rbt dev run` with Ctrl-C, or send it SIGINT
(`kill -INT <pid>`). If it was stopped any other way, find the
project's leftover `main.py` and `envoy` processes (`ps -ax`) and stop
them before starting again.

Fixed on main, not yet released.

### Ctrl-C at the `rbt dev expunge` prompt does nothing

Affects: 1.6.0.

`rbt dev expunge` asks for confirmation in a way that blocks its event
loop, so Ctrl-C, and any signal after it, is ignored until the question
is answered. A script or agent shell waiting on the prompt can't
interrupt it.

Workaround: always pass `--yes`, after stopping the application:
`rbt dev expunge --application-name=<name> --yes`.

Fixed on main, not yet released.

## Code generation

### `rbt generate` fails with `ENOBUFS` on a large API

Affects: 1.6.0.

`rbt generate` (and so `rbt dev run`) runs `protoc-gen-es` with Node's
default 1 MiB output buffer. Once the generated TypeScript passes that
size, which an app with a handful of types can reach, generation fails
with `spawnSync /bin/sh ENOBUFS`.

Workaround: in the project's virtual environment, edit
`reboot/protoc_gen_es_with_deps.cjs` so the `execSync("protoc-gen-es",
{ ... })` call also passes `maxBuffer: 256 * 1024 * 1024`, then restart
`rbt dev run`. Like the Envoy edit, it is undone by `uv sync` or a
reinstall.

A fix is proposed upstream (reboot#232).

### A model defined in another API file breaks the generated Python

Affects: 1.6.0.

When a method names a model, such as an error type, that is defined in
a different API file, the generated Python refers to it by module
without importing that module. `rbt generate` succeeds, and importing
the generated code then fails with
`NameError: name '<module>' is not defined`. A file of models with no
`api` generates no TypeScript types.

Workaround: define the models each API file uses in that file.

Fixed on main, not yet released.

## Schema changes

### Rewording a method's `description=` is refused as backwards-incompatible

Affects: 1.6.0.

Once an application has persisted state, any change to a method's
`description=`, even a spelling fix, is treated as a backwards-incompatible
schema change: `rbt dev run` stops and asks whether to expunge, and a
deploy over existing state is refused.

Workaround: write each method's description in its final form before
the application first runs with state worth keeping. In development,
expunge to change one. In production, leave descriptions as they are
until a release with the fix.

Fixed on main, not yet released.

## Testing

### Harness tests on macOS hang or fail with `Unimplemented` or timeouts

Affects: 1.6.0 on macOS.

The test harness starts its servers on `0.0.0.0`, which binds both IPv4
and IPv6, while callers dial IPv4. On macOS a new server can then be
given a port that another IPv4 listener, such as a leftover Envoy,
already holds. Calls reach the wrong process and fail with
`Unimplemented`, time out, or hang. Running tests in parallel makes it
more likely.

Workaround: before a run, stop leftover Envoy processes from earlier
runs. In `tests/conftest.py`, bind the harness to IPv4 only:

```python
from reboot.controller import server_managers

server_managers.EVERY_LOCAL_NETWORK_ADDRESS = "127.0.0.1"
```

Use a per-test timeout (`pytest-timeout`) so a hang fails instead of
stalling the suite.

### A custom step that awaits another custom step hangs

Affects: 1.6.0.

A `reboot.bdd` step runs its coroutine on the scenario's event loop and
blocks until it finishes. A decorated step that awaits another
decorated step blocks that same loop, so the scenario hangs until the
test times out.

Workaround: put shared step logic in a plain `async def` helper and
have each step await the helper, never another decorated step.

### A web step with `has` or `with` in its text fails with "each clause goes in backticks"

Affects: 1.6.0.

`reboot.bdd` has a catch-all step that matches any step text containing
`has` or `with` and no backticks, to point out clauses written
without them. A web step whose quoted text contains one of those words,
such as a button or label that says "with", can be matched by the
catch-all and fail with
`Almost: each clause goes in backticks`, though nothing in it is a
clause.

Workaround: keep `has` and `with` out of the quoted text in web
steps, by rewording the step or the label.

### `eventually has` fails at once when the state doesn't exist yet

Affects: 1.6.0.

A `Then ... eventually has ...` step opens a reactive read and waits
for its assertion. If the state hasn't been constructed yet, for
example because a workflow will create it, the read's error ends the
step at once instead of being treated as "not yet".

Workaround: wait in a custom step that reads in a loop and treats
`StateNotConstructed` as not yet, until the deadline.

Fixed on main, not yet released.

## Auth

### Local sign-in fails in Safari with "Missing pending-flow cookie"

Affects: 1.6.0.

The development OAuth server always sets its cookies with `Secure`, on
the expectation that browsers accept `Secure` cookies from
`http://localhost`. WebKit-based browsers, Safari among them, drop
them, so local sign-in over plain http fails with
`Missing pending-flow cookie`.

Workaround: sign in locally from Chrome or Firefox.

### An `app_internal=True` HTTP route with a path parameter gets an external context

Affects: 1.6.0.

An HTTP route registered with `app_internal=True` is recognized by
comparing the request's path with the route's path as written. A route
with a path parameter, such as `/logo/{host}`, never matches, so its
handler silently gets an ordinary external context, and the calls it
makes to app-internal methods are refused.

Workaround: register `app_internal=True` routes on a fixed path only,
and pass variables in the query string (`/logo?host=...`).

## Standard library

### `reboot.std.oauth` can't be imported, so `store_tokens=True` fails

Affects: 1.6.0.

The `reboot` wheel ships the generated `rbt.std.oauth` code but not the
`reboot.std.oauth` package that wraps it. An application that uses an
OAuth provider with `store_tokens=True`, which needs `oauth_library`
from `reboot.std.oauth.v1.oauth`, can't import it.

Workaround: leave out `store_tokens=True` and the OAuth token library
until a release ships the package.

### `empty` on a `Queue` that was never written to fails with `StateNotConstructed`

Affects: 1.6.0.

A `Queue` is constructed by its first `enqueue`. Before that, calling
the `empty` reader aborts with `StateNotConstructed` instead of
answering true. A workflow that checks `empty` first fails and retries.

Workaround: don't call `empty` on a queue that may never have been
written to. Use `try_dequeue`, which answers with nothing when the
queue is empty, or a blocking dequeue.

## Reboot Cloud

### `rbt cloud up` fails at push with Docker Desktop on macOS

Affects: 1.6.0.

`rbt cloud up` builds the image with the user's Docker configuration,
then pushes it with a temporary configuration that holds only the
registry credentials. That temporary configuration has no Docker
context, so the push uses the default socket, `/var/run/docker.sock`.
Docker Desktop on macOS doesn't create that socket by default, so the
push fails with an error saying to check that the Docker daemon is
running, though it is.

Workaround: point Docker at Docker Desktop's socket before deploying:

```sh
export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
```
