# Dockerfile for deploying chick-potle to Reboot Cloud.
#
# Prerequisite: run `cd web && npm install && npm run build`
# locally before `docker build` so that `web/dist/` contains the
# bundled UIs. This image copies that prebuilt bundle rather
# than installing Node and rebuilding it here.
FROM ghcr.io/reboot-dev/reboot-base:0.46.0

WORKDIR /app

# Install `uv` so we can install Python dependencies from the
# pinned `uv.lock`.
RUN pip install uv

# Copy only the dependency manifest and lock first so this
# layer is cached until they actually change. `--frozen`
# requires `uv.lock` to exactly match `pyproject.toml`, giving
# reproducible builds across machines.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# Copy the API definition and `.rbtrc`, then generate Reboot
# code. Separate layer so regeneration only reruns when the
# API changes.
COPY api/ api/
COPY .rbtrc .rbtrc
RUN uv run rbt generate

# Copy the backend source.
COPY backend/src/ backend/src/

# Copy the prebuilt web bundle.
COPY web/dist/ web/dist/

# Make the Pydantic API definitions in `api/` and the generated
# Reboot bindings in `backend/api/` both importable. They share
# the `ai_chat_food.v1` namespace package, so both directories
# must be on `PYTHONPATH`. `rbt dev run --python` does this
# automatically; `rbt serve run --python` currently only adds
# the generated-code directory, so we set the path here.
ENV PYTHONPATH=/app/api:/app/backend/api

# Start the Reboot production runtime. `rbt serve run` reads
# its flags (`--python`, `--application=...`, `--application-name=...`,
# `--tls=external`) from `.rbtrc`. `--port` is picked up from
# the `PORT` env var set by Reboot Cloud.
CMD ["uv", "run", "rbt", "serve", "run"]
