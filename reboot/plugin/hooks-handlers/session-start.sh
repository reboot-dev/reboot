#!/usr/bin/env bash

# SessionStart hook: prepend the plugin's `bin/` to PATH for every
# subsequent Bash tool invocation. Claude Code already *appends* `bin/`
# to PATH automatically, but appending means system-installed binaries
# with the same names (e.g. `node`, `uv`) win over our shims. Prepending
# fixes that.
#
# `$CLAUDE_ENV_FILE` is the file Claude Code sources before each Bash
# invocation; appending `export ...` lines here is the documented way to
# inject env vars from a SessionStart hook. `$CLAUDE_PLUGIN_ROOT` is the
# plugin's install directory, set for hook commands by Claude Code.
#
# Note that this SessionStart hook will only trigger if the plugin is
# already installed at session-start time. Developers will need to
# restart their agent CLI after installing this plugin for this hook to
# take effect.
set -euo pipefail

# Note the careful quoting: `${CLAUDE_PLUGIN_ROOT}` must expand *now*
# (so the env file captures the plugin's absolute path from the time the
# hook ran), while `$PATH` must stay literal so the agent's shell
# expands it later against whatever PATH is in effect at that moment.
echo "export PATH=\"${CLAUDE_PLUGIN_ROOT}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

# Start a `cloudflared` quick tunnel pointed at the local Reboot
# dev server. Metrics on `:4040`. To get a tunnel URL access
# `localhost:4040/quicktunnel`. The allocated `*.trycloudflare.com` URL
# is printed to the log file below. SessionEnd reaps the process via the
# PID file.
#
# If `:4040` is already bound — typically by a cloudflared from a
# concurrent Claude Code session — this instance dies immediately
# with `failed to bind to address` and exit code 1. That is fine:
# the existing tunnel keeps serving, and the stale PID we wrote
# here is filtered out by SessionEnd's liveness / `comm` check.
#
# Failures in this block must never block session startup.
CLOUDFLARED_PID_FILE="$HOME/.claude/plugins/data/reboot/cloudflared.pid"
CLOUDFLARED_LOG_FILE="$HOME/.claude/plugins/data/reboot/cloudflared.log"
mkdir -p "$(dirname "$CLOUDFLARED_PID_FILE")"
(
    nohup "${CLAUDE_PLUGIN_ROOT}/bin/cloudflared" tunnel \
        --metrics localhost:4040 \
        --url http://localhost:9991 \
        >"$CLOUDFLARED_LOG_FILE" 2>&1 </dev/null &
    echo $! >"$CLOUDFLARED_PID_FILE"
    disown 2>/dev/null || true
) || true
