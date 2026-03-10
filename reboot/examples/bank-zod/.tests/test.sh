#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
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

# Use the published Reboot npm package by default, but allow the
# test system to override them with a different value.
if [ -n "$REBOOT_NPM_PACKAGE" ]; then
  REBOOT_WHL_FILE="${SANDBOX_ROOT}$REBOOT_WHL_FILE"
  npm install --no-save \
    ${SANDBOX_ROOT}$REBOOT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_REACT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_API_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_STD_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_STD_API_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_WEB_NPM_PACKAGE
else
  npm install
fi

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

npx rbt $RBT_FLAGS generate

# Run the type check only.
npx tsc

npx tsx backend/tests/test.ts

if [ -n "${EXPECTED_RBT_DEV_OUTPUT_FILE:-}" ]; then
  actual_output_file=$(mktemp)

  npx rbt $RBT_FLAGS dev run --terminate-after-health-check > "$actual_output_file"

  check_lines_in_file "${SANDBOX_ROOT}$EXPECTED_RBT_DEV_OUTPUT_FILE" "$actual_output_file"

  rm "$actual_output_file"
fi
