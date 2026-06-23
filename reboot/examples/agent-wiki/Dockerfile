# Dockerfile for deploying agent-wiki to Reboot Cloud.
#
# Prerequisite: run `cd web && npm install && npm run build`
# locally before `docker build` so that `web/dist/` contains the
# bundled UIs. This image copies that prebuilt bundle rather
# than installing Node and rebuilding it here.
FROM ghcr.io/reboot-dev/reboot-base:1.2.1

WORKDIR /app

# Install Python dependencies from the uv lockfile. `pip` can't
# read `uv.lock` directly, so `uv` exports it to
# `requirements.txt` format, which `pip` accepts. This
# layer is cached until the lockfile changes, so app-code edits
# don't trigger a re-install of the dependency tree. The base
# image already includes Reboot itself; the lockfile pins it to
# the matching version.
COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project \
    --format requirements-txt -o requirements.txt \
    && pip install -r requirements.txt

# Copy the API definition and `.rbtrc`, then generate Reboot
# code. Separate layer so regeneration only reruns when the
# API changes.
COPY api/ api/
COPY .rbtrc .rbtrc
RUN rbt generate

# Copy the backend source.
COPY backend/src/ backend/src/

# Copy the prebuilt web bundle.
COPY web/dist/ web/dist/

# Make the Pydantic API definitions in `api/` and the generated
# Reboot bindings in `backend/api/` both importable. They share
# the `agent_wiki.v1` namespace package, so both directories
# must be on `PYTHONPATH`. `rbt dev run --python` does this
# automatically; `rbt serve run --python` currently only adds
# the generated-code directory, so we set the path here.
ENV PYTHONPATH=/app/api:/app/backend/api

# Start the Reboot production runtime. `rbt serve run` reads
# its flags (`--python`, `--application=...`, `--name=...`,
# `--tls=external`) from `.rbtrc`. `--port` is picked up from
# the `PORT` env var set by Reboot Cloud.
CMD ["rbt", "serve", "run"]
