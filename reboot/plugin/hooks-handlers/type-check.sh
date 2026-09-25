#!/usr/bin/env sh
# Stop hook: type-check a Reboot project before the agent ends its turn.
#
# The plugin's skills say a Python change is finished only once
# `uv run mypy backend/ tests/` reports no errors. This handler
# enforces that: when the agent is about to end its turn inside a
# Reboot project whose Python changed since the last run with no
# errors, it runs that exact command, with the same pinned `uv` the
# agent's shell commands run, and, on errors, blocks the stop with
# mypy's report as the agent's next input, so the agent fixes the
# errors before its turn ends.
#
# Both Claude Code and Codex run this handler: both auto-discover the
# plugin's `hooks/hooks.json`, and the fields it reads (`cwd`,
# `stop_hook_active`) and the outputs it emits (`decision` with
# `reason`, `systemMessage`) mean the same in both. Each CLI gives the agent a
# `block` reason as its next prompt.
#
# The check runs when all of these are true:
#
#   - The session is inside a Reboot project: a `.rbtrc` at or above
#     `cwd`.
#   - The project root has a `.mypy.ini`, the type-check config the
#     `python` skill's `references/lifecycle-project-setup.md`
#     describes.
#   - The `generate --python=` output directory named in `.rbtrc`
#     (default `backend/api`) exists, which means `rbt generate` has
#     written the `*_rbt` modules the servicers import.
#   - A `.py` file under `api/`, `backend/`, or `tests/` is newer than
#     the stamp file in `.mypy_cache/` that the last run with no errors
#     wrote.
#
# At every other stop this handler prints nothing and the turn ends,
# so a turn that changed no Python runs no mypy. When the check runs:
#
#   - mypy reports no errors: write the stamp file, print nothing; the
#     turn ends.
#   - mypy reports errors, first stop of the turn: block, with the
#     last lines of the output as the reason.
#   - mypy reports errors, and this hook already blocked one stop this
#     turn (`stop_hook_active`): print a `systemMessage` for the
#     developer and let the turn end, so an agent that failed to fix
#     the errors can ask for help.
#   - mypy exited with a status other than 0 or 1 (it is missing from
#     the environment, or crashed): print a `systemMessage` for the
#     developer and let the turn end.
#
# Every path exits 0: both CLIs report a non-zero status as a hook
# error. To let the turn end, this handler prints nothing.

set -eu

input=$(cat)

# Extract a top-level field from the input JSON as text: a string as
# is, a boolean as `true` / `false`, anything else as empty. Parses
# with `python3` when available, so the value comes from the real
# field even when another field's text looks like `"cwd": ...`; uses
# a sed match on the raw text otherwise. The same parser as
# `remind.sh`, plus booleans.
field() {
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "$input" | python3 -c '
import json
import sys

value = json.load(sys.stdin).get(sys.argv[1])
if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, str):
    print(value)
else:
    print("")
' "$1" 2>/dev/null && return 0
    fi
    printf '%s' "$input" | sed -n \
        -e "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" \
        -e "s/.*\"$1\"[[:space:]]*:[[:space:]]*\\(true\\).*/\\1/p" \
        -e "s/.*\"$1\"[[:space:]]*:[[:space:]]*\\(false\\).*/\\1/p"
}

# Print $1 as a JSON string literal, quotes included. `python3` when
# available; otherwise sed and awk escape the characters mypy output
# can contain that a JSON string must escape: backslashes, double
# quotes, tabs, and newlines.
json_string() {
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "$1" | python3 -c '
import json
import sys

print(json.dumps(sys.stdin.read()), end="")
' 2>/dev/null && return 0
    fi
    tab=$(printf '\t')
    printf '%s' "$1" |
        sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/${tab}/\\\\t/g" |
        awk 'BEGIN { printf "\"" }
             NR > 1 { printf "\\n" }
             { printf "%s", $0 }
             END { printf "\"" }'
}

