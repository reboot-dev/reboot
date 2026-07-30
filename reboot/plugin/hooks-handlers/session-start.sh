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
# plugin's install directory, set for hook commands by the agent CLI.
#
# Codex discovers and runs the same `hooks.json`, so this handler runs
# there too. Codex does set `$CLAUDE_PLUGIN_ROOT`, along with
# `$CLAUDE_PLUGIN_DATA`, pointing them at its own plugin cache; what it
# has no equivalent of is `$CLAUDE_ENV_FILE`, since injecting
# environment variables from a hook is a Claude Code mechanism. The
# missing env file is what makes the guard below turn this handler into
# a quiet no-op under Codex, where the same PATH prepend is instead
# wired by the `shell_environment_policy.set.PATH` entry that
# `install.sh` merges into `~/.codex/config.toml`.
#
# Note that this SessionStart hook will only trigger if the plugin is
# already installed at session-start time. Developers will need to
# restart their agent CLI after installing this plugin for this hook to
# take effect.
set -euo pipefail

# Both variables are required to write a meaningful line: an env file
# to append to, and the plugin root whose `bin/` goes on PATH. When
# either is missing this is a silent, successful no-op, since a
# non-zero status — an unset-variable abort under `set -u`, say —
# surfaces to the developer as a hook error.
if [ -z "${CLAUDE_ENV_FILE:-}" ] || [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    exit 0
fi

# Note the careful quoting: `${CLAUDE_PLUGIN_ROOT}` must expand *now*
# (so the env file captures the plugin's absolute path from the time the
# hook ran), while `$PATH` must stay literal so the agent's shell
# expands it later against whatever PATH is in effect at that moment.
echo "export PATH=\"${CLAUDE_PLUGIN_ROOT}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
