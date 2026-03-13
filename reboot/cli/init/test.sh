#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Use the published Reboot npm package by default, but allow the test system
# to override them with a different value.
if [ -n "$REBOOT_WHL_FILE" ]; then
    export REBOOT_WHL_FILE=$(realpath "$REBOOT_WHL_FILE")
fi

# MacOS tests can fail due to a race in `protoc` writing files to disk,
# so now we check only occurrences of the expected lines in the output.
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

TEST_FILE="$RUNFILES_DIR/$(basename $PWD)/$1"

TEST_DIR="init_test"

rm -rf "$TEST_TMPDIR/$TEST_DIR"

mkdir -p "$TEST_TMPDIR/$TEST_DIR"
cp "$TEST_FILE" "$TEST_TMPDIR/$TEST_DIR"
cd "$TEST_TMPDIR/$TEST_DIR"

echo "$PYTHON_VERSION" > .python-version

rye init --virtual
rye add --dev reboot --absolute --path=$REBOOT_WHL_FILE

# Create and activate a virtual environment.
rye sync --no-lock
source .venv/bin/activate

rbt init --name=bazel_init_test

rbt generate

PYTHONPATH=backend/api/:backend/src/ python test.py

# Run 'rbt dev run' to make sure that the generated '.rbtrc' config works.
EXPECTED_RBT_DEV_OUTPUT_FILE=$(rlocation "$(dirname "$0")/expected_multi_env_output.txt")
actual_output_file=$(mktemp)

rbt dev run --terminate-after-health-check > "$actual_output_file"

check_lines_in_file "$EXPECTED_RBT_DEV_OUTPUT_FILE" "$actual_output_file"

rm "$actual_output_file"

# Deactivate the virtual environment, since we can run a test which may require
# another virtual environment (currently we do that only in `all_tests.sh`).
deactivate
