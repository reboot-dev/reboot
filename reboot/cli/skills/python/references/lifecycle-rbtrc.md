---
title: Configure `.rbtrc` Correctly
impact: CRITICAL
impactDescription: `rbt generate` and `rbt dev run` won't find files without correct config
tags: rbtrc, config, generate, dev, expunge, application-name
---

## Configure `.rbtrc` Correctly

> **Critical:** line-based, **not YAML** — each line is `<subcommand> <flag>`. On `reboot>=1.0.4`, `dev run --application-name=<app>` is the canonical persistence flag. `--name=<app>` still works as a deprecated alias and prints a console warning recommending the rename — agents writing fresh `.rbtrc` should use `--application-name`.

`.rbtrc` is the per-project config for the `rbt` CLI. Its format is
**line-based, not YAML**: each line is `<subcommand> <flag>` (or
`<subcommand>:<config> <flag>` for named configs). Comments start with `#`.

**Incorrect (YAML-style):**

```yaml
# DON'T — .rbtrc is not YAML.
generate:
  python: backend/api/
  react: web/src/api
dev:
  run:
    application: backend/src/main.py
    python: true
```

**Correct (line-based, matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example's `.rbtrc`):**

```sh
# Find API definition files in 'api/'.
generate api/

# Tell `rbt` where to output its generated files.
generate --python=backend/api/
generate --react=web/src/api
generate --web=web/src/api

# Watch source files during `rbt dev run`.
dev run --watch=backend/api/**/*.py
dev run --watch=backend/src/**/*.py

# Tell `rbt` that this is a Python application.
dev run --python

# Save state between `rbt dev run` restarts.
dev run --application-name=chat-room
dev expunge --application-name=chat-room

# Load secrets from a git-ignored env file (see "`--env-file` Loads
# Secrets" below).
dev run --env-file=.env

# Run the application!
dev run --application=backend/src/main.py
```

## `--application-name` Persists State Across Restarts

The value passed to `dev run --application-name=<name>` keys the state
that survives between `rbt dev run` restarts. Use the same value for
`dev expunge --application-name=<name>` so a single command resets that
state.

## `--application-name` vs. `--name`

`--application-name` is the canonical flag on `reboot>=1.0.4`. The
older `--name` was renamed for clarity; `--name` still works as a
deprecated alias but prints a console warning on every `rbt dev run`:

```text
WARNING: `--name` has been renamed to `--application-name`; please
update your `.rbtrc`.
```

Treat the warning as real — when writing fresh `.rbtrc` (or fixing
an old one), use `--application-name=<name>`. Don't be fooled by
older skill examples or third-party tutorials that still show
`--name`.

## `--env-file` Loads Secrets Into `rbt dev run`

`dev run --env-file=<path>` reads a file of `KEY=VALUE` lines and
sets each as an environment variable before launching the
application, so the app reads them with `os.environ`. It is the
recommended way to deliver secrets in local development: keep one
`.env` file, name it once in `.rbtrc`, and every `rbt dev run`
picks it up.

```sh
dev run --env-file=.env
```

- The file uses standard `.env` syntax (parsed by `python-dotenv`):
  `KEY=VALUE` lines, `#` comments, blank lines, optional `export `
  prefixes, and quoted values are all supported.
- `--env-file` is **only** available for `dev run` — not `rbt serve`
  or Reboot Cloud. Values passed with `--env=KEY=VALUE` override
  values from the file.
- A missing env file is a non-fatal warning, not an error — an app
  that needs no secrets yet can keep the `.rbtrc` line.
- Editing the env file while `rbt dev run` is running restarts
  the application automatically, so updated values take effect
  without a manual restart — just as editing a `--watch`ed
  source file does.

Keep the `.env` file out of git — add it to `.gitignore`. Full
secrets guidance — including Reboot Cloud — is in
`lifecycle-secrets.md`.

## `serve run` Lines: Production Config

`.rbtrc` also holds the flags for `rbt serve run` — the command the
Cloud image's `CMD ["rbt", "serve", "run"]` invokes, as well as any
on-prem `rbt serve` deploy. Same line-based syntax; one subcommand
per line:

```sh
serve run --python
serve run --application=backend/src/main.py
serve run --application-name=<app>
serve run --tls=external
```

Same `--application-name` value as the `dev run` lines — that name
keys state in both local dev and production. See
[`lifecycle-dockerfile.md`](lifecycle-dockerfile.md) for the full
production block (including when `--tls=external` is correct) and
[`lifecycle-reboot-cloud.md`](lifecycle-reboot-cloud.md) for the
deploy workflow.

`--env-file` is **dev-only** (see "`--env-file` Loads Secrets" above).
Production secrets are delivered via `rbt cloud secret set` — see
[`lifecycle-secrets.md`](lifecycle-secrets.md), or by the environment in
self-hosted `rbt serve` deployments.

## Named Configs

A `<subcommand>:<config>` line only applies when `--config=<config>` is on
the command line:

```sh
# Default config (HMR / Vite).
dev run --default-config=hmr
dev run --frontend-root-path=frontend

dev run:hmr --frontend-host=http://localhost:4444

# Dist mode (no Vite).
dev run:dist --frontend-dist-path=frontend/dist
```

Run with `rbt dev run` (uses `--default-config=hmr`) or
`rbt dev run --config=dist` to switch.
