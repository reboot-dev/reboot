#!/bin/bash

# Checks that an application whose APIs share Pydantic models, defined
# in files without an `api` of their own, works end-to-end: the code
# `rbt generate` produces for it imports (`rbt dev run`), type checks
# (`mypy` and `tsc`), and carries the shared models at runtime
# (`pytest`).

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

ls -l .rbtrc pyproject.toml frontend/package.json 2> /dev/null > /dev/null || {
  echo "ERROR: could not find the application's files. Invoke this"
  echo "from the application's root. Current working directory is"
  echo "'$(pwd)'."
  exit 1
}

# Use the published Reboot pip package by default, but allow the test
# system to override it with a different value.
if [[ -n "${REBOOT_WHL_FILE:-}" ]]; then
  uv add --no-sync "reboot[dev] @ ${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
fi

# Force a fresh virtualenv: a pre-existing `.venv/` has its original
# creation path baked into its `activate` script and console-script
# shebangs, which breaks them when the virtualenv is used from a
# different location.
rm -rf .venv
uv sync
source .venv/bin/activate

# When running in a Bazel test, our `.rbtrc` file ends up in a very
# deep directory structure, which can result in "path too long" errors
# from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

rbt $RBT_FLAGS generate

mypy backend/

pytest

# Ensure that the backend can start up.
rbt $RBT_FLAGS dev run --terminate-after-health-check

# Type check the frontend, including every generated file. In a Bazel
# test we overlay the locally built Reboot npm packages so that the
# check exercises the in-repo client rather than a published release.
cd frontend
if [[ -n "${REBOOT_NPM_PACKAGE:-}" ]]; then
  npm install --no-save \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_API_PACKAGE}"
else
  npm install
fi

npm run type-check
