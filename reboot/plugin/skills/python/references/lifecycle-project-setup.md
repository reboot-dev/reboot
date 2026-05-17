---
title: Set Up a Reboot Python Project
impact: CRITICAL
impactDescription: Project won't build or run without the right files in place
tags: project-setup, pyproject, python-version, dependencies, layout
---

## Set Up a Reboot Python Project

> **Critical:** the `api/` directory holds API definition files
> (`.proto` or pydantic `.py`); generated `*_rbt.py` lives under
> `backend/api/`. Never hand-edit a generated file. No `__init__.py`
> inside `api/`.

A Reboot Python project has a fixed top-level layout. The CLI (`rbt`) reads
`.rbtrc` from the project root, `rbt generate` writes generated code into
`backend/<output>/`, and the application entry point lives in
`backend/src/main.py`.

**Incorrect (project missing required files / nonstandard layout):**

```
my-app/
  src/
    server.py        # arbitrary entry point
  protos/            # nonstandard proto location
    api.proto
```

**Correct (canonical layout, matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example):**

```
my-app/
  .rbtrc                 # required: per-project rbt CLI config
  pyproject.toml         # required: Python deps
  api/                   # proto root (referenced from .rbtrc)
    <pkg>/v1/<name>.proto
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
    "reboot==1.0.4",
]

[tool.rye]
dev-dependencies = [
    "mypy==1.18.1",
    "pytest>=7.4.2",
    "types-protobuf>=4.24.0.20240129",
    "reboot==1.0.4",
]
virtual = true
managed = true
```

## Do Not Create `__init__.py` Inside `api/`

The `api/` directory holds `.proto` files only. Adding `__init__.py` will
confuse `rbt generate`'s package detection.

## Generated Code Lives Under `backend/`

`rbt generate` is configured in `.rbtrc` (see `lifecycle-rbtrc.md`). The
output goes into `backend/api/<pkg>/<v>/<name>_rbt.py`. Treat that file as
read-only — every regen overwrites it.
