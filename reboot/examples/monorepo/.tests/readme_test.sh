#!/bin/bash
#
# This test should fully cover the user experience of following
# the `README.md` through its "Test" step. Because it is not
# interactive, it cannot perfectly match the README.md.

set -e # Exit if a command exits with an error.
set -x # Echo executed commands to help debug failures.

# Use the published Reboot pip package by default, but allow the test system
# to override them with a different value.
if [ -n "$REBOOT_WHL_FILE" ]; then
  # Install the `reboot` package from the specified path explicitly, over-
  # writing the version from `pyproject.toml`.
  uv add --no-sync "${SANDBOX_ROOT}$REBOOT_WHL_FILE"
fi

# Force a fresh virtualenv. A pre-existing `.venv/` (e.g., carried
# over from a pre-baked image, or copied between containers/host
# paths during the dev-container test) has its original creation
# path baked into its `activate` script and console-script
# shebangs, which breaks them when the venv is used from a
# different location. `uv sync` only regenerates entry-point
# scripts for packages it reinstalls, so it can't repair a
# relocated venv. Nuking and re-syncing guarantees the venv lives
# at the current path, which makes it safe to `activate`.
rm -rf .venv
uv sync
source .venv/bin/activate

cd hello-constructors

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# Confirm that we can start up.
rbt $RBT_FLAGS dev run --terminate-after-health-check

# Test.
pytest backend/
