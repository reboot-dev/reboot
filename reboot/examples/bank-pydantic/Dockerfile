# Dockerfile for deploying bank-pydantic to Reboot Cloud.
#
# Prerequisite: run `cd frontend && npm install && npm run build`
# locally before `docker build`, so that `frontend/dist/` holds the
# bundled web SPA and MCP UIs. This image copies that prebuilt bundle
# instead of installing Node and rebuilding it here; `frontend/` also
# carries a React Native (`mobile/`) workspace, whose toolchain the
# server image has no use for.
FROM ghcr.io/reboot-dev/reboot-base:1.6.0

WORKDIR /app

# First ONLY copy and install the dependencies, so that changes to
# the application code don't force a re-install of all dependencies.
# `pip` can't read `uv.lock` directly, so use `uv` itself to export it
# to `requirements.txt` format.
#
# This image is for testing a Reboot release before it is published:
# the only dependency in `uv.lock` is Reboot itself, which the base
# image already provides at the version under test, and installing
# from the lockfile would look for that version on PyPI, where it does
# not exist yet. So the install step stays disabled until the release
# is published.
COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
# RUN uv export --frozen --no-dev --no-emit-project \
#     --format requirements-txt -o requirements.txt \
#     && pip install -r requirements.txt

# Next, copy the API definition and generate Reboot code. This step is
# also separate so it is only repeated if the `api/` code changes.
COPY api/ api/
COPY .rbtrc .rbtrc

# Run the Reboot code generators. We did copy all of `api/`, possibly
# including generated code, but it's not certain that `rbt generate`
# was run in that folder before this build was started.
RUN rbt generate

# Now copy the rest of the source code.
COPY backend/src/ backend/src/

# Copy the prebuilt web bundle, which `rbt serve run` serves from disk
# via the `--frontend-dist-path` in `.rbtrc`. Building it needs the
# matching `@reboot-dev/*` npm packages, which are also unpublished
# while testing a release, so this layer stays disabled too: the
# backend, MCP, and `/__/inspect` all work without it, and the web
# app simply 404s.
# COPY frontend/dist/ frontend/dist/

# Start the Reboot production runtime. `rbt serve run` reads its flags
# (`--python`, `--application=...`, `--application-name=...`,
# `--frontend-dist-path=...`, `--tls=external`) from `.rbtrc`, and
# picks `--port` up from the `PORT` env var set by Reboot Cloud.
CMD ["rbt", "serve", "run"]
