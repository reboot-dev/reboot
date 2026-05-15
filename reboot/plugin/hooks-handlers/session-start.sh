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
