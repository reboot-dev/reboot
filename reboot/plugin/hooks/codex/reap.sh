#!/usr/bin/env bash

# Codex manual reaper: the Codex port of the Claude Code `SessionEnd`
# hook (`hooks-handlers/session-end.sh`). Codex has no session-end
# event, so this is not wired to a hook — run it by hand (or from a
# shell logout trap) to clean up the two background processes the plugin
# leaves behind:
#
#  - the MCPJam inspector the `chat-app` skill starts (binds the fixed
#    port 6274; its launcher traps only SIGINT, so it orphans its HTTP
#    server when killed with SIGTERM); and
#  - the `cloudflared` quick tunnel the SessionStart hook spawned (its
#    own watchdog usually reaps it when `codex` exits, but this is the
#    fallback when no `codex` ancestor was found).
#
# Every step is guarded; the script always exits 0.
set -u

PORT=6274

# Kill whatever listens on the inspector's fixed port.
pids=""
if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)
elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${PORT}/tcp" 2>/dev/null || true)
fi
if [ -n "${pids}" ]; then
    kill ${pids} 2>/dev/null || true
    sleep 0.3
    kill -9 ${pids} 2>/dev/null || true
fi

# Reap the cloudflared tunnel. Verify the PID is both alive AND actually
# `cloudflared` before killing, so PID reuse can't make us terminate an
# unrelated process.
CLOUDFLARED_PID_FILE="${CODEX_HOME:-$HOME/.codex}/reboot/cloudflared.pid"
if [ -s "${CLOUDFLARED_PID_FILE}" ]; then
    cf_pid=$(cat "${CLOUDFLARED_PID_FILE}" 2>/dev/null || true)
    if [ -n "${cf_pid}" ] && kill -0 "${cf_pid}" 2>/dev/null; then
        cf_comm=$(ps -p "${cf_pid}" -o comm= 2>/dev/null | tr -d ' ')
        if [ "${cf_comm}" = "cloudflared" ]; then
            kill "${cf_pid}" 2>/dev/null || true
            sleep 0.3
            kill -9 "${cf_pid}" 2>/dev/null || true
        fi
    fi
    rm -f "${CLOUDFLARED_PID_FILE}"
fi

exit 0
