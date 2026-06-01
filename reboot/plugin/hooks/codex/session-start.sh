#!/usr/bin/env bash

# Codex SessionStart hook: launch a `cloudflared` quick tunnel pointed
# at the local Reboot dev server, the same way the Claude Code
# `hooks-handlers/session-start.sh` does. This is the Codex port; the
# differences from the Claude version are:
#
#  - PATH is NOT touched here. Claude Code lets a SessionStart hook
#    inject env via `$CLAUDE_ENV_FILE`; Codex has no such mechanism, so
#    the plugin's `bin/` is put on PATH via `shell_environment_policy`
#    in `~/.codex/config.toml` (written by `install.sh`) instead.
#  - `$CLAUDE_PLUGIN_ROOT` is not set under Codex, so we derive the
#    plugin root from this script's own location.
#  - Codex has no `SessionEnd` event to reap the tunnel, so this hook
#    starts a watchdog that kills the tunnel when the owning `codex`
#    process exits. As a fallback, `hooks/codex/reap.sh` reaps it
#    manually (see the README).
#
# This hook must never block session startup: every step is guarded and
# it always exits 0.
set -u

# The plugin root is two levels up from this script (`hooks/codex/`).
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || true)"
[ -n "$PLUGIN_ROOT" ] || exit 0
[ -x "$PLUGIN_ROOT/bin/cloudflared" ] || exit 0

# Codex sends a JSON payload on stdin; we don't need it. Drain it so the
# hook doesn't appear to hang on a blocking pipe.
cat >/dev/null 2>&1 || true

DATA_DIR="${CODEX_HOME:-$HOME/.codex}/reboot"
CLOUDFLARED_PID_FILE="$DATA_DIR/cloudflared.pid"
CLOUDFLARED_LOG_FILE="$DATA_DIR/cloudflared.log"
mkdir -p "$DATA_DIR" 2>/dev/null || true

# Walk up the process tree to find the owning `codex` process, so the
# watchdog can tie the tunnel's lifetime to this session regardless of
# any intermediate shell Codex spawned the hook through. Returns empty
# if no `codex` ancestor is found (then we skip the watchdog and rely
# on the manual reaper).
find_codex_ancestor() {
    local pid="$PPID"
    local i comm
    for i in $(seq 1 10); do
        [ -z "$pid" ] && return 1
        [ "$pid" -le 1 ] 2>/dev/null && return 1
        comm="$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')"
        case "$comm" in
        *codex*)
            echo "$pid"
            return 0
            ;;
        esac
        pid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
    done
    return 1
}

# Start the tunnel. Metrics on `:4040`; the allocated
# `*.trycloudflare.com` URL is written to the log file. We call the
# shim by absolute path so this works even before `shell_environment_policy`
# takes effect.
#
# If `:4040` is already bound — typically by a tunnel from a concurrent
# Codex session — this instance dies immediately with `failed to bind to
# address`. That is fine: the existing tunnel keeps serving, and we
# detect the loss below and bow out without touching the winner's PID
# file or starting a redundant watchdog.
nohup "$PLUGIN_ROOT/bin/cloudflared" tunnel \
    --metrics localhost:4040 \
    --url http://localhost:9991 \
    >"$CLOUDFLARED_LOG_FILE" 2>&1 </dev/null &
CF_PID=$!
disown 2>/dev/null || true

# Give cloudflared a moment to either bind `:4040` or fail fast.
sleep 1
if ! kill -0 "$CF_PID" 2>/dev/null; then
    # Lost the `:4040` bind; another session owns the tunnel.
    exit 0
fi

echo "$CF_PID" >"$CLOUDFLARED_PID_FILE" 2>/dev/null || true

# Self-terminating watchdog: when the owning `codex` process exits, kill
# the tunnel and clean up the PID file. Skipped if we couldn't identify
# a `codex` ancestor — in that case the tunnel persists until the manual
# reaper runs.
CODEX_PID="$(find_codex_ancestor || true)"
if [ -n "$CODEX_PID" ]; then
    (
        while kill -0 "$CODEX_PID" 2>/dev/null; do
            sleep 5
        done
        kill "$CF_PID" 2>/dev/null || true
        sleep 0.3
        kill -9 "$CF_PID" 2>/dev/null || true
        rm -f "$CLOUDFLARED_PID_FILE" 2>/dev/null || true
    ) </dev/null >/dev/null 2>&1 &
    disown 2>/dev/null || true
fi

exit 0
