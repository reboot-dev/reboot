#!/bin/bash

# Type-checks and builds this example's frontend end-to-end: it
# installs the project's JavaScript dependencies overlaid with the
# locally built Reboot npm packages, generates the typed Reboot
# client from the example's own `.rbtrc` using the `rbt` CLI, and
# runs the frontend's real `npm run build:web` (`tsc` and a Vite
# production build).

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# The harness copies the whole example into a sandbox and runs us
# from its root, where the top-level `.rbtrc`, `api/`, and
# `package.json` live. We generate from here and only later build
# the frontend, which lives under `frontend/web/`.
ls -l .rbtrc package.json frontend/web/index.html 2> /dev/null > /dev/null || {
  echo "ERROR: could not find the example's files. Invoke this from"
  echo "the example's root. Current working directory is '$(pwd)'."
  exit 1
}

# Install the project's JavaScript dependencies (the example is a
# TypeScript project, so the `rbt` CLI comes from the
# `@reboot-dev/reboot` npm package). In a Bazel test we overlay the
# locally built Reboot npm packages with `--no-save` so the check
# exercises the in-repo client rather than a published release;
# `npm install` still resolves the rest (React, Vite, ...) from
# `package.json`.
if [[ -n "${REBOOT_NPM_PACKAGE:-}" ]]; then
  # The `rbt` CLI bootstraps a Python venv from the wheel named
  # by `REBOOT_WHL_FILE`, which must be an absolute path.
  REBOOT_WHL_FILE="${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
  npm install --no-save \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}"
else
  npm install
fi

# When running in a Bazel test, our `.rbtrc` file ends up in a very
# deep directory structure, which can result in "path too long"
# errors from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# Generate the clients from the example's `.rbtrc`. The frontend
# imports the generated `frontend/api/` modules, so this must run
# before the type check.
npx rbt $RBT_FLAGS generate

# Run the frontend's real build command, so we exercise the exact
# command a developer runs.
npm run build:web
