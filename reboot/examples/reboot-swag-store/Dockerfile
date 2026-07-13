# syntax=docker/dockerfile:1.6

# ---------------------------------------------------------------------------
# Stage 1: install Python deps and generate Reboot API bindings.
#
# Produces two useful artifacts for later stages:
#   - `/app/.venv` — virtualenv with `rbt` and runtime deps.
#   - `/app/backend/api/` and `/app/frontend/api/` — generated Python
#      and TypeScript bindings from
#      `api/reboot_swag_store/v1/store.py`.
# ---------------------------------------------------------------------------
FROM ghcr.io/reboot-dev/reboot-base:1.3.0 AS backend

WORKDIR /app

# `uv` is the single source of truth for Python dependencies in this
# example (see `pyproject.toml` + `uv.lock`).
RUN pip install --no-cache-dir uv

# Install locked Python deps first, separate from the source, so code
# changes don't invalidate the dep-install layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Put the virtualenv's binaries (including `rbt`) first on PATH so
# subsequent RUN commands and the CMD resolve them directly.
ENV PATH="/app/.venv/bin:${PATH}"

# Generate Reboot code. Kept in its own layer so it only re-runs when
# the API definition or `.rbtrc` changes.
COPY api/ api/
COPY .rbtrc .rbtrc
RUN rbt generate

# ---------------------------------------------------------------------------
# Stage 2: build the web UIs.
#
# `rbt serve` serves MCP UI resources from
# `frontend/dist/mcp/<name>/index.html` (see `reboot.mcp.ui.ui_html`),
# so we need pre-built artifacts in the final image. The web UIs
# import the generated TS bindings at `frontend/api/`, which we pull
# from the backend stage above.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS web-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Overlay the freshly-generated TS bindings (ignored by `.gitignore`
# and `.dockerignore`, so the `COPY frontend/ ./` above doesn't
# include them).
COPY --from=backend /app/frontend/api ./api

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime. Extends the backend stage so `.venv`, `backend/api/`,
# and `.rbtrc` are already in place.
# ---------------------------------------------------------------------------
FROM backend AS runtime

COPY backend/src/ backend/src/
COPY --from=web-build /app/frontend/dist/ frontend/dist/

CMD ["rbt", "serve", "run"]
