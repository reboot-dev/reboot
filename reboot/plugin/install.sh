#!/usr/bin/env bash
#
# Reboot plugin installer for Claude Code and Codex.
# Usage: curl -fsSL https://reboot.dev/install.sh | bash
#
# Installs the plugin into whichever of Claude Code / Codex is present
# on the machine. Having only one of the two is the normal case; the
# installer simply skips the one that isn't there and reports which
# tools it installed for.

set -euo pipefail

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
BOLD='\033[1m'
RESET='\033[0m'

log()   { printf "${BLUE}[reboot-plugin]${RESET} %s\n" "$*" >&2; }
error() { printf "${RED}[reboot-plugin] error:${RESET} %s\n" "$*" >&2; }
ok()    { printf "${GREEN}[reboot-plugin]${RESET} %s\n" "$*" >&2; }

REPO="reboot-dev/reboot-plugin"
PLUGIN_NAME="reboot"
MARKETPLACE_NAME="reboot-plugin"

# Tools we successfully installed for, reported at the end.
INSTALLED_FOR=()

# If this script is running from inside a plugin checkout (rather than
# being piped from curl), echo that directory.
plugin_checkout_dir() {
    local dir
    dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || return 1
    if [ -f "$dir/skills/app/SKILL.md" ] && [ -d "$dir/bin" ]; then
        echo "$dir"
        return 0
    fi
    return 1
}

# Pre-warm the pinned dependencies by invoking each bin/ shim with
# `--version`, so the heavy downloads happen now rather than on first
# use. Non-fatal: any failure just defers the download.
prewarm() {
    local bindir="$1"
    [ -d "$bindir" ] || return 0
    for tool in uv uvx node npm envoy cloudflared rbt; do
        sh "$bindir/$tool" --version >/dev/null 2>&1 \
            || log "Could not pre-install $tool; it loads on first use."
    done
}

# --- Claude Code ---------------------------------------------------------

install_claude() {
    log "Installing for Claude Code..."

    # Use a local checkout as the marketplace source if we're running
    # from inside one; otherwise let Claude Code clone the GitHub repo.
    # This mirrors install_codex, and is required because the plugin
    # lives in a subdirectory of a monorepo when developed locally --
    # without this branch, the GitHub fallback fires unconditionally
    # and fails with "Marketplace file not found" if the repo at $REPO
    # is missing or has a different layout.
    local source
    if source="$(plugin_checkout_dir)"; then
        log "Adding local checkout as the marketplace source."
    else
        source="$REPO"
        log "Adding GitHub repo as the marketplace source."
    fi

    # Register the marketplace and install the plugin from it. Explicit
    # error guards (instead of relying on set -e to kill the script)
    # let us print a useful "what failed" line; Claude Code's own
    # error message is also printed by `claude` itself.
    claude plugin marketplace add "$source" \
        || { error "claude plugin marketplace add failed."; return 1; }
    claude plugin install "$PLUGIN_NAME@$MARKETPLACE_NAME" \
        || { error "claude plugin install failed."; return 1; }

    # Pre-warm the bundled shims. For a local checkout the shims live
    # in $source/bin; for a GitHub clone Claude Code drops them at
    # ~/.claude/plugins/marketplaces/<org>-<repo>/bin (the slash in
    # the repo slug becomes a dash in the directory name). `prewarm`
    # is non-fatal, so a wrong guess just defers the download.
    local bindir
    if [ -d "$source/bin" ]; then
        bindir="$source/bin"
    else
        bindir="$HOME/.claude/plugins/marketplaces/${REPO//\//-}/bin"
    fi
    log "Pre-installing dependencies for Claude Code..."
    prewarm "$bindir"

    INSTALLED_FOR+=("Claude Code")
}

# --- Codex ---------------------------------------------------------------

# Echo the absolute install path of the reboot plugin, as reported by
# `codex plugin list`. The plugin must already be added.
codex_plugin_path() {
    # Output columns: PLUGIN STATUS VERSION PATH. Field 1 is the plugin
    # selector; the last absolute path on a matching row is the install
    # location. A field-equality match avoids the awk `\b` portability
    # trap (POSIX awk treats `\b` as a literal `b`).
    codex plugin list 2>/dev/null \
        | awk -v name="${PLUGIN_NAME}@${MARKETPLACE_NAME}" '
            $1 == name {
                for (i=NF; i>=1; i--) if ($i ~ "^/") { print $i; exit }
            }'
}

