---
title: Lay Out a Reboot Backend Test Suite
impact: MEDIUM
impactDescription: Without correct layout and pytest paths, generated `_rbt` modules and servicers can't be imported by tests
tags: testing, pytest, layout, pyproject, conftest, uv
---

## Lay Out a Reboot Backend Test Suite

> **Critical:** Reboot tests are plain `unittest.IsolatedAsyncioTestCase`
> classes discovered by `pytest`. They do **not** need `pytest-asyncio`
> — `IsolatedAsyncioTestCase` runs `async def` test methods natively
> via the `unittest` runner that `pytest` falls back to.

This reference covers the project-level scaffolding that every Reboot
backend test suite shares. The in-test patterns (booting `Reboot()`,
creating contexts, mocking, etc.) live in
[testing-harness.md](testing-harness.md) and
[testing-external-context.md](testing-external-context.md).

## Where Tests Live

The convention is **one test file per servicer**, in
`backend/tests/`:

```
<app>/
├── backend/
│   ├── api/                  # Generated `_rbt` modules.
│   ├── src/
│   │   └── servicers/
│   │       └── chat_room.py
│   ├── tests/
│   │   ├── chat_room_servicer_test.py
│   │   └── conftest.py       # Optional, see below.
│   └── .pytest.ini
├── api/                      # `*.py` pydantic API definitions.
└── pyproject.toml
```

Test files end in `_test.py` so `pytest`'s default discovery picks
them up. The class name convention is `Test<Servicer>` or
`<Servicer>Test`; either is fine.

For apps with cross-servicer flows (e.g. a checkout that touches a
cart and an order), a single `full_<app>_test.py` that boots all
servicers in one `Application(...)` is also a valid layout.

## `.pytest.ini` — Make Generated Modules Importable

Generated Reboot modules live under `api/` and your servicer code
lives under `src/` (or `backend/src/`). Tests `import` from both —
e.g. `from chat_room.v1.chat_room_rbt import ChatRoom` resolves into
`api/` and `from chat_room_servicer import ChatRoomServicer`
resolves into `src/`. Add both to the `pythonpath` so neither
needs a `pip install -e .`:

```ini
# backend/.pytest.ini
[pytest]
pythonpath=
  src/
  api/
```

If the layout uses `backend/src` from the project root instead of
running pytest from `backend/`, adjust the paths accordingly (e.g.
`pythonpath = backend/src backend/api`).

## `conftest.py` — Only When Needed

Most Reboot apps don't need a `conftest.py`. Add one only when a
module imported by tests **eagerly** instantiates something that
requires an environment variable — typically an LLM provider that
constructs a client at import time. Set a placeholder so the import
succeeds; tests must still mock the real call before any RPC fires:

```python
# backend/tests/conftest.py
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-placeholder")
```

Avoid putting fixtures or hooks here unless you actually need them
across multiple test files — Reboot tests rely on
`asyncSetUp`/`asyncTearDown` rather than pytest fixtures.

## Dev Dependencies

Add `pytest` to the dev-dependency section of your `pyproject.toml`.
Do **not** add `pytest-asyncio` — `IsolatedAsyncioTestCase` handles
async test methods on its own, and adding `pytest-asyncio` can
conflict with that path.

```toml
# pyproject.toml
[project]
requires-python = ">= 3.10"
dependencies = [
    "reboot==<your-pinned-version>",
]

[tool.rye]
dev-dependencies = [
    "mypy==<pinned>",
    "pytest>=7.4.2",
    "types-protobuf>=4.24.0.20240129",
    "reboot==<your-pinned-version>",
]
```

For `uv`-managed projects, the equivalent section is
`[dependency-groups]` with a `dev = [...]` list, or
`[tool.uv.dev-dependencies]`.

## Running Tests

From the application root:

```bash
# Whole suite.
cd backend && uv run pytest

# Single test file.
cd backend && uv run pytest tests/chat_room_servicer_test.py

# Single test method.
cd backend && uv run pytest \
    tests/chat_room_servicer_test.py::TestChatRoom::test_chat_room

# Verbose, with print() output flowing to the terminal.
cd backend && uv run pytest -v -s
```

## Don't Construct Servicer Instances Directly

The #1 trap for new Reboot test authors is calling
`ChatRoomServicer().send(...)` directly. That bypasses identity,
context, persistence, and authorization — it tests literally
nothing the framework does. Always boot a harness and call through
`Service.ref(id).method(context, ...)`. See
[testing-harness.md](testing-harness.md) for the canonical pattern.
