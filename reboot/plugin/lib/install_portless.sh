#!/usr/bin/env sh
#
# Ensure a pinned `portless` CLI (https://github.com/vercel-labs/portless)
# is cached in the plugin's data dir. On success, prints the absolute
# path of the directory it is installed under to stdout (the CLI is
# `$PORTLESS_DIR/node_modules/.bin/portless`); status messages go to
# stderr. Sourced indirectly by the `bin/portless` shim.
#
# portless is an npm package, so it is installed with the plugin's
# pinned Node (`lib/install_node.sh`) into a directory of its own,
# which keeps it off the developer's global npm prefix.

set -eu

# Pinned portless version. To bump, change here; `npm` verifies the
# package against the registry's integrity hash.
PORTLESS_VERSION="0.15.7"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname -- "$0")/.." && pwd)}"

# `PLUGIN_DATA` is hardcoded rather than read from `$CLAUDE_PLUGIN_DATA`;
# see `install_cloudflared.sh` for why.
PLUGIN_DATA="$HOME/.claude/plugins/data/reboot"
PORTLESS_DIR="$PLUGIN_DATA/bin/portless-v$PORTLESS_VERSION"

# Hot path: cached CLI present.
if [ -x "$PORTLESS_DIR/node_modules/.bin/portless" ]; then
    printf '%s\n' "$PORTLESS_DIR"
    exit 0
fi

NODE_DIR="$("$PLUGIN_ROOT/lib/install_node.sh")"

mkdir -p "$PLUGIN_DATA/bin"
STAGE="$PLUGIN_DATA/bin/.portless-v$PORTLESS_VERSION.$$"
rm -rf "$STAGE"
# shellcheck disable=SC2064
trap "rm -rf '$STAGE'" EXIT INT TERM
mkdir -p "$STAGE"

START_SECONDS=$(date +%s)
printf '\033[1;34m[reboot-plugin]\033[0m installing pinned portless %s into %s ...\n' \
    "$PORTLESS_VERSION" "$PORTLESS_DIR" >&2

# A bare package directory so `npm install` has somewhere to record
# the dependency, then the package itself.
printf '{ "name": "reboot-plugin-portless", "private": true }\n' \
    > "$STAGE/package.json"
PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/npm" install \
    --prefix "$STAGE" \
    --no-audit --no-fund --loglevel=error \
    "portless@$PORTLESS_VERSION" >&2

# Atomically place the staged dir at `$PORTLESS_DIR`; see
# `install_cloudflared.sh` for the guard.
if [ ! -e "$PORTLESS_DIR" ]; then
    mv "$STAGE" "$PORTLESS_DIR" 2>/dev/null || :
fi

if [ ! -x "$PORTLESS_DIR/node_modules/.bin/portless" ]; then
    printf '\033[1;31m[reboot-plugin]\033[0m failed to install portless %s\n' \
        "$PORTLESS_VERSION" >&2
    exit 1
fi

printf '\033[1;34m[reboot-plugin]\033[0m installed pinned portless %s in %ds\n' \
    "$PORTLESS_VERSION" "$(($(date +%s) - START_SECONDS))" >&2

printf '%s\n' "$PORTLESS_DIR"
