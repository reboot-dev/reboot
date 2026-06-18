---
title: Project Shell — Chat-App Deltas
impact: CRITICAL
impactDescription: The shell files (`.rbtrc`, `pyproject.toml`, `.python-version`, `main.py`) wire the build, the dev server, the HMR routing, and the entry point — wrong shapes break either codegen or live reload before the app even boots.
tags: project, shell, rbtrc, pyproject, python-version, main, application-entry, hmr, dist
---

## Project Shell — Chat-App Deltas

The `python` skill covers the canonical project shape
(`lifecycle-project-setup.md`) and the `.rbtrc` format
(`lifecycle-rbtrc.md`). That shape includes a project-root
`.mypy.ini` (template in `lifecycle-project-setup.md`) — create it
when scaffolding; it has no chat-app delta. What an MCP Chat App
adds on top:

### `.python-version`

```
3.12
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

# Load secrets from a git-ignored env file. Put one KEY=VALUE line
# per secret in `.env`, and add `.env` to `.gitignore`. See
# `python/references/lifecycle-secrets.md`.
dev run --env-file=.env

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

# Production config used by `rbt serve run` (and therefore by Reboot
# Cloud, whose containers run `CMD ["rbt", "serve", "run"]` — see
# `python/references/lifecycle-dockerfile.md`). Mirrors the `dev run`
# block above, minus the dev-only knobs (`--watch`, `--env-file`,
# the `:hmr`/`:dist` configs).
serve run --python
serve run --application=backend/src/main.py
serve run --application-name=<project-name>
serve run --tls=external
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

[dependency-groups]
dev = [
    "mypy==1.18.1",
    "types-protobuf>=4.24.0.20240129",
]
```

### `example_prompts.py`

Every MCP Chat App ships a list of `ExamplePrompt`s — the
ready-to-send chat scenarios the root-page wizard offers users so
they can try the app the moment it's running. Keep them in their own
`backend/src/example_prompts.py` module so `main.py` stays a thin
entry point:

```python
from reboot.application import ExamplePrompt

example_prompts = [
    ExamplePrompt(
        title="Track your morning coffee",
        prompts=[
            "Create a new counter for tracking how many cups of "
            "coffee I drink today, and show me the counter.",
            "I just finished a cup — increment my coffee counter "
            "and show it to me again.",
        ],
    ),
    ExamplePrompt(
        title="Run a quick scoreboard",
        prompts=[
            "Create two counters, 'wins' and 'losses', for my "
            "board-game nights.",
            "I just won a game — show me the wins counter so I "
            "can bump it.",
            "List all my counters and their current values.",
        ],
    ),
]
```

`ExamplePrompt` (re-exported from `reboot.application`) has two
fields: `title`, a short human-readable label that is the example's
identity key — re-registering a prompt with the same `title`
replaces the existing entry; and `prompts`, the ordered list of
chat messages the user sends one per turn. A single example is a
**sequence** that walks an end-to-end flow through the app's MCP
tools (create something → act on it → view the result), not a single
isolated message. Write three or so examples that together exercise
the app's main user stories, phrased the way a real user would talk
to the chat client. Most prompts should end on a natural
"show me / open / view ..." turn that renders a `UI()` component
rather than only calling tool-only methods — see "Example Prompts"
in `SKILL.md` for the full rule. The counter set above does this
with its "…and show me the counter" / "show me the wins counter"
turns. See the worked set in
`public/reboot/examples/ai-chat-counter/backend/src/example_prompts.py`.

### `main.py`

Register all servicers (User + application types) and pass the
`example_prompts` through so the wizard can show them. Shape per
`python/references/lifecycle-application-entry.md`:

```python
import asyncio
import logging
from example_prompts import example_prompts
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
        title="Chat Counter",
        description=(
            "Lets a chat client create, list, increment, and "
            "show counters on your behalf."
        ),
        servicers=[UserServicer, CounterServicer],
        example_prompts=example_prompts,
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
```

`title` and `description` are also surfaced by the wizard, so set
both to something human-readable (`title` defaults to the
application name if omitted). A typical chat app has no `initialize`
hook — the auto-constructed `User` covers per-user setup and
application-type instances are created on demand by `User`'s
Transaction methods.

### State Is Durable

State survives restarts. `dev run --application-name=<name>` in
`.rbtrc` (above) is what makes that work — see
`python/references/lifecycle-rbtrc.md` (`--application-name` is
canonical on `reboot>=1.0.4`; the older `--name` still works as a
deprecated alias but warns). `uv run rbt dev expunge --application-name=<name>`
resets persisted state.
