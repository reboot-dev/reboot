#!/usr/bin/env sh
#
# Ensure a pinned `uv` (and its sibling `uvx`) is cached in the plugin's
# data dir. On success, prints the absolute path of the directory
# containing the binaries to stdout; status messages go to stderr.
# Sourced indirectly by the `bin/uv` and `bin/uvx` shims.

set -eu

# Pinned uv version. To bump, change here and update the README.
UV_VERSION="0.11.13"

# `PLUGIN_DATA` is hardcoded rather than read from `$CLAUDE_PLUGIN_DATA`.
# Claude Code only sets that env var when it runs something from a
# plugin entry point — e.g. a hook command. It is *not* set when the
# agent runs a binary directly via its Bash tool, even when that binary
# happens to be a shim we ship in `bin/`. Honoring it would mean shims
# invoked from a hook write to one cache and shims invoked directly by
# the agent write to another, double-downloading the tooling. Pinning
# a fixed path keeps one shared cache.
PLUGIN_DATA="$HOME/.claude/plugins/data/reboot"
UV_DIR="$PLUGIN_DATA/bin/uv-$UV_VERSION"

# Hot path: both binaries cached.
if [ -x "$UV_DIR/uv" ] && [ -x "$UV_DIR/uvx" ]; then
    printf '%s\n' "$UV_DIR"
    exit 0
fi

# Cold path: install into a per-invocation staging directory,
# then atomically rename. If a concurrent invocation wins the
# race, our staged copy is discarded by the trap.
mkdir -p "$PLUGIN_DATA/bin"
STAGE="$PLUGIN_DATA/bin/.uv-$UV_VERSION.$$"
rm -rf "$STAGE"
# `$STAGE` is expanded now (when the trap is set), so it stays
# correct even if the variable is later reassigned.
# shellcheck disable=SC2064
trap "rm -rf '$STAGE'" EXIT INT TERM

START_SECONDS=$(date +%s)
printf '\033[1;34m[reboot-plugin]\033[0m installing pinned uv %s into %s ...\n' \
    "$UV_VERSION" "$UV_DIR" >&2

# Pipe the versioned astral.sh installer to `sh` with these env
# vars set on the consumer (`sh`), not on `curl`: `UV_INSTALL_DIR`
# routes binaries into our staging dir directly (no `bin/`
# subdir); `UV_NO_MODIFY_PATH` keeps the installer away from
# shell rc files; `UV_UNMANAGED_INSTALL` disables uv's
# self-update so the version we pin is the version that runs.
# See https://docs.astral.sh/uv/reference/installer/ and
# https://docs.astral.sh/uv/reference/environment/.
curl -fsSL "https://astral.sh/uv/${UV_VERSION}/install.sh" |
    UV_INSTALL_DIR="$STAGE" \
        UV_NO_MODIFY_PATH=1 \
        UV_UNMANAGED_INSTALL=1 \
        sh >/dev/null

# Atomically place the staged dir at `$UV_DIR`. If `$UV_DIR`
# already exists, `mv` to a directory would move-INTO rather
# than rename, so guard with an explicit existence check. The
# tiny race window between check and `mv` could leave a stray
# `.uv-<version>.<pid>` subdir inside `$UV_DIR`; that's cosmetic
# and doesn't affect correctness, since the cached binaries are
# still at the expected paths either way.
if [ ! -e "$UV_DIR" ]; then
    mv "$STAGE" "$UV_DIR" 2>/dev/null || :
fi

if [ ! -x "$UV_DIR/uv" ] || [ ! -x "$UV_DIR/uvx" ]; then
    printf '\033[1;31m[reboot-plugin]\033[0m failed to install uv %s\n' \
        "$UV_VERSION" >&2
    exit 1
fi

printf '\033[1;34m[reboot-plugin]\033[0m installed pinned uv %s in %ds\n' \
    "$UV_VERSION" "$(($(date +%s) - START_SECONDS))" >&2

printf '%s\n' "$UV_DIR"
