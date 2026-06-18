---
title: Write a Reboot Cloud Dockerfile
impact: HIGH
impactDescription: Reboot Cloud rejects images that don't follow this layout; mistakes only surface on first deploy.
tags: dockerfile, deploy, rbt-cloud, base-image, codegen, dockerignore
---

## Write a Reboot Cloud Dockerfile

> **Critical:** three non-negotiables.
> (1) Base image is `ghcr.io/reboot-dev/reboot-base:<version>` with
> `<version>` matching the `reboot==<version>` pin in `pyproject.toml`
> / `requirements.lock`. (The version literal appears in exactly one
> place — the canonical Dockerfile below — so `make versions` can
> rewrite it.)
> (2) `CMD ["rbt", "serve", "run"]` — never `rbt dev run` in a Cloud
> image. All production flags live in `.rbtrc`'s `serve run` lines
> (see [`lifecycle-rbtrc.md`](lifecycle-rbtrc.md)).
> (3) Layer order is load-bearing: deps → schema + `.rbtrc` →
> `rbt generate` → (optional) web build → `backend/src/` → `CMD`.

## Canonical Backend-Only Dockerfile

For a Reboot Python app that does not bundle a web frontend (the
backend is the API server; any UI is deployed separately). Matches
[the `reboot-hello` example](https://github.com/reboot-dev/reboot-hello/blob/main/Dockerfile)
verbatim:

```dockerfile
FROM ghcr.io/reboot-dev/reboot-base:1.2.0

WORKDIR /app

# First ONLY copy and install the requirements, so that changes outside
# `requirements.txt` don't force a re-install of all dependencies.
COPY requirements.lock requirements.txt
RUN pip install -r requirements.txt

# Next, copy the API definition and generate Reboot code. This step is also
# separate so it is only repeated if the `api/` code changes.
COPY api/ api/
COPY .rbtrc .rbtrc

# Run the Reboot code generators. We did copy all of `api/`, possibly
# including generated code, but it's not certain that `rbt generate` was run in
# that folder before this build was started.
RUN rbt generate

# Now copy the rest of the source code.
COPY backend/src/ backend/src/

CMD ["rbt", "serve", "run"]
```

Four blocks: install deps from the lockfile, copy schemas + config and
run `rbt generate`, copy backend source, then run `rbt serve run` —
which reads everything else it needs from `.rbtrc`.

## Adding a Bundled Web Frontend (MCP / Chat Apps)

For an MCP or chat-style app where the Reboot backend is also the
static web server for an embedded UI artifact, add two layers between
`rbt generate` and the final `COPY backend/src/`:

```dockerfile
# After `COPY .rbtrc`, before `RUN rbt generate`:
COPY web/ web/

# Standard rbt codegen — generates `backend/api/` AND `web/api/`.
RUN rbt generate

# Build the React UIs into `web/dist/`. For MCP apps the Reboot app
# itself is also the static web server, so it needs these static
# assets.
RUN cd web && npm ci && npm run build

# Then the existing `COPY backend/src/ backend/src/` and `CMD ...`.
```

`COPY web/` lands **before** `RUN rbt generate` on purpose: the
generator writes fresh React bindings into `web/api/`, and if `web/`
were copied after, any stale local `web/api/` from a previous run
would clobber the freshly generated copy.

## Why the Layering Matters

Docker rebuilds from the first changed `COPY`/`RUN` downwards. Order
layers least- to most-frequently-changing:

1. `COPY requirements.lock requirements.txt` + `RUN pip install` —
   rebuilt only when dependencies change.
2. `COPY api/` + `COPY .rbtrc` + (for MCP) `COPY web/` — rebuilt when
   the API schema or `.rbtrc` (or web sources) change.
3. `RUN rbt generate` — runs whenever the previous layer changes.
4. (For MCP) `RUN cd web && npm ci && npm run build` — frontend build.
5. `COPY backend/src/` — rebuilt on every backend edit.
6. `CMD ["rbt", "serve", "run"]` — never invalidated.

A change to `backend/src/main.py` should only trigger steps 5 and 6.
Putting `COPY backend/src/` near the top defeats the cache and makes
every deploy reinstall dependencies.

## `.rbtrc` Carries the Production Config, Not the Dockerfile

`rbt serve run` reads its flags from `.rbtrc` (see
[`lifecycle-rbtrc.md`](lifecycle-rbtrc.md)). The Dockerfile's `CMD` is
exactly `["rbt", "serve", "run"]` with no extra arguments. The
production lines that need to be in `.rbtrc` for a Cloud deploy:

```sh
# Tell `rbt serve` this is a Python application.
serve run --python

# Entry point.
serve run --application=backend/src/main.py

# Persist state under this name (also used by `rbt cloud {up,down,logs}`).
serve run --application-name=<app>

# Reboot Cloud terminates TLS at the load balancer.
serve run --tls=external
```

Do not duplicate these on the `CMD` line — splitting truth across
`.rbtrc` and the Dockerfile makes the next deploy hard to debug.

## `.dockerignore`

Keep the build context small and the image clean. Two variants
matching the two Dockerfile patterns above; both derived from
[the `reboot-agent-wiki` example's `.dockerignore`](https://github.com/reboot-dev/reboot-agent-wiki/blob/main/.dockerignore).

**Backend-only** (no `web/` content makes it into the image):

```gitignore
# Python runtime caches and venv — rebuilt inside the image.
.venv/
__pycache__/
*.py[cod]
.mypy_cache/
.pytest_cache/

# Reboot runtime state (dev-only).
.rbt/

# Generated code — regenerated inside the image by `rbt generate`.
backend/api/

# No web frontend in this image.
web/

# VCS.
.git/
.gitignore

# Editor / OS.
.vscode/
.idea/
*.swp
.DS_Store

# Local-only files.
mcp_servers.json
README.md
```

**Bundled-web (MCP / chat app)** — keep `web/` sources the in-image
`npm ci && npm run build` needs, drop everything else under `web/`:

```gitignore
# Python runtime caches and venv — rebuilt inside the image.
.venv/
__pycache__/
*.py[cod]
.mypy_cache/
.pytest_cache/

# Reboot runtime state (dev-only).
.rbt/

# Generated code — regenerated inside the image.
backend/api/
web/api/

# Node deps + build output — rebuilt inside the image.
web/node_modules/
web/dist/

# VCS.
.git/
.gitignore

# Editor / OS.
.vscode/
.idea/
*.swp
.DS_Store

# Local-only files.
mcp_servers.json
README.md
```

## Common Gotchas

- `CMD ["rbt", "dev", "run"]` in a Cloud image. Dev defaults (no
  `--tls=external`, dev-mode auth warnings, watcher loops) are wrong
  for production. Always `serve run`.
- Base image version drifts from the `reboot==` pin. The base image
  bakes in a specific `rbt` CLI and runtime — a mismatch surfaces as
  obscure protocol or codegen errors on first deploy.
- Running `rbt generate` **before** `COPY web/` (for the bundled-web
  variant). The fresh `web/api/` bindings get clobbered by the stale
  local copy when `web/` is finally copied in. Follow the example's
  order.
- Putting production flags on the `CMD` line instead of in `.rbtrc`'s
  `serve run` config. It works, but truth is now split across two
  files and the next person who edits one of them won't know about
  the other.
- Hand-rolling a non-Reboot base image. Re-installing the `rbt` CLI
  correctly (matching version, correct binary location, system deps)
  is non-trivial. Use `ghcr.io/reboot-dev/reboot-base:<version>`.
- Missing `--application-name=<app>` in `.rbtrc`'s `serve run` line.
  Cloud uses it to identify the app across deploys; without it the
  first `rbt cloud up` succeeds but state-persistence semantics get
  surprising (`--name` is the deprecated alias and still warns — see
  [`lifecycle-rbtrc.md`](lifecycle-rbtrc.md)).
