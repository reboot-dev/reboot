#!/usr/bin/env bash
#
# Reboot plugin installer for Claude Code and Codex.
#
# Usage:
#   curl -fsSL https://reboot.dev/install.sh | bash
#
# Installs the plugin into whichever of Claude Code / Codex is present
# on the machine. Having only one of the two is the normal case; the
# installer simply skips the one that isn't there and reports which
# tools it installed for.
#
# Codex sandbox opt-out
#
#   Installing for Codex requires globally disabling Codex's sandbox to
#   work around https://github.com/openai/codex/issues/24933, an
#   upstream Codex bug that breaks Python asyncio cross-thread wakeups
#   and silently hangs the plugin's main commands. The installer
#   prompts (Y/n) before doing so; decline and the Codex install is
#   skipped entirely (since a Codex install without the opt-out cannot
#   actually run the plugin).
#
#   For non-interactive (CI/CD) installs, pre-answer the prompt via:
#     REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX=yes   # consent; install for Codex
#     REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX=no    # decline; skip Codex install
#
#   If neither env var nor a TTY (stdin or /dev/tty) is available, the
#   installer defaults to "yes" and logs that it did so, so headless
#   installs are not blocked.
#
# Maintainer note
#
#   This is a thin bootstrap: it only adds the `reboot-dev/reboot-plugin`
#   marketplace and installs the plugin from it. It carries no version
#   of its own. Keep it that way -- it must stay compatible with the
#   currently-published `reboot-dev/reboot-plugin`, so don't make it
#   depend on plugin contents or behaviors that aren't published there
#   yet.

set -euo pipefail

BLUE='\033[1;34m'
RED='\033[1;31m'
GREEN='\033[1;32m'
BOLD='\033[1m'
RESET='\033[0m'

log()   { printf "${BLUE}[reboot-plugin]${RESET} %s\n" "$*" >&2; }
error() { printf "${RED}[reboot-plugin] error:${RESET} %s\n" "$*" >&2; }
ok()    { printf "${GREEN}[reboot-plugin]${RESET} %s\n" "$*" >&2; }

# Ask a Y/n question on the user's TTY, defaulting to Y (return 0).
# Works under `curl | bash`: stdin is the curl pipe in that case, not
# a TTY, but the user's terminal is still attached at /dev/tty so the
# prompt is interactive. When there is truly no TTY anywhere (e.g.
# running inside a Docker build or CI step), defaults to Y with a log
# line so automated installs are not blocked. CI/CD pipelines that
# want explicit consent can pre-answer via an env var read by the
# caller; this helper just handles the interactive case.
prompt_yes_no() {
    local prompt="$1"
    local answer=""
    local tty_in=""

    if [ -r /dev/tty ]; then
        tty_in=/dev/tty
    elif [ -t 0 ]; then
        tty_in=/dev/stdin
    fi

    if [ -n "$tty_in" ]; then
        printf "%s " "$prompt" >&2
        IFS= read -r answer <"$tty_in" || answer=""
    else
        log "Non-interactive install (no TTY); defaulting to Y."
        return 0
    fi

    case "$answer" in
        ""|[Yy]|[Yy][Ee][Ss]) return 0 ;;
        *) return 1 ;;
    esac
}

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
#   - enables hooks (off by default in Codex),
#   - prepends the plugin's bin/ to PATH for every subprocess, and
#   - (optionally, controlled by $3) disables Codex's
#     seccomp+landlock sandbox to work around
#     https://github.com/openai/codex/issues/24933. See the inline
#     comment in this function for details. The caller must have
#     gathered the user's consent before passing "true" here, since
#     the sandbox is a global Codex setting.
#
# Codex's `shell_environment_policy.set` replaces PATH wholesale, so the
# install-time PATH is baked in after the plugin's bin/ — re-running the
# installer refreshes it. The region holds only top-level dotted keys,
# so it can be prepended ahead of any tables in the user's config, and
# re-running replaces it in place.
merge_codex_config() {
    local config="$1"
    local root="$2"
    local disable_sandbox="${3:-false}"
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
        printf 'features.hooks = true\n'
        printf 'shell_environment_policy.set.PATH = "%s/bin:%s"\n' \
            "$root" "$PATH"
        if [ "$disable_sandbox" = "true" ]; then
            # Disable Codex's seccomp+landlock sandbox. Inside the
            # sandbox, Python `asyncio.call_soon_threadsafe` -- and
            # everything built on it (`run_in_executor`, `aiofiles`,
            # even `asyncio.run`'s own shutdown) -- silently stalls
            # because Codex's seccomp filter denies SYS_sendto on the
            # AF_UNIX socketpair asyncio uses for cross-thread loop
            # wakeups. That breaks `rbt dev run` and `rbt generate`
            # (which are heavily asyncio-based). Until the Codex bug
            # is fixed, the only way to make the plugin usable under
            # Codex is to opt out of the sandbox entirely. See
            # https://github.com/openai/codex/issues/24933.
            printf '# Disabled because Codex sandbox breaks Python asyncio cross-thread\n'
            printf '# wakeup; see https://github.com/openai/codex/issues/24933.\n'
            printf 'sandbox_mode = "danger-full-access"\n'
        fi
        printf '%s\n' "$end"
        if [ -n "$stripped" ]; then
            printf '\n%s\n' "$stripped"
        fi
    } >"$config.reboot.tmp"
    mv "$config.reboot.tmp" "$config"
}