# Print the Reboot project root: the directory at or above `cwd`
# (falling back to this process's working directory) that has a
# `.rbtrc`. Fails when there is none. The same search as `remind.sh`.
project_root() {
    dir=$(field cwd)
    [ -n "$dir" ] || dir=$PWD
    case "$dir" in
        /*) ;;
        *) dir="${PWD}/${dir}" ;;
    esac
    while [ -n "$dir" ] && [ "$dir" != "/" ]; do
        if [ -f "${dir}/.rbtrc" ]; then
            printf '%s' "$dir"
            return 0
        fi
        dir="${dir%/*}"
    done
    if [ -f "/.rbtrc" ]; then
        printf '/'
        return 0
    fi
    return 1
}

[ "$(field hook_event_name)" = "Stop" ] || exit 0

root=$(project_root) || exit 0
cd "$root" || exit 0

[ -f .mypy.ini ] || exit 0

# Where `rbt generate` writes the Python bindings, per `.rbtrc`.
generated=$(sed -n \
    's/^generate[[:space:]][[:space:]]*--python[=[:space:]][[:space:]]*\([^[:space:]]*\).*/\1/p' \
    .rbtrc | head -n 1)
[ -n "$generated" ] || generated=backend/api
[ -d "$generated" ] || exit 0

# The directories whose `.py` files decide whether there is anything
# new to check, and the subset passed to mypy, the invocation the
# skills prescribe. `api/` has the pydantic API definition, which mypy
# checks through the servicers' imports.
watched=""
targets=""
for dir in api backend tests; do
    [ -d "$dir" ] || continue
    watched="$watched $dir"
    case "$dir" in
        backend | tests) targets="$targets $dir/" ;;
    esac
done
[ -n "$targets" ] || exit 0

stamp=.mypy_cache/reboot-plugin-type-check
if [ -f "$stamp" ]; then
    # shellcheck disable=SC2086
    changed=$(find $watched -name '*.py' -newer "$stamp" 2>/dev/null |
        head -n 1)
    [ -n "$changed" ] || exit 0
fi

# The agent's `uv` is the plugin's pinned shim: `session-start.sh` puts
# the plugin's `bin/` first on the PATH of the agent's shell commands.
# Hook commands get the CLI's own PATH, so put `bin/` first here as
# well; the hook and the agent then run the same uv against the same
# virtualenv.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PATH="${CLAUDE_PLUGIN_ROOT%/}/bin:$PATH"
fi

if command -v uv >/dev/null 2>&1 && [ -f pyproject.toml ]; then
    runner="uv run mypy"
elif command -v mypy >/dev/null 2>&1; then
    runner="mypy"
else
    exit 0
fi
command_line="$runner$targets"

# The stamp file's mtime is the time the check started, so a file that
# a watcher regenerates while mypy runs is newer than the stamp and is
# checked at the next stop.
mkdir -p "${stamp%/*}" && touch "$stamp.pending"

# mypy writes its report to stdout. stderr is where uv reports what
# it installed, where the shim reports a first-time install, and where
# either says why it failed to run. The two are kept apart so the
# agent receives the report alone.
stderr_file=$(mktemp)
trap 'rm -f "$stderr_file"' EXIT

# shellcheck disable=SC2086
output=$($runner $targets 2>"$stderr_file") && status=0 || status=$?

if [ "$status" -eq 0 ]; then
    mv "$stamp.pending" "$stamp"
    exit 0
fi
rm -f "$stamp.pending"

# mypy exits 1 when it found type errors. Any other status means mypy
# checked nothing: it is missing from the environment, its config is
# invalid, or it crashed.
if [ "$status" -ne 1 ]; then
    first_line=$(tr -d '\r' <"$stderr_file" | head -n 1)
    [ -n "$first_line" ] ||
        first_line=$(printf '%s\n' "$output" | tr -d '\r' | head -n 1)
    message="[reboot-plugin] Could not type-check this Reboot project:"
    message="$message \`$command_line\` exited $status: $first_line"
    printf '{"systemMessage":%s}\n' "$(json_string "$message")"
    exit 0
fi

if [ "$(field stop_hook_active)" = "true" ]; then
    summary=$(printf '%s\n' "$output" | tr -d '\r' | tail -n 1)
    message="[reboot-plugin] \`$command_line\` still reports errors after"
    message="$message one blocked stop, so the turn was allowed to end:"
    message="$message $summary"
    printf '{"systemMessage":%s}\n' "$(json_string "$message")"
    exit 0
fi

# Limit how much output goes into the agent's context: mypy prints one
# line per error and a final "Found N errors" line, so the last 60
# lines have the count and up to 59 errors.
tail_lines=60
excerpt=$(printf '%s\n' "$output" | tr -d '\r' | tail -n "$tail_lines")

reason="[reboot-plugin-type-check] \`$command_line\` reports errors. Fix"
reason="$reason every one before finishing; this check runs again when you"
reason="$reason stop. Do not silence an error with \`# type: ignore\` or by"
reason="$reason widening the ignore stanza in \`.mypy.ini\`."

# An error about a missing `*_rbt` module means the generated code is
# out of date. That is the one error whose fix is a command instead of
# an edit, so the hint appears only when the report mentions one.
case "$excerpt" in
    *_rbt*)
        reason="$reason An error naming a missing \`*_rbt\` module means"
        reason="$reason \`uv run rbt generate\` has to run first."
        ;;
esac
reason="$reason

$excerpt"

printf '{"decision":"block","reason":%s}\n' "$(json_string "$reason")"
exit 0
