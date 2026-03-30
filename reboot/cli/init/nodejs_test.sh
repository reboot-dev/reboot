set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Use the published Reboot npm package by default, but allow the test system
# to override them with a different value.
if [ -n "$REBOOT_WHL_FILE" ]; then
    export REBOOT_WHL_FILE=$(realpath "$REBOOT_WHL_FILE")
fi

if [ -n "$REBOOT_NPM_PACKAGE" ]; then
    export REBOOT_NPM_PACKAGE=$(realpath "$REBOOT_NPM_PACKAGE")
fi

if [ -n "$REBOOT_API_NPM_PACKAGE" ]; then
  export REBOOT_API_NPM_PACKAGE=$(realpath "$REBOOT_API_NPM_PACKAGE")
fi

if [ -n "$REBOOT_REACT_NPM_PACKAGE" ]; then
  export REBOOT_REACT_NPM_PACKAGE=$(realpath "$REBOOT_REACT_NPM_PACKAGE")
fi

if [ -n "$REBOOT_WEB_NPM_PACKAGE" ]; then
  export REBOOT_WEB_NPM_PACKAGE=$(realpath "$REBOOT_WEB_NPM_PACKAGE")
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

TEST_DIR="init_test"

rm -rf "$TEST_TMPDIR/$TEST_DIR"

mkdir -p "$TEST_TMPDIR/$TEST_DIR"
cd "$TEST_TMPDIR/$TEST_DIR"

# Ensure we start without any old `node_modules/`, `dist/` or `init_nodejs_test`
# that might have existed from a previously failed run of the test.
rm -rf node_modules
rm -rf dist
rm -rf init_nodejs_test

npm init -y

# Manually install just the Reboot nodejs packages that we need in
# order to do `rbt init`.
npm install --no-save $REBOOT_NPM_PACKAGE $REBOOT_API_NPM_PACKAGE

EXPECTED_RBT_DEV_OUTPUT_FILE=$(rlocation "$(dirname "$0")/expected_nodejs_output.txt")

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

if [ -n "${EXPECTED_RBT_DEV_OUTPUT_FILE:-}" ]; then
    mkdir init_nodejs_test && cd init_nodejs_test

    npx rbt $RBT_FLAGS init --name=bazel_init_nodejs_test --backend=nodejs

    # As per the instructions from running `rbt init`, we now need to
    # run `npm install` but making sure to get the unreleased Reboot
    # packages that we are testing!
    npm install --no-save $REBOOT_NPM_PACKAGE $REBOOT_API_NPM_PACKAGE $REBOOT_REACT_NPM_PACKAGE $REBOOT_WEB_NPM_PACKAGE

    actual_output_file=$(mktemp)

    npx rbt $RBT_FLAGS dev run --terminate-after-health-check > "$actual_output_file"

    check_lines_in_file "$EXPECTED_RBT_DEV_OUTPUT_FILE" "$actual_output_file"

    rm "$actual_output_file"
fi
