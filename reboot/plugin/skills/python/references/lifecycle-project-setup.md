---
title: Set Up a Reboot Python Project
impact: CRITICAL
impactDescription: Project won't build or run without the right files in place
tags: project-setup, pyproject, python-version, dependencies, layout
---

## Set Up a Reboot Python Project

> **Critical:** the `api/` directory holds pydantic API definition
> files (`.py`); generated `*_rbt.py` lives under `backend/api/`.
> Never hand-edit a generated file. No `__init__.py` anywhere — not
> in `api/`, not under `backend/`.

A Reboot Python project has a fixed top-level layout. The CLI (`rbt`) reads
`.rbtrc` from the project root, `rbt generate` writes generated code into
`backend/<output>/`, and the application entry point lives in
`backend/src/main.py`.

**Incorrect (project missing required files / nonstandard layout):**

```
my-app/
  src/
    server.py        # arbitrary entry point
  schemas/           # nonstandard API definition location
    api.py
```

**Correct (canonical layout, matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example):**

```
my-app/
  .rbtrc                 # required: per-project rbt CLI config
  .gitignore             # required: see below
  .mypy.ini              # required: type-check config (see below)
  pyproject.toml         # required: Python deps
  api/                   # API definition root (referenced from .rbtrc)
    <pkg>/v1/<name>.py
  backend/
    api/                 # rbt generate --python output
    src/
      main.py            # application entry
      <name>_servicer.py # one Servicer per state machine
    tests/
      <name>_servicer_test.py
```

## `pyproject.toml`

Reboot supports Python 3.10+. The only required runtime dependency is
`reboot`. Use `uv` or `pip` — Reboot doesn't care.

```toml
[project]
name = "my-app"
version = "0.1.0"
requires-python = ">= 3.10"
dependencies = [
    "reboot==1.3.0",
]

[dependency-groups]
dev = [
    "mypy==1.18.1",
    "pytest>=7.4.2",
    "types-protobuf>=4.24.0.20240129",
]
```

`name` and `version` are required — `uv` refuses to sync without them.
There is **no `[build-system]` table**: that tells `uv` this is a
virtual (non-package) project — it installs the dependencies into
`.venv` but never tries to build/install the app itself. `uv sync`
installs the runtime deps plus the `dev` group (a uv default group)
in one shot; then `uv run mypy backend/` and `uv run pytest` use
that environment.

If an older project still has a `[tool.rye]` table (`dev-dependencies`,
`virtual = true`, `managed = true`), migrate it to this shape: move the
dev dependencies into `[dependency-groups].dev` (dropping any `reboot`
entry duplicated from the runtime deps), delete the `[tool.rye]` table,
add `name`/`version`, and replace `requirements*.lock` with `uv lock`.

## `.gitignore` — Keep Generated Files and Local State Out of Git (required)

Create a project-root `.gitignore` when scaffolding the project.
Reboot projects produce artifacts that must never be committed:
`rbt dev run` persists application state under `.rbt/`, `rbt generate` output is recreated from the API definitions on every run,
and `.env` holds secrets (see `lifecycle-secrets.md`).

```gitignore
# Reboot dev-server state.
.rbt/

# Generated code; recreated by `rbt generate`.
backend/api/
frontend/api/

# Secrets; see `lifecycle-secrets.md`.
.env

# Python virtual environment and caches.
.venv/
__pycache__/
*.py[cod]
.mypy_cache/
.pytest_cache/

# Frontend dependencies and build output (projects with a frontend).
node_modules/
frontend/dist/
```

Because the generated `backend/api/` (and `frontend/api/`) is
git-ignored, a fresh clone must run `rbt generate` before anything
imports or type-checks. `rbt dev run` regenerates automatically; CI
must run `rbt generate` explicitly.

## `.mypy.ini` — Type-Check Config (required)

Reboot generated modules (`backend/api/<pkg>/<v>/<name>_rbt.py`) and
your servicer code (`backend/src/`) have **no `__init__.py`** —
`protoc` doesn't emit them — so mypy can't resolve imports like
`from chat_room.v1.chat_room_rbt import ChatRoom` out of the box. A
project-root `.mypy.ini` fixes this by adding the source roots to
`mypy_path` and turning on `explicit_package_bases`. Without it,
`mypy backend/` fails with bogus "module not found" errors and the
type-check is useless. Create it at the project root, substituting
your API package name for `<pkg>` in the last stanza:

```ini
# .mypy.ini — documented at
#   https://mypy.readthedocs.io/en/stable/config_file.html
[mypy]
warn_unused_configs = True

# Find modules in our source tree (and tests). Since `protoc` doesn't
# generate `__init__.py` files, treat these as explicit package bases:
#   https://mypy.readthedocs.io/en/stable/running_mypy.html#mapping-file-paths-to-modules
mypy_path = backend/tests:backend/src:backend/api
explicit_package_bases = True

# Stricter than the default, but cheap to adhere to and high value.
check_untyped_defs = True
strict_equality = True

# gRPC stubs ship incomplete type info; don't flag them.
[mypy-google.api.*]
ignore_missing_imports = True
[mypy-google.rpc.*]
ignore_missing_imports = True
[mypy-grpc.*]
ignore_missing_imports = True
[mypy-grpc_status.*]
ignore_missing_imports = True

# The generated `*_rbt.py` for your API package is not hand-written;
# don't type-check it (you never edit it anyway). Repeat per package.
[mypy-<pkg>.v1.*]
ignore_errors = True
ignore_missing_imports = True
```

## Always Type-Check What You Write

After writing or changing any Python in `backend/`, run mypy from the
project root and fix every error before considering the work done —
the same way you'd run the tests. The generated `*_rbt.py` stubs are
fully typed, so mypy catches the mistakes that pass a glance (a field
set to the wrong type, a missing or misspelled keyword argument, a
method called with the wrong context type, a response field that
doesn't exist):

```bash
uv run mypy backend/   # or `mypy backend/`
```

A green mypy run plus passing `uv run pytest` (see
`testing-project-setup.md`) is the bar for "done."

## Do Not Create `__init__.py` — Anywhere

Adding `__init__.py` inside `api/` will confuse `rbt generate`'s
package detection. The `backend/` tree (`backend/api/`,
`backend/src/`, `backend/tests/`) doesn't need them either: the
`.mypy.ini` above resolves imports via `explicit_package_bases`, and
at runtime the interpreter resolves them via the `PYTHONPATH` that
`rbt` sets up. Resist the packaging reflex ("a directory of modules
should be a package") — a Reboot project contains no hand-written
`__init__.py` at all.

## Generated Code Lives Under `backend/`

`rbt generate` is configured in `.rbtrc` (see `lifecycle-rbtrc.md`). The
output goes into `backend/api/<pkg>/<v>/<name>_rbt.py`. Treat that file as
read-only — every regen overwrites it.