# Merge a marked region into ~/.codex/config.toml that:
#   - enables hooks (off by default in Codex), and
#   - prepends the plugin's bin/ to PATH for every subprocess.
#
# Codex's `shell_environment_policy.set` replaces PATH wholesale, so the
# install-time PATH is baked in after the plugin's bin/ — re-running the
# installer refreshes it. The region holds only top-level dotted keys,
# so it can be prepended ahead of any tables in the user's config, and
# re-running replaces it in place.
merge_codex_config() {
    local config="$1"
    local root="$2"
    local begin="# >>> reboot-plugin (managed) >>>"
    local end="# <<< reboot-plugin (managed) <<<"

    mkdir -p "$(dirname "$config")"
    touch "$config"

    # Drop any existing managed region.
    local stripped
    stripped="$(awk -v b="$begin" -v e="$end" '
        $0==b {skip=1; next}
        skip && $0==e {skip=0; next}
        !skip {print}
    ' "$config")"

    {
        printf '%s\n' "$begin"
        printf 'features.codex_hooks = true\n'
        printf 'shell_environment_policy.set.PATH = "%s/bin:%s"\n' \
            "$root" "$PATH"
        printf '%s\n' "$end"
        if [ -n "$stripped" ]; then
            printf '\n%s\n' "$stripped"
        fi
    } >"$config.reboot.tmp"
    mv "$config.reboot.tmp" "$config"
}

install_codex() {
    log "Installing for Codex..."

    # Use a local checkout as the marketplace source if we're running
    # from inside one; otherwise let Codex clone the GitHub repo.
    local source
    if source="$(plugin_checkout_dir)"; then
        log "Adding local checkout as the marketplace source."
    else
        source="$REPO"
        log "Adding GitHub repo as the marketplace source."
    fi

    # Register the marketplace and install the plugin. Skills and hooks
    # are auto-configured by Codex from the bundled
    # `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`.
    # Codex prints its own errors to stderr; the explicit guards make
    # sure we don't write a half-broken managed region into config.toml
    # when either step fails.
    codex plugin marketplace add "$source" \
        || { error "codex plugin marketplace add failed."; return 1; }
    codex plugin add "$PLUGIN_NAME@$MARKETPLACE_NAME" \
        || { error "codex plugin add failed."; return 1; }

    # Resolve the plugin's install path so the PATH bake-in below uses
    # the right directory. `codex plugin list` is authoritative for the
    # plugin location; the source-dir fallback covers the rare case
    # where parsing fails on an unexpected output format.
    local root
    root="$(codex_plugin_path)"
    [ -n "$root" ] || root="$source"

    # Enable hooks and put the plugin's bin/ on PATH.
    merge_codex_config "${CODEX_HOME:-$HOME/.codex}/config.toml" "$root"

    log "Pre-installing dependencies for Codex..."
    prewarm "$root/bin"

    INSTALLED_FOR+=("Codex")
}

# --- Main ----------------------------------------------------------------

have_claude=false
have_codex=false
command -v claude >/dev/null 2>&1 && have_claude=true
command -v codex  >/dev/null 2>&1 && have_codex=true

if ! $have_claude && ! $have_codex; then
    error "Neither Claude Code nor Codex was found."
    printf >&2 "Install one of them and try again:\n"
    printf >&2 "  Claude Code: https://docs.anthropic.com/en/docs/claude-code/setup\n"
    printf >&2 "  Codex:       https://developers.openai.com/codex/cli\n"
    exit 1
fi

$have_claude && install_claude
$have_codex  && install_codex

ok "Installed for: $(IFS=', '; echo "${INSTALLED_FOR[*]}")."
printf >&2 "\nStart a new agent session, then ask to build a Reboot app"
printf >&2 " — e.g. ${BOLD}build a todo chat app${RESET}.\n"
