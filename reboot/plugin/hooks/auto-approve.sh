#!/usr/bin/env sh
# Auto-approve safe read-only tool calls on this plugin's own skill
# files. Dispatches on `tool_name` from the PreToolUse hook input on
# stdin.
#
# Scope (all conditions must hold):
#
#   - $CLAUDE_PLUGIN_ROOT must be set. Claude Code sets this to the
#     actual install path of the plugin when invoking its hooks. Without
#     it we have no reliable way to tell whether a path is inside this
#     plugin vs. another directory that happens to be named similarly.
#   - The target path must start with `$CLAUDE_PLUGIN_ROOT/skills/` —
#     i.e. this specific plugin's installed location, not just any
#     `plugin/skills/` directory.
#   - The path must NOT contain `..` — would let it step out of the
#     plugin root after passing the prefix check.
#   - For Bash specifically: the command must START with one of a
#     small allowlist of read-only binaries (ls, cat, head, tail,
#     find, wc, file, stat), and must NOT contain shell metacharacters
#     that could chain / pipe / redirect / interpolate
#     (`;` `&` `|` `<` `>` `` ` `` `$`).
#
# Anything not matching exits silently with status 0; Claude Code then
# falls back to the normal permission prompt.

# No env var ⇒ defer to normal prompt.
if [ -z "${CLAUDE_PLUGIN_ROOT}" ]; then
    exit 0
fi

input=$(cat)

emit_allow() {
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
}

# Extract a top-level string field from the input JSON. Naive sed parse
# — fine for Claude Code's flat tool_input shape (no escaped quotes in
# paths).
field() {
    printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

is_in_plugin() {
    # Empty string fails (no prefix match against a non-empty constant).
    case "$1" in
        "${CLAUDE_PLUGIN_ROOT}/skills/"*)
            return 0
            ;;
    esac
    return 1
}

has_traversal() {
    case "$1" in *..* ) return 0 ;; esac
    return 1
}

tool=$(field tool_name)

case "$tool" in
    Read)
        path=$(field file_path)
        has_traversal "$path" && exit 0
        is_in_plugin "$path" && emit_allow
        ;;
    LS|Glob|Grep)
        # All three take a `path` parameter (optional for Glob/Grep —
        # if absent the field is empty and is_in_plugin will reject).
        path=$(field path)
        has_traversal "$path" && exit 0
        is_in_plugin "$path" && emit_allow
        ;;
    Bash)
        cmd=$(field command)
        has_traversal "$cmd" && exit 0
        # Normalize: strip known-safe I/O redirects, then split chained
        # commands (`&&`, `||`, `|`, `;`) into one-per-line. Each part
        # is then validated independently. Anything still containing
        # risky metacharacters after normalization (`&`, `<`, `>`,
        # `` ` ``, `$`, `(`, `)`, `\`) falls through to a normal
        # permission prompt.
        parts=$(printf '%s' "$cmd" | sed \
            -e 's/[[:space:]]*2>&1//g' \
            -e 's/[[:space:]]*2>\/dev\/null//g' \
            -e 's/[[:space:]]*>\/dev\/null//g' \
            -e 's/&&/\n/g' \
            -e 's/||/\n/g' \
            -e 's/|/\n/g' \
            -e 's/;/\n/g')
        case "$parts" in
            *\&* | *\<* | *\>* | *\`* | *\$* | *\(* | *\)* | *\\* )
                exit 0
                ;;
        esac
        # Iterate each part. Approve only if at least one non-empty
        # part is a safe read-only op on a path inside this plugin AND
        # no part is unsafe. A part is "safe" if it is either:
        #
        #   (a) one of the safe read-only binaries followed by a path
        #       inside this plugin (the producer side of a pipeline,
        #       or a standalone op), or
        #
        #   (b) a pure stdin filter — head, tail, wc, sort, uniq —
        #       with no arguments, or with arguments that are ALL
        #       flags (`-x`, `--long`) or numerics. This covers
        #       `… | head -50`, `… | wc -l`, etc., but rejects
        #       `… | head bar.txt` and `… | head /etc/passwd` because
        #       those args are paths, not flags/numerics.
        printf '%s\n' "$parts" | (
            approved=0
            while IFS= read -r part; do
                trimmed=$(printf '%s' "$part" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
                [ -z "$trimmed" ] && continue
                case "$trimmed" in
                    'ls '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'cat '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'head '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'tail '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'find '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'wc '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'file '*"${CLAUDE_PLUGIN_ROOT}/skills/"* | \
                    'stat '*"${CLAUDE_PLUGIN_ROOT}/skills/"* )
                        approved=$((approved + 1))
                        ;;
                    head | tail | wc | sort | uniq)
                        # Stdin filter with no args.
                        approved=$((approved + 1))
                        ;;
                    'head '* | 'tail '* | 'wc '* | 'sort '* | 'uniq '*)
                        # Stdin filter with args — every arg must be a
                        # flag (`-X` / `--long`) or numeric.
                        cmd_name="${trimmed%% *}"
                        cmd_args="${trimmed#${cmd_name} }"
                        args_ok=1
                        for arg in $cmd_args; do
                            case "$arg" in
                                -* | [0-9]*) ;;
                                *) args_ok=0; break ;;
                            esac
                        done
                        if [ "$args_ok" = "1" ]; then
                            approved=$((approved + 1))
                        else
                            exit 1
                        fi
                        ;;
                    *)
                        exit 1
                        ;;
                esac
            done
            [ "$approved" -gt 0 ]
        ) && emit_allow
        ;;
esac
