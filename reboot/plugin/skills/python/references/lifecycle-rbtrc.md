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

**Correct (line-based, matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example's `.rbtrc`):**

```sh
# Find '.proto' files in 'api/'.
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

## Named Configs

A `<subcommand>:<config>` line only applies when `--config=<config>` is on
the command line:

```sh
# Default config (HMR / Vite).
dev run --default-config=hmr
dev run:hmr --mcp-frontend-host=http://localhost:4444

# Dist mode (no Vite).
dev run:dist --mcp-frontend-host=""
```

Run with `rbt dev run` (uses `--default-config=hmr`) or
`rbt dev run --config=dist` to switch.