install_codex() {
    log "Installing for Codex..."

    # Decide whether the user is willing to disable Codex's sandbox
    # BEFORE we touch anything. The plugin's main commands hang
    # silently inside Codex's sandbox -- see
    # https://github.com/openai/codex/issues/24933 -- so a Codex
    # install without the sandbox opt-out is effectively a broken
    # install. If the user declines, we skip Codex entirely rather
    # than leaving a dud behind. The env var
    # $REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX (yes/no) lets CI/CD
    # installs give explicit consent without a prompt.
    local disable_sandbox=""
    case "${REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX-}" in
        [Yy]|[Yy][Ee][Ss]|true|1)
            log "REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX=yes; skipping prompt."
            disable_sandbox=true
            ;;
        [Nn]|[Nn][Oo]|false|0)
            log "REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX=no; skipping prompt."
            disable_sandbox=false
            ;;
    esac

    if [ -z "$disable_sandbox" ]; then
        printf >&2 "\n"
        printf >&2 "${BOLD}Codex sandbox decision${RESET}\n"
        printf >&2 "  The Reboot plugin's main commands (rbt dev run, rbt generate, ...)\n"
        printf >&2 "  hang silently inside Codex's sandbox because of an upstream Codex\n"
        printf >&2 "  bug that breaks Python asyncio cross-thread wakeups:\n"
        printf >&2 "    ${BOLD}https://github.com/openai/codex/issues/24933${RESET}\n"
        printf >&2 "  Until that is fixed, the only way to make the plugin actually work\n"
        printf >&2 "  under Codex is to opt out of Codex's sandbox.\n"
        printf >&2 "\n"
        printf >&2 "  Doing so writes ${BOLD}sandbox_mode = \"danger-full-access\"${RESET} into\n"
        printf >&2 "  ~/.codex/config.toml. That setting is ${BOLD}global${RESET}: it affects every\n"
        printf >&2 "  Codex session on this machine, not just sessions that touch the\n"
        printf >&2 "  Reboot plugin. You can undo it later by removing the managed\n"
        printf >&2 "  region from ~/.codex/config.toml.\n"
        printf >&2 "\n"
        printf >&2 "  If you decline, the Codex install will be skipped entirely (a Codex\n"
        printf >&2 "  install without the sandbox opt-out cannot run the plugin's main\n"
        printf >&2 "  commands).\n"
        printf >&2 "\n"
        if prompt_yes_no "Disable Codex sandbox globally? [Y/n]"; then
            disable_sandbox=true
        else
            disable_sandbox=false
        fi
    fi

    if [ "$disable_sandbox" != "true" ]; then
        log "Skipping Codex install: the plugin's main commands hang inside"
        log "  Codex's sandbox until https://github.com/openai/codex/issues/24933"
        log "  is fixed, so installing without the sandbox opt-out would not"
        log "  give a working experience. Re-run install.sh and answer Y to"
        log "  opt in."
        return 0
    fi

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
    if [ -z "$root" ]; then
        if [ -d "$source" ]; then
            root="$source"
        else
            error "Could not determine Codex plugin install path from 'codex plugin list'."
            return 1
        fi
    fi
    # Enable hooks, put the plugin's bin/ on PATH, and disable the
    # Codex sandbox (user already consented above).
    merge_codex_config \
        "${CODEX_HOME:-$HOME/.codex}/config.toml" "$root" "true"

    log "Set sandbox_mode = \"danger-full-access\" in ~/.codex/config.toml"
    log "  to work around https://github.com/openai/codex/issues/24933."
    log "  Remove the managed region from ~/.codex/config.toml to undo."

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

if [ "${#INSTALLED_FOR[@]}" -eq 0 ]; then
    ok "Installed for: (none — Codex install skipped)."
else
    ok "Installed for: $(IFS=', '; echo "${INSTALLED_FOR[*]}")."
fi
printf >&2 "\nStart a new agent session, then ask to build a Reboot app"
printf >&2 " — e.g. ${BOLD}build a todo chat app${RESET}.\n"
