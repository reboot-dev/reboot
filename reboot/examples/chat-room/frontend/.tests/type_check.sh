#!/bin/bash

# Type-checks and builds this example's frontend end-to-end: it
# generates the typed Reboot client from the example's own `.rbtrc`
# using the `rbt` CLI, installs the frontend's JavaScript
# dependencies overlaid with the locally built Reboot npm packages,
# and runs the frontend's real `npm run build` (lint, `tsc`, and a
# Vite production build).

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# The harness copies the whole example into a sandbox and runs us
# from its root, where the top-level `.rbtrc`, `api/`, and
# `pyproject.toml` live. We generate from here and only
# `cd frontend` later, for the type check.
ls -l .rbtrc pyproject.toml frontend/package.json 2> /dev/null > /dev/null || {
  echo "ERROR: could not find the example's files. Invoke this from"
  echo "the example's root. Current working directory is '$(pwd)'."
  exit 1
}

# Set up the Python environment: the example is a Python project, so
# we generate with the Python `rbt`, which reads the example's own
# `.rbtrc` and emits the Python and React clients in one pass — the
# React one into `frontend/api/`. In a Bazel test we install the
# locally built wheel over the pinned version.
if [[ -n "${REBOOT_WHL_FILE:-}" ]]; then
  uv add --no-sync "${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
fi

# Force a fresh virtualenv. A pre-existing `.venv/` has its original
# creation path baked into its `activate` script and console-script
# shebangs, which breaks them when the venv is used from a different
# location; `uv sync` alone can't repair a relocated venv. Nuking
# and re-syncing guarantees the venv lives at the current path.
rm -rf .venv
uv sync
source .venv/bin/activate

# When running in a Bazel test, our `.rbtrc` file ends up in a very
# deep directory structure, which can result in "path too long"
# errors from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# Generate the clients from the example's `.rbtrc`. The frontend
# imports the generated `frontend/api/` modules, so this must run
# before the type check.
rbt $RBT_FLAGS generate

# Install the frontend's JavaScript dependencies. In a Bazel test we
# overlay the locally built Reboot npm packages with `--no-save` so
# the check exercises the in-repo client rather than a published
# release; `npm install` still resolves the rest (React, Vite, ...)
# from `package.json`.
cd frontend
if [[ -n "${REBOOT_NPM_PACKAGE:-}" ]]; then
  npm install --no-save \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_API_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_REACT_PACKAGE}"
else
  npm install
fi

# Run the frontends' real build commands, so we exercise the exact
# commands a developer runs. `npm run build` builds the `web/`
# workspace; the non-React web app is its own workspace and builds
# separately.
npm run build
npm run build --workspace reboot-non-react-web
