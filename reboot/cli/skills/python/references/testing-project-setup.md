---
title: Lay Out a Reboot Backend Test Suite
impact: MEDIUM
impactDescription: Without `reboot[dev]`, the pytest paths, and the git-ignore, the built-in steps are missing, generated `_rbt` modules can't be imported, and recordings get committed
tags: testing, pytest, layout, pyproject, conftest, uv, reboot-dev, gitignore, recordings
---

## Lay Out a Reboot Backend Test Suite

> **Critical:** a Reboot application's tests are Gherkin `.feature`
> files in `tests/` at the project root, run by `reboot.bdd` through
> `pytest`.
> The built-in steps come with the `reboot[dev]` extra, which a
> development environment always installs; without it the scenarios
> have no steps and `rbt dashboard` refuses to start. No
> `pytest-asyncio`: `reboot.bdd` and `IsolatedAsyncioTestCase` run
> `async def` code on their own.

This reference covers the project-level scaffolding every Reboot
backend test suite shares. Writing the scenarios is
[testing-features.md](testing-features.md); driving the web app from
them is [testing-web-app.md](testing-web-app.md); the harness and
context patterns a custom step or a harness test uses are
[testing-harness.md](testing-harness.md) and
[testing-external-context.md](testing-external-context.md).

## Where Tests Live

**One `.feature` file per capability, one test module per
application configuration**, in `tests/` at the project root, next
to `api/` and `backend/`. The tests are the application's, not the
backend's: a scenario that opens the web app drives the frontend too.

```
<app>/
├── api/                      # `*.py` pydantic API definitions.
├── backend/
│   ├── api/                  # Generated `_rbt` modules.
│   └── src/
│       └── servicers/
│           └── chat_room.py
├── tests/
│   ├── posting.feature           # One feature per capability.
│   ├── moderation.feature
│   ├── chat_room_test.py         # `application` fixture + `scenarios(...)`.
│   ├── web_test.py               # The scenarios that open the web app.
│   ├── posting.recordings/       # Made by running; git-ignored.
│   └── conftest.py               # Optional, see below.
├── .gitignore                # Includes `*.recordings/`.
├── pytest.ini                # `testpaths` and `pythonpath`, see below.
└── pyproject.toml
```

- A feature file is named for the activity (`transfers.feature`),
  not for a state type.
- A test module ends in `_test.py` so `pytest` picks it up, defines
  the `application` fixture returning the `Application(...)` its
  scenarios run against, and calls `scenarios('a.feature', 'b.feature')` from `reboot.bdd`. One module per way of configuring
  the application: with authorizers, with a scheduled job turned
  off, with a scripted LLM, with the web app served. The minimal
  module is in [testing-features.md](testing-features.md).
- A crash-and-recover test
  ([testing-failure-recovery.md](testing-failure-recovery.md)) is
  an `IsolatedAsyncioTestCase` in its own `_test.py` module.

## `pytest.ini` — Make Generated Modules Importable

Generated Reboot modules live under `backend/api/` and your servicer
code under `backend/src/`. Tests `import` from both —
e.g. `from chat_room.v1.chat_room_rbt import ChatRoom` resolves into
`backend/api/` and `from chat_room_servicer import ChatRoomServicer`
resolves into `backend/src/`. A project-root `pytest.ini` puts both
on the `pythonpath` so neither needs a `pip install -e .`, and names
the test directory so a bare `pytest` runs the suite:

```ini
# pytest.ini
[pytest]
testpaths = tests
pythonpath =
  backend/src
  backend/api
  api
```

**Three entries, not two.** `backend/src` and `backend/api` cover
your servicers and the generated `_rbt` modules, but tests also
import the hand-written API definition itself — the typed errors and
models — as `from <pkg>.v1.<name> import QuotaExceededError`, and
that module lives in the project-root `api/` directory. Leave `api`
out and the suite fails at import with
`ModuleNotFoundError: No module named '<pkg>.v1.<name>'`, which
looks like a codegen failure but is a path problem.

## `conftest.py` — Only When Needed

Most Reboot apps don't need a `conftest.py`. Add one only when a
module imported by tests **eagerly** instantiates something that
requires an environment variable — typically an LLM provider that
constructs a client at import time. Set a placeholder so the import
succeeds; tests must still mock the real call before any RPC fires:

```python
# tests/conftest.py
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-placeholder")
```

Put a fixture here only when several test modules share it. A
stand-in for a model or a dependency is an autouse fixture in the
one test module whose scenarios use it, since a module's scenarios
share its fixtures ([testing-features.md](testing-features.md)).

## Dev Dependencies

Add `reboot[dev]`, at the same pin as `reboot`, and `pytest` to the
dev-dependency section of your `pyproject.toml`. An application
whose scenarios open its web app also needs `playwright` and
`pytest-playwright` (and `uv run playwright install chromium`
once). Do **not** add `pytest-asyncio`: `reboot.bdd` runs its steps
on the harness's event loop, `IsolatedAsyncioTestCase` handles its
own, and `pytest-asyncio` conflicts with both.

```toml
# pyproject.toml
[project]
name = "my-app"
version = "0.1.0"
requires-python = ">= 3.10"
dependencies = [
    "reboot==<your-pinned-version>",
]

[dependency-groups]
dev = [
    "reboot[dev]==<your-pinned-version>",
    "mypy==<pinned>",
    "pytest>=7.4.2",
    "playwright>=1.55.0",           # Only with web app scenarios.
    "pytest-playwright>=0.7.1",     # Only with web app scenarios.
    "types-protobuf>=4.24.0.20240129",
]
```

`reboot[dev]` carries what `reboot.bdd` and the dashboard's Features
page run on, and registers the built-in steps as a pytest plugin, so
no test module imports them. `uv sync` installs the `dev` group by
default (it's a uv default group), so `uv run pytest`,
`uv run mypy backend/ tests/`, and `uv run rbt dashboard` just work.
`[tool.uv.dev-dependencies]` is an accepted alias for the same list.
An application packaged for `rbt serve` installs plain `reboot`.

## `.gitignore` — Recordings Are Made, Not Committed

Running a scenario that opens the web app records a video and
screenshots into `<feature>.recordings/` beside the feature file
([testing-web-app.md](testing-web-app.md)). The project-root
`.gitignore` (template in
[lifecycle-project-setup.md](lifecycle-project-setup.md)) must have:

```gitignore
# Recordings of browser scenarios, made by running the tests.
*.recordings/
```

Check that line is present whenever adding the first web app
scenario to a project.

## Running Tests

From the application root:

```bash
# Whole suite.
uv run pytest

# One test module (the feature files it runs).
uv run pytest tests/chat_room_test.py

# One scenario, by (part of) its name.
uv run pytest -k "posts a message"

# What is being worked on, or everything but.
uv run pytest -m wip
uv run pytest -m "not wip"

# Verbose, with print() output flowing to the terminal.
uv run pytest -v -s
```

A `@blocked` scenario is skipped, with its description as the reason,
so it shows in the summary without failing the suite.

## Don't Construct Servicer Instances Directly

The #1 trap for new Reboot test authors is calling
`ChatRoomServicer().send(...)` directly, in a custom step or a
harness test. That bypasses identity, context, persistence, and
authorization — it tests literally nothing the framework does. The
built-in steps call through the application; a custom step does the
same with `world.context(user)` and
`Service.ref(id).method(context, ...)`
([testing-features.md](testing-features.md)), and a harness test
with `rbt.create_external_context(...)`
([testing-harness.md](testing-harness.md)).
