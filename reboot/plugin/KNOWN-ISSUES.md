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

## Testing

### A custom step that awaits another custom step hangs

Affects: 1.6.0 through 1.7.2.

A `reboot.bdd` step runs its coroutine on the scenario's event loop and
blocks until it finishes. A decorated step that awaits another
decorated step blocks that same loop, so the scenario hangs until the
test times out.

Workaround: put shared step logic in a plain `async def` helper and
have each step await the helper, never another decorated step.

## Auth

### Local sign-in fails in Safari with "Missing pending-flow cookie"

Affects: 1.6.0 through 1.7.2.

The development OAuth server always sets its cookies with `Secure`, on
the expectation that browsers accept `Secure` cookies from
`http://localhost`. WebKit-based browsers, Safari among them, drop
them, so local sign-in over plain http fails with
`Missing pending-flow cookie`.

Workaround: sign in locally from Chrome or Firefox.

### An `app_internal=True` HTTP route can't have a path parameter

Affects: 1.6.0 through 1.7.2; the failure changed in 1.7.0.

An HTTP route registered with `app_internal=True` or
`require_oauth_token=True` can't take a path parameter, such as
`/logo/{host}`. In 1.6.0 such a route never matched, so its handler
silently got an ordinary external context and the calls it made to
app-internal methods were refused. From 1.7.0, registering it fails at
startup with an `InputError`.

Workaround: register these routes on a fixed path only, and pass
variables in the query string (`/logo?host=...`).

## Standard library

### `empty` on a `Queue` that was never written to fails with `StateNotConstructed`

Affects: 1.6.0 through 1.7.2.

A `Queue` is constructed by its first `enqueue`. Before that, calling
the `empty` reader aborts with `StateNotConstructed` instead of
answering true. A workflow that checks `empty` first fails and retries.

Workaround: don't call `empty` on a queue that may never have been
written to. Use `try_dequeue`, which answers with nothing when the
queue is empty, or a blocking dequeue.

## Reboot Cloud

### `rbt cloud up` fails at push with Docker Desktop on macOS

Affects: 1.6.0 through 1.7.2, on macOS with Docker Desktop.

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
