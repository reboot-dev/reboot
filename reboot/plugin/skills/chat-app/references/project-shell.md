---
title: Project Shell — Chat-App Deltas
impact: CRITICAL
impactDescription: The shell files (`.rbtrc`, `pyproject.toml`, `.python-version`, `main.py`) wire the build, the dev server, the HMR routing, and the entry point — wrong shapes break either codegen or live reload before the app even boots.
tags: project, shell, rbtrc, pyproject, python-version, main, application-entry, hmr, dist
---

## Project Shell — Chat-App Deltas

The `python` skill covers the canonical project shape
(`lifecycle-project-setup.md`) and the `.rbtrc` format
(`lifecycle-rbtrc.md`). What an MCP Chat App adds on top:

### `.python-version`

```
3.10
```

### `.rbtrc`

Same shape as `python/references/lifecycle-rbtrc.md`. Chat
apps add `--default-config=hmr` plus `:hmr` and `:dist` named
configs that route Envoy to a Vite dev server (HMR) or a built
`web/dist/` (production):

```
# Find API definitions in 'api/'.
generate api/

# Tell `rbt generate` where to put generated files.
generate --python=backend/api/

# Generate React bindings for web apps (into "web/api/").
generate --react=web/api
generate --react-extensions

# Watch if any source files are modified.
dev run --watch=backend/**/*.py

# Tell `rbt` that this is a Python application.
dev run --python

# Save state between restarts.
dev run --application-name=<project-name>

# Run the application!
dev run --application=backend/src/main.py

# Default to HMR mode when no --config is specified.
dev run --default-config=hmr

# HMR: Vite dev server proxied through Envoy.
# Run Vite in a separate terminal: cd web && npm run dev
# Envoy routes "/__/web/**" to Vite for HMR support.
dev run:hmr --mcp-frontend-host=http://localhost:4444

# Dist mode: serve pre-built artifacts from "web/dist/" (no Vite HMR).
# Usage: uv run rbt dev run --config=dist
# Requires: cd web && npm run build
dev run:dist --mcp-frontend-host=""

# When expunging, expunge that state we've saved.
dev expunge --application-name=<project-name>
```

### `pyproject.toml`

The reboot-python `lifecycle-project-setup.md` covers the base shape.
Chat apps usually pull in a few extra runtime deps:

```toml
[project]
name = "<project-name>"
version = "0.1.0"
requires-python = ">= 3.10"
dependencies = [
    "httpx>=0.27,<1.0",
    "uuid7>=0.1.0",
    "anyio>=4.0.0",
    "reboot>=1.0.3",
]

[tool.rye]
dev-dependencies = [
    "mypy==1.18.1",
    "types-protobuf>=4.24.0.20240129",
    "reboot>=1.0.3",
]

virtual = true
managed = true
```

### `main.py`

Register all servicers (User + application types). Shape per
`python/references/lifecycle-application-entry.md`:

```python
import asyncio
import logging
from reboot.aio.applications import Application
from servicers.<name> import (
    CounterServicer,
    UserServicer,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


async def main() -> None:
    application = Application(
        servicers=[UserServicer, CounterServicer],
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
```

A typical chat app has no `initialize` hook — the auto-constructed
`User` covers per-user setup and application-type instances are
created on demand by `User`'s Transaction methods.

### State Is Durable

State survives restarts. `dev run --application-name=<name>` in
`.rbtrc` (above) is what makes that work — see
`python/references/lifecycle-rbtrc.md` (`--application-name` is
canonical on `reboot>=1.0.4`; the older `--name` still works as a
deprecated alias but warns). `uv run rbt dev expunge --application-name=<name>`
resets persisted state.
