#!/usr/bin/env bash

# SessionEnd hook: reap the MCPJam inspector that the `chat-app` skill
# starts as a background server (SKILL.md step 15).
#
# Why this is needed: the inspector's launcher (`@mcpjam/inspector`,
# `bin/start.js`) traps `SIGINT` only — it has no `SIGTERM` handler —
# and it spawns the real HTTP server (`dist/server/index.js`) as an
# ordinary, non-detached child. Claude Code tears down its background
# shells with `SIGTERM`, so the launcher dies immediately without
# running the cleanup that would have killed the server. The server is
# then orphaned (reparented to init) and keeps holding its port after
# the user exits Claude Code.
#
# The inspector always binds the fixed port 6274 (hard-coded in
# `start.js`; it fails fast rather than picking another), so reaping
# whatever listens on 6274 kills exactly that orphan and nothing else.
#
# This hook must never block session teardown: every step is guarded
# and it always exits 0.
set -u

PORT=6274

# Collect PIDs listening on the inspector's port. `lsof` behaves the
# same on Linux and macOS; `fuser` is the Linux-only fallback for the
# rare host without `lsof`.
pids=""
if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)
elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${PORT}/tcp" 2>/dev/null || true)
fi

# If something is on the inspector's port, kill it gracefully first
# and then force anything that ignored `SIGTERM`. Empty `pids` is
# expected when the inspector was never started or already exited.
if [ -n "${pids}" ]; then
    kill ${pids} 2>/dev/null || true
    sleep 0.3
    kill -9 ${pids} 2>/dev/null || true
fi

# Reap the `cloudflared` quick tunnel started by `SessionStart`. The
# PID file may be stale (e.g. this session's start raced a
# concurrent session and lost the `:4040` bind), so verify the
# PID is both alive AND actually `cloudflared` before killing —
# otherwise PID reuse could make us terminate an unrelated
# process. If no live cloudflared remains, just remove the file.
CLOUDFLARED_PID_FILE="$HOME/.claude/plugins/data/reboot/cloudflared.pid"
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
