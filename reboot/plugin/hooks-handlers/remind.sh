#!/usr/bin/env sh
# Inject a short "consult the Reboot skills, don't guess" reminder
# into the model's context. Registered in `hooks.json` for two hook
# events, and dispatches on `hook_event_name` from the hook input on
# stdin:
#
#   - SessionStart: always emits the reminder. This event fires at
#     the points where in-conversation copies of the reminder get
#     dropped (startup, resume, `/clear`, compaction), so it
#     re-injects right after each of them.
#   - UserPromptSubmit: emits the reminder only when the transcript's
#     recent tail no longer contains it, so long sessions see it
#     again every so often without it piling up on every turn.
#
# Both Claude Code and Codex run this handler — both auto-discover
# the plugin's `hooks/hooks.json`, set `$CLAUDE_PLUGIN_ROOT` for its
# commands, pass the same stdin fields, and accept the same
# `hookSpecificOutput.additionalContext` output shape, which each CLI
# records into the conversation for the model's next request.
#
# The reminder is scoped to Reboot projects: it is emitted only when
# the session's working directory, or an ancestor, holds a `.rbtrc`.
# The plugin is typically installed globally, so this handler runs in
# every session, including ones that have nothing to do with Reboot;
# those stay reminder-free.
#
# When the transcript path is absent, `null`, or unreadable, the
# handler errs on the side of emitting: a duplicate reminder costs a
# few tokens, while a skipped one defeats the hook's purpose.

set -eu

input=$(cat)

# Extract a top-level string field from the input JSON. Parses with
# `python3` when available, so field-shaped text inside other fields
# (e.g. a prompt that itself contains `"transcript_path": ...`) can
# not shadow the real value. Falls back to a naive sed parse
# otherwise; a sed mismatch at worst changes when the reminder is
# emitted.
field() {
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "$input" | python3 -c '
import json
import sys

value = json.load(sys.stdin).get(sys.argv[1])
print(value if isinstance(value, str) else "")
' "$1" 2>/dev/null && return 0
    fi
    printf '%s' "$input" | sed -n \
        "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

# True (0) when the session runs inside a Reboot project: the `cwd`
# the CLI passes in the hook input — or, when that field is absent,
# this process's own working directory — or any ancestor of it holds
# a `.rbtrc`. Mirrors the gate the `auto-approve.sh` PreToolUse hook
# applies to the `run` skill's dev commands.
in_reboot_project() {
    dir=$(field cwd)
    [ -n "$dir" ] || dir=$PWD
    # Resolve a relative directory against this process's own working
    # directory: the walk below strips one `/`-separated component per
    # iteration, so it terminates only when `dir` is absolute.
    case "$dir" in
        /*) ;;
        *) dir="${PWD}/${dir}" ;;
    esac
    while [ -n "$dir" ] && [ "$dir" != "/" ]; do
        [ -f "${dir}/.rbtrc" ] && return 0
        dir="${dir%/*}"
    done
    [ -f "/.rbtrc" ]
}

in_reboot_project || exit 0

# First line of the reminder. The UserPromptSubmit throttle greps the
# transcript tail for it: both CLIs record every injected copy into
# the transcript verbatim, so finding this marker means a recent copy
# is still in context.
sentinel='[reboot-plugin-reminder]'

# How many trailing transcript lines count as "recent". A transcript
# line is one conversation entry (a user or assistant message or a
# tool result), so this is roughly twenty tool round-trips.
tail_lines=40

event=$(field hook_event_name)

case "$event" in
    SessionStart)
        ;;
    UserPromptSubmit)
        transcript=$(field transcript_path)
        if [ -n "$transcript" ] && [ -r "$transcript" ] &&
            tail -n "$tail_lines" "$transcript" | grep -Fq "$sentinel"
        then
            exit 0
        fi
        ;;
    *)
        # Registered for the two events above only; stay silent on
        # anything else.
        exit 0
        ;;
esac

reminder=$(
    cat <<'EOF'
[reboot-plugin-reminder] Reboot guidance for this session:
- Do not guess Reboot platform behavior (idempotency, scheduling,
authorizers, state construction, contexts, generated APIs). Before
coding around any Reboot behavior, read the relevant reference in the
Reboot plugin's skills (`python`, `chat-app`, `web-app`, `run`,
`upgrade`) and state what it says.
- Before hand-rolling a primitive (maps, queues, pub/sub, presence,
encryption), check Reboot's standard library: the `stdlib-*.md`
references in the `python` skill.
- Deploys and dev-loop restarts are slow; never use repeated deploys
or restarts to discover how Reboot behaves. After two failed attempts
at the same goal, stop, read the relevant skill reference, and explain
the constraint before trying again.
EOF
)

# JSON-encode the reminder: it contains no double quotes or
# backslashes by construction, so only its newlines need escaping.
escaped=$(
    printf '%s' "$reminder" \
        | awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }'
)

output='{"hookSpecificOutput":{"hookEventName":"'"$event"'"'
output="$output,\"additionalContext\":\"$escaped\"}}"
printf '%s\n' "$output"
