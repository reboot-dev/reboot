---
title: Set Up a Reboot Python Project
impact: CRITICAL
impactDescription: Project won't build or run without the right files in place
tags: project-setup, pyproject, python-version, dependencies, layout
---

## Set Up a Reboot Python Project

> **Critical:** the `api/` directory holds pydantic API definition
> files (`.py`); generated `*_rbt.py` lives under `backend/api/`.
> Never hand-edit a generated file. No `__init__.py` inside `api/`.

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
`reboot`. Use `rye`, `uv`, or `pip` — Reboot doesn't care.

```toml
[project]
requires-python = ">= 3.10"
dependencies = [
    "reboot==1.1.0",
]

[tool.rye]
dev-dependencies = [
    "mypy==1.18.1",
    "pytest>=7.4.2",
    "types-protobuf>=4.24.0.20240129",
    "reboot==1.1.0",
]
virtual = true
managed = true
```

## Do Not Create `__init__.py` Inside `api/`

The `api/` directory holds pydantic API definition files only. Adding
`__init__.py` will confuse `rbt generate`'s package detection.

## Generated Code Lives Under `backend/`

`rbt generate` is configured in `.rbtrc` (see `lifecycle-rbtrc.md`). The
output goes into `backend/api/<pkg>/<v>/<name>_rbt.py`. Treat that file as
read-only — every regen overwrites it.
