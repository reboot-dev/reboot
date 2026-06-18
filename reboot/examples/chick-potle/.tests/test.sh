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

# Use the published Reboot pip package by default, but allow the
# test system to override it with a different value.
if [ -n "$REBOOT_WHL_FILE" ]; then
  # Install the `reboot` package from the specified path
  # explicitly, overwriting the version from `pyproject.toml`.
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

# When running in a Bazel test, our `.rbtrc` file ends up in a
# very deep directory structure, which can result in "path too
# long" errors from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

rbt $RBT_FLAGS generate

pytest backend/

if [ -n "$EXPECTED_RBT_DEV_OUTPUT_FILE" ]; then
  actual_output_file=$(mktemp)

  # `--config=dist` overrides `.rbtrc`'s default `hmr` config,
  # whose `--mcp-frontend-host=http://localhost:4444` would
  # have Envoy proxy `/__/web/**` to a Vite dev server. There
  # is no Vite running in CI, and on the macOS executable-Envoy
  # path that proxy target makes cluster init hang
  # indefinitely, so `--terminate-after-health-check` never
  # fires. The `dist` config sets `--mcp-frontend-host=""`,
  # which skips the proxy entirely. `web/dist/` doesn't need
  # to actually exist; the health check only probes gRPC and
  # Envoy listeners.
  rbt $RBT_FLAGS dev run \
    --config=dist \
    --terminate-after-health-check \
    > "$actual_output_file"

  check_lines_in_file \
    "${SANDBOX_ROOT}$EXPECTED_RBT_DEV_OUTPUT_FILE" \
    "$actual_output_file"

  rm "$actual_output_file"
fi
