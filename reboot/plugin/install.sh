#!/usr/bin/env bash
#
# Reboot plugin installer for Claude Code.
# Usage: curl -fsSL https://reboot.dev/install.sh | bash

set -euo pipefail

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
BOLD='\033[1m'
RESET='\033[0m'

log()   { printf "${BLUE}[reboot-plugin]${RESET} %s\n" "$*" >&2; }
error() { printf "${RED}[reboot-plugin] error:${RESET} %s\n" "$*" >&2; }
ok()    { printf "${GREEN}[reboot-plugin]${RESET} %s\n" "$*" >&2; }

# Verify the Claude Code CLI is present before doing anything else.
if ! command -v claude >/dev/null 2>&1; then
    error "Claude Code CLI not found."
    printf >&2 "Install Claude Code and try again:\n"
    printf >&2 "  https://docs.anthropic.com/en/docs/claude-code/setup\n"
    exit 1
fi

# Register the Reboot skills marketplace with Claude Code.
log "Adding Reboot skills marketplace..."
claude plugin marketplace add reboot-dev/reboot-plugin

# Install the plugin from the registered marketplace.
log "Installing reboot plugin..."
claude plugin install reboot@reboot-plugin

# Pre-warm the pinned dependencies by invoking each bin/ shim with
# `--version`. Claude Code clones the marketplace to a predictable
# path; each shim triggers its install script, which caches the
# binary under `~/.claude/plugins/data/reboot/`. Running `rbt` also
# makes `uvx` fetch the pinned Reboot CLI and its Python deps.
# Non-fatal: any failure here just defers the download to first use.
PLUGIN_DIR="$HOME/.claude/plugins/marketplaces/reboot-plugin"
log "Pre-installing dependencies..."
if [ -d "$PLUGIN_DIR/bin" ]; then
    for tool in uv uvx node npm envoy rbt; do
        sh "$PLUGIN_DIR/bin/$tool" --version >/dev/null 2>&1 \
            || log "Could not pre-install $tool; it loads on first use."
    done
else
    log "Plugin directory not found; dependencies install on first use."
fi

ok "Installation complete!"
printf >&2 "\nStart a new Claude Code session, then type ${BOLD}/chat-app${RESET}"
printf >&2 " to build a Reboot AI app.\n"
