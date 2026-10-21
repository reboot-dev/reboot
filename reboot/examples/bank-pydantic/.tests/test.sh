#!/bin/bash

set -e # Exit if a command exits with an error.
set -x # Echo executed commands to help debug failures.

# MacOS tests can fail due to a race in `protoc` writing files to disk,
# so now we check only occurences of the expected lines in the output.
# See https://github.com/reboot-dev/mono/issues/3433
check_lines_in_file() {
  local expected="$1"
  local actual="$2"

  while IFS= read -r line; do
    if ! grep -Fxq "$line" "$actual"; then
      echo "Line $line is missing in the actual output."
      exit 1
    fi
  done < "$expected"
}

# Use the published Reboot pip package by default, but allow the test system
# to override them with a different value.
if [ -n "$REBOOT_WHL_FILE" ]; then
  # Install the `reboot` package from the specified path explicitly, over-
  # writing the version from `pyproject.toml`.
  uv add --no-sync "reboot[dev] @ ${SANDBOX_ROOT}$REBOOT_WHL_FILE"
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

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

rbt $RBT_FLAGS generate

mypy backend/ tests/

# The web app's scenarios start the frontend's Vite dev server, so
# install the frontend's npm packages, with the locally built Reboot
# packages in place of the published ones when the test system
# provides them.
pushd frontend
npm --version
if [ -n "${REBOOT_NPM_PACKAGE:-}" ]; then
  # The lockfile pins the published release, while the packages
  # provided are the unpublished one, so install without it, and with
  # npm 11, as on Linux: npm 10 crashes on this overlay of unpublished
  # packages ("Cannot read properties of null (reading 'edgesOut')").
  npx --yes npm@11 install --no-save --package-lock=false \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_STD_API_PACKAGE}"
else
  npm install
fi
popd

# The web app's scenarios drive the app in a browser, so install the
# one Playwright drives.
playwright install chromium

pytest

# Every browser scenario leaves its recording beside the feature file
# (see `reboot.bdd.recordings`): a video of each user's browser, named
# after them, and a screenshot after the step that opened the app for
# them and after each assertion step that drives it, named by the
# step's position among the scenario's own steps, counting from one.
# The scenarios pass without them, so check that each recording holds
# exactly the files its steps call for. Under a Bazel test the source
# tree is read only, so the recordings are laid out the same way under
# `TEST_UNDECLARED_OUTPUTS_DIR` instead.
check_recording() {
  local scenario="$1"
  shift
  local directories=("${TEST_UNDECLARED_OUTPUTS_DIR:-.}"/tests/"$scenario"/*/)
  if [ "${#directories[@]}" -ne 1 ] || [ ! -d "${directories[0]}" ]; then
    echo "Expected one recording of $scenario, but found: ${directories[*]}"
    exit 1
  fi
  local expected actual
  expected=$(printf '%s\n' "$@" | sort)
  actual=$(ls "${directories[0]}" | sort)
  if [ "$expected" != "$actual" ]; then
    echo "Expected the recording of $scenario to hold:"
    echo "$expected"
    echo "but it holds:"
    echo "$actual"
    exit 1
  fi
}

check_recording opening_accounts.recordings/opening-a-first-account-in-the-web-app \
  alice.webm 2.png 3.png 6.png
check_recording transfers.recordings/transferring-between-two-of-the-customer-s-accounts-in-the-web-app \
  alice.webm 6.png 11.png
check_recording sign_in.recordings/signing-in-and-out-with-the-development-picker \
  ben.webm 2.png 5.png 8.png 11.png 12.png
check_recording sign_in.recordings/two-customers-in-the-app-at-once \
  alice.webm carol.webm 7.png 8.png 9.png 10.png 11.png 12.png

if [ -n "$EXPECTED_RBT_DEV_OUTPUT_FILE" ]; then
  actual_output_file=$(mktemp)

  # No portless proxy here: run on plain ports.
  rbt $RBT_FLAGS dev run --config=ports --terminate-after-health-check > "$actual_output_file"

  check_lines_in_file "${SANDBOX_ROOT}$EXPECTED_RBT_DEV_OUTPUT_FILE" "$actual_output_file"

  rm "$actual_output_file"
fi
