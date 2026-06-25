#!/bin/bash

# Builds the React Native (Expo) front end of the `chat-room` example
# end-to-end: it generates the typed Reboot clients from the example's
# own top-level `.rbtrc` using the `rbt` CLI, installs the mobile app's
# JavaScript dependencies overlaid with the locally built Reboot npm
# packages, and type-checks the app against the generated mobile
# client. This guards that the `@reboot-dev/reboot-react`/
# `@reboot-dev/reboot-web` client keeps building and type-checking under
# React Native's toolchain. The runtime React Native API compatibility
# itself is covered by the fast
# unit suite at `tests/reboot/web/test_react_native`.

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# The harness copies the whole `chat-room` example into a sandbox and
# runs us from its root, where the top-level `.rbtrc`, `api/`, and
# `pyproject.toml` live. We generate from here and only `cd mobile`
# later, for the type check.
ls -l .rbtrc pyproject.toml mobile/src/App.tsx 2> /dev/null > /dev/null || {
  echo "ERROR: could not find the 'chat-room' example files. Invoke this"
  echo "from the 'chat-room' example root. Current working directory is"
  echo "'$(pwd)'."
  exit 1
}

# Set up the Python environment. chat-room is a Python project, so we
# generate with the Python `rbt`: it carries every `rbt generate`
# plugin and reads the example's own top-level `.rbtrc` directly,
# emitting the Python, React, web, and React Native (mobile) clients in
# one pass — the mobile one into `mobile/src/api/` per `--mobile=...`.
# In a Bazel test we install the locally built wheel over the pinned
# version.
if [[ -n "${REBOOT_WHL_FILE:-}" ]]; then
  uv add --no-sync "${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
fi

# Force a fresh virtualenv. A pre-existing `.venv/` has its original
# creation path baked into its `activate` script and console-script
# shebangs, which breaks them when the venv is used from a different
# location; `uv sync` alone can't repair a relocated venv. Nuking and
# re-syncing guarantees the venv lives at the current path.
rm -rf .venv
uv sync
source .venv/bin/activate

# When running in a Bazel test, our `.rbtrc` file ends up in a very
# deep directory structure, which can result in "path too long" errors
# from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# Generate every client from the top-level `.rbtrc`. `App.tsx` imports
# the generated `chat_room_rbt_react` module under `mobile/src/api/`,
# so this must run before the type check.
rbt $RBT_FLAGS generate

# Install the mobile app's JavaScript dependencies (Expo, React Native,
# and the Reboot React client the generated code imports). In a Bazel
# test we overlay the locally built Reboot npm packages with
# `--no-save` so the test exercises the in-repo client rather than a
# published release; `npm install` still resolves the rest (Expo, React
# Native, ...) from `package.json`.
cd mobile
if [[ -n "${REBOOT_NPM_PACKAGE:-}" ]]; then
  npm install --no-save \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}"
else
  npm install
fi

# Type-check the app against the generated client. This is the React
# Native "can it build" check: it compiles `src/App.tsx` against the
# generated client, the local Reboot packages, and the Expo/React
# Native type definitions.
npx tsc --noEmit
