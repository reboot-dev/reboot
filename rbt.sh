#!/bin/bash
set -euo pipefail

# Build in Reboot's workspace, but run the CLI in the caller's application.
# Changing cwd for the entire script would break .rbtrc discovery and ACP cwd.
REBOOT_SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "cloud" && "${2:-}" == "up" ]]; then
    # Build the local base image before the application's Dockerfile uses it.
    (cd "$REBOOT_SOURCE_ROOT" && bazel run //reboot/containers/reboot-base:dev)
fi

(cd "$REBOOT_SOURCE_ROOT" &&
    (bazel build --check_up_to_date //reboot/cli:rbt >/dev/null 2>&1 \
        || (bazel build //reboot/cli:rbt && printf '\n\n')))

export PATH="$PATH:$REBOOT_SOURCE_ROOT/bazel-bin/reboot/cli/rbt.runfiles/com_github_reboot_dev_reboot/reboot:$REBOOT_SOURCE_ROOT/bazel-bin/reboot/cli/rbt.runfiles/com_github_reboot_dev_reboot/protoc_gen_mypy_plugin"
exec "$REBOOT_SOURCE_ROOT/bazel-bin/reboot/cli/rbt" "$@"
