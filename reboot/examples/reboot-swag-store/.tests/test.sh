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
  rye remove --no-sync reboot
  rye remove --no-sync --dev reboot
  rye add --dev reboot --absolute --path="${SANDBOX_ROOT}$REBOOT_WHL_FILE"
fi

# Force a fresh virtualenv. A pre-existing `.venv/` (e.g.,
# carried over from a pre-baked image, or copied between
# containers/host paths during the dev-container test) will
# have absolute shebangs in its console scripts (`rbt`,
# `pytest`) pointing at the path where it was originally
# created, which produces "bad interpreter: No such file or
# directory" when those scripts are executed from a different
# location. `rye sync` only regenerates entry-point scripts
# for packages it reinstalls, so it can't repair an existing
# venv whose shebangs are stale. Nuking and re-syncing here
# guarantees the venv lives at the current path.
rm -rf .venv
rye sync --no-lock

# Don't `source .venv/bin/activate`: that script bakes in the
# venv's original creation path on its first line, which is
# wrong when the venv has been relocated (e.g., a pre-baked
# image bind-mounted at a different path in CI). The
# console-script wrappers (`rbt`, `pytest`) also have absolute
# shebangs that point at the stale path. Set `PATH` and
# `VIRTUAL_ENV` to the real location ourselves, and invoke the
# tools via `python -m`: the `python` symlink resolves the
# venv from its own location through `pyvenv.cfg`, so it
# survives relocation, and `-m` bypasses the broken script
# shebangs.
VENV_BIN="$(pwd)/.venv/bin"
export PATH="$VENV_BIN:$PATH"
export VIRTUAL_ENV="$(pwd)/.venv"
PYTHON="$VENV_BIN/python"

# When running in a Bazel test, our `.rbtrc` file ends up in a
# very deep directory structure, which can result in "path too
# long" errors from RocksDB. Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

"$PYTHON" -m reboot.cli.rbt_main $RBT_FLAGS generate

"$PYTHON" -m pytest backend/

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
  "$PYTHON" -m reboot.cli.rbt_main $RBT_FLAGS dev run \
    --config=dist \
    --terminate-after-health-check \
    > "$actual_output_file"

  check_lines_in_file \
    "${SANDBOX_ROOT}$EXPECTED_RBT_DEV_OUTPUT_FILE" \
    "$actual_output_file"

  rm "$actual_output_file"
fi
