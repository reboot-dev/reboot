#!/bin/bash
#
# This script will run all of the tests in the following directories:
all_application_folders=(
  "hello-constructors"
  "bank"
  "hello-legacy-grpc"
  "hello-tasks"
)

set -e # Exit if a command exits with an error.
set -u # In case of undefined variables, there must be a bug. Fail immediately.
set -x # Echo executed commands to help debug failures.

# Require `REBOOT_WHL_FILE` to have been passed; all tests calling this
# file should be explicit about a specific Reboot wheel file they've built.
echo "Using Reboot package '$REBOOT_WHL_FILE'"

# Run each of the tests, each in their own virtual environment, so that they
# can't influence each other.
function runPyTest () {
  application_folder=$1
  echo "######################### $application_folder #########################"

  pushd $application_folder

  # Compile protocol buffers.
  # TODO: how do we ensure that we're working with a clean slate here?
  rbt generate

  # Test.
  pytest backend/

  popd
}

# Install the `reboot` package from the specified path explicitly, over-
# writing the version from `pyproject.toml`.
uv add --no-sync "${SANDBOX_ROOT}$REBOOT_WHL_FILE"

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

for application_folder in "${all_application_folders[@]}"; do
  runPyTest $application_folder
done

# TODO: when relevant, add additional non-pytest tests here.
