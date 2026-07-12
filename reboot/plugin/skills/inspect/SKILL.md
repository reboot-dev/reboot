---
name: inspect
description: Inspect the live state of a running Reboot application from the command line with `rbt inspect`. Lists the application's state types, lists the state IDs (actor IDs) for a type, and prints a single actor's state as JSON. Works against both a local `rbt dev run` backend and a deployed Reboot Cloud app via `--application-url` and `--admin-credential`. Use this to answer "what state types does this app have?", "which actors of this type exist?", or "what is stored in this actor right now?" — i.e. to debug persisted state from the terminal instead of the `/__/inspect` web dashboard.
argument-hint: "[type list | state list --type=<full.Name> | state get --type=<full.Name> --id=<id>]"
allowed-tools: Bash, Read
---

# inspect — Inspect a Running Reboot Application's State

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

`rbt inspect` reads the persisted state of a **running** Reboot
application — the same data the `/__/inspect` web dashboard shows,
but from the terminal so it is scriptable and pipeable. Reach for it
to debug what an app has actually stored: which state types exist,
which actors of a type exist, and what a single actor currently holds.

Use it whenever the question is about _runtime state_ rather than
code — e.g. "did `create` actually persist this field?", "which
account IDs exist?", "what does actor `alice` look like right now?".
It does not modify anything; it only reads.

> This skill **inspects** a running app; it does not start one. To
> bring an app up first, see the [run skill](../run/SKILL.md). To
> change what an app stores, see the
> [python skill](../python/SKILL.md).

## The three operations

```sh
# 1. List the application's registered state types (full names).
rbt inspect type list --application-url=<url>

# 2. List the known state IDs (actor IDs) for one type.
rbt inspect state list --type=<full.Type.Name> --application-url=<url>

# 3. Print a single actor's state as JSON.
rbt inspect state get --type=<full.Type.Name> --id=<state-id> \
  --application-url=<url>
```

The usual flow is to drill down: `type list` to discover the exact
type name to pass to `--type`, then `state list` to find the
`--id`, then `state get` to dump that actor.

- `--type` takes the **full, package-qualified** type name exactly as
  `type list` prints it (e.g. `bank.v1.Account`, `tests.reboot.Echo`)
  — not the bare Python class name.
- `--id` is the actor's state ID: the same string you pass to
  `<Type>.ref(id)` / `<Type>.create(context, id, ...)`.
- `state get` prints the state as a JSON object. Pipe it to `jq` or a
  file like any other JSON.

## Connecting: `--application-url` and `--admin-credential`

Both flags match `rbt export` / `rbt import` (see
`../python/references/lifecycle-reboot-cloud.md`).

- `--application-url` is the app's API URL — **not** the `/__/inspect`
  page URL. It is the address printed as **"Your API is available
  at:"** when the app starts.
  - **Local dev:** the URL `rbt dev run` prints (e.g.
    `http://localhost:9991`).
  - **Reboot Cloud:** the URL `rbt cloud up` prints (e.g.
    `https://<application-id>.prod1.rbt.cloud:9991`).
- `--admin-credential` is the app's admin secret, stored under the
  `SECRET_REBOOT_ADMIN_TOKEN` secret.
  - **Local dev:** defaults to `dev`, so you can omit it.
  - **Reboot Cloud:** required — pass the value you set for
    `SECRET_REBOOT_ADMIN_TOKEN` (see
    `../python/references/lifecycle-secrets.md`).

### Examples

Against a local `rbt dev run` backend (admin credential defaults to
`dev`):

```sh
rbt inspect type list --application-url=http://localhost:9991

rbt inspect state list \
  --type=bank.v1.Account \
  --application-url=http://localhost:9991

rbt inspect state get \
  --type=bank.v1.Account --id=alice \
  --application-url=http://localhost:9991
```

Against a deployed Reboot Cloud app (admin credential required):

```sh
rbt inspect state get \
  --type=bank.v1.Account --id=alice \
  --application-url=https://<application-id>.prod1.rbt.cloud:9991 \
  --admin-credential="$SECRET_REBOOT_ADMIN_TOKEN"
```

## Notes

- **Read-only.** `rbt inspect` never mutates state; it is safe to run
  against production.
- **`state get` routes to the actor's host automatically**, even in a
  multi-server deployment, and reassembles large states transparently.
- **Pipeable output.** `type list` and `state list` print one entry
  per line; `state get` prints a single JSON object. None of it is
  colorized when the output is not a TTY, so it composes with `grep`,
  `jq`, etc.
- **Web equivalent.** The `/__/inspect` page (linked from `rbt dev run` and `rbt cloud up` output) shows the same state plus recent
  calls in a browser; `rbt inspect` is the CLI counterpart.
