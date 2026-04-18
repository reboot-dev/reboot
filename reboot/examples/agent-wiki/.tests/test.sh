#!/bin/bash

set -e # Exit if a command exits with an error.
set -x # Echo executed commands to help debug failures.

# MacOS tests can fail due to a race in `protoc` writing files to
# disk, so now we check only occurrences of the expected lines in
# the output. See https://github.com/reboot-dev/mono/issues/3433
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

# Make sure `uv` is on `PATH`. The release devcontainer image
# already ships it; in other environments fall back to a
# `pip install`.
if ! command -v uv > /dev/null; then
  pip install uv
  # `pip install` drops `uv` in the interpreter's scripts dir,
  # which isn't on `PATH` inside the macOS Bazel test sandbox.
  export PATH="$(python -c 'import sysconfig; print(sysconfig.get_path("scripts"))'):$PATH"
fi

# Sync the project's pinned dependencies, including the `dev`
# group (which provides `pytest`).
uv sync --frozen --group dev

# If the test system supplied an alternate `reboot` wheel (e.g.
# the in-tree development build under Bazel), overlay it on top
# of the synced venv. `--no-deps` keeps the rest of the locked
# dependency tree intact.
if [ -n "$REBOOT_WHL_FILE" ]; then
  uv pip install --reinstall --no-deps \
    "${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
fi

# Activate the venv so subsequent commands (and the Reboot
# runtime) use the synced interpreter and `rbt` script.
source .venv/bin/activate

# When running in a Bazel test, our `.rbtrc` file ends up in a
# very deep directory structure, which can result in "path too
# long" errors from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

rbt $RBT_FLAGS generate

pytest -v -s backend/tests/

if [ -n "$EXPECTED_RBT_DEV_OUTPUT_FILE" ]; then
  actual_output_file=$(mktemp)

  # The librarian agent fails fast if `ANTHROPIC_API_KEY` is
  # unset, so we provide a dummy value. No real Anthropic calls
  # are made: the health check terminates the process before any
  # transcript ingestion happens.
  ANTHROPIC_API_KEY="dummy-for-health-check" \
    rbt $RBT_FLAGS dev run --terminate-after-health-check \
      > "$actual_output_file"

  check_lines_in_file \
    "${SANDBOX_ROOT}$EXPECTED_RBT_DEV_OUTPUT_FILE" \
    "$actual_output_file"

  rm "$actual_output_file"
fi
