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
  rye remove --no-sync reboot
  rye remove --no-sync --dev reboot
  rye add --dev reboot --absolute --path=${SANDBOX_ROOT}$REBOOT_WHL_FILE
fi

# Create and activate a virtual environment.
rye sync --no-lock
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
