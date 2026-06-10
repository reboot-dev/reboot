#!/usr/bin/env sh
# Auto-approve two narrow, safe categories of tool call so a
# skill's own steps don't each trigger a permission prompt.
# Dispatches on `tool_name` from the PreToolUse hook input on
# stdin.
#
#   1. Read-only inspection of this plugin's OWN skill files, so a
#      skill can read its sibling references. Covers the Read, LS,
#      Glob, and Grep tools, plus a small allowlist of read-only
#      Bash binaries (ls, cat, head, tail, find, wc, file, stat)
#      aimed at a path under `$CLAUDE_PLUGIN_ROOT/skills/`.
#
#   2. The Reboot dev commands the `run` skill issues to bring an
#      app up — `uv sync`, `npm install`, `npm run dev`,
#      `cloudflared tunnel …`, `uv run rbt dev run …`,
#      `npx @mcpjam/inspector …` — but ONLY when they run inside a
#      Reboot project tree (the working directory, or an ancestor,
#      holds a `.rbtrc`).
#
# Guards that hold for every case:
#
#   - $CLAUDE_PLUGIN_ROOT must be set. Claude Code sets it to the
#     plugin's real install path when invoking its hooks; without
#     it the `.../skills/` prefix check is meaningless.
#   - No argument may contain `..` — that would let a path step
#     out of whatever directory it was checked against.
#
# For Bash, the command is split — on `;` `&&` `||` `|` — into
# parts validated independently. A part with a metacharacter that
# could chain, redirect, or interpolate (`&` `<` `>` `` ` `` `$`
# `(` `)` `\`) is never approved. Every part must match category
# 1, a stdin filter, a bare `cd`, or a category-2 Reboot dev
# command; the call is approved only if at least one part is a
# real op and none is unsafe.
#
# Anything not matching exits silently with status 0; Claude Code
# then falls back to the normal permission prompt.

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

# True (0) when every whitespace-separated token in $1 is a flag
# (`-x` / `--long`) or a bare number. An empty list is true, so a
# command with no arguments passes.
args_all_flags() {
    for arg in $1; do
        case "$arg" in
            -* | [0-9]*) ;;
            *) return 1 ;;
        esac
    done
    return 0
}

# True (0) when $1 — resolved against $cwd when relative — sits
# inside a Reboot project: that directory, or any ancestor, holds
# a `.rbtrc`. Gates auto-approval of the `run` skill's Reboot dev
# commands; outside a project they fall through to the prompt.
in_reboot_project() {
    dir=$1
    case "$dir" in
        /*) ;;
        *) dir="${cwd}/${dir}" ;;
    esac
    while [ -n "$dir" ] && [ "$dir" != "/" ]; do
        [ -f "${dir}/.rbtrc" ] && return 0
        dir="${dir%/*}"
    done
    [ -f "/.rbtrc" ]
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
        # The directory Claude Code launched the tool from. Used to
        # resolve relative paths and to gate the Reboot dev commands.
        cwd=$(field cwd)
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
        # part is a real safe op AND no part is unsafe. A part is
        # "safe" if it is one of:
        #
        #   (a) a safe read-only binary followed by a path inside this
        #       plugin's skills (the producer side of a pipeline, or a
        #       standalone op);
        #
        #   (b) a pure stdin filter — head, tail, wc, sort, uniq —
        #       with no arguments, or with arguments that are ALL
        #       flags (`-x`, `--long`) or numerics. Covers
        #       `… | head -50`, `… | wc -l`; rejects `… | head x.txt`;
        #
        #   (c) a bare `cd` — no side effects of its own; it only
        #       moves the working directory tracked in `effective_dir`
        #       so the Reboot project gate below sees the right place;
        #
        #   (d) a Reboot dev command the `run` skill issues — gated on
        #       `in_reboot_project` and (where its arguments are
        #       flags) on `args_all_flags`.
        #
        # A `cd` part is safe but is not itself a "real op", so a
        # command that is only `cd …` still defers to the prompt.
        printf '%s\n' "$parts" | (
            approved=0
            effective_dir=$cwd
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
                        args_all_flags "${trimmed#$cmd_name}" || exit 1
                        approved=$((approved + 1))
                        ;;
                    cd | 'cd '*)
                        # No side effects; just retarget the working
                        # directory for the Reboot project gate below.
                        target="${trimmed#cd}"
                        target="${target# }"
                        case "$target" in
                            '') ;;
                            /*) effective_dir=$target ;;
                            *) effective_dir="${effective_dir}/${target}" ;;
                        esac
                        ;;
                    'uv sync' | 'uv sync '*)
                        # `run` skill — backend dependency install.
                        in_reboot_project "$effective_dir" || exit 1
                        args_all_flags "${trimmed#uv sync}" || exit 1
                        approved=$((approved + 1))
                        ;;
                    'npm install' | 'npm install '*)
                        # `run` skill — frontend dependency install.
                        # Flag-only: never a positional package name.
                        in_reboot_project "$effective_dir" || exit 1
                        args_all_flags "${trimmed#npm install}" || exit 1
                        approved=$((approved + 1))
                        ;;
                    'npm run dev' | 'npm run dev '*)
                        # `run` skill — frontend dev server.
                        in_reboot_project "$effective_dir" || exit 1
                        args_all_flags "${trimmed#npm run dev}" || exit 1
                        approved=$((approved + 1))
                        ;;
                    'uv run rbt dev run' | 'uv run rbt dev run '*)
                        # `run` skill — start the Reboot backend.
                        in_reboot_project "$effective_dir" || exit 1
                        args_all_flags "${trimmed#uv run rbt dev run}" \
                            || exit 1
                        approved=$((approved + 1))
                        ;;
                    'cloudflared tunnel '* )
                        # `run` skill — start the Cloudflare quick tunnel before `rbt dev run`.
                        in_reboot_project "$effective_dir" || exit 1
                        args="${trimmed#cloudflared tunnel }"
                        # Require exactly: --metrics localhost:<port> and --url http://localhost:<port> (either order).
                        set -- $args
                        [ "$#" -eq 4 ] || exit 1
                        if [ "$1" = "--metrics" ] && [ "$3" = "--url" ]; then
                            metrics="$2"; url="$4"
                        elif [ "$1" = "--url" ] && [ "$3" = "--metrics" ]; then
                            metrics="$4"; url="$2"
                        else
                            exit 1
                        fi
                        case "$metrics" in localhost:*) mport="${metrics#localhost:}" ;; *) exit 1 ;; esac
                        case "$url" in http://localhost:*) bport="${url#http://localhost:}" ;; *) exit 1 ;; esac
                        case "$mport" in ''|*[!0-9]*) exit 1 ;; esac
                        case "$bport" in ''|*[!0-9]*) exit 1 ;; esac
                        approved=$((approved + 1))
                        ;;
                    'npx @mcpjam/inspector'* | 'mcpjam-inspector'*)
                        # `run` skill — MCPJam inspector for Chat Apps,
                        # whether invoked directly or via the plugin's
                        # `mcpjam-inspector` shim (the on-demand path
                        # when the user asks us to launch it). Its
                        # `--url <url>` / `--config <file>` arguments are
                        # not flags, so the project gate and the
                        # metacharacter screen are the guard.
                        in_reboot_project "$effective_dir" || exit 1
                        approved=$((approved + 1))
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

# Always exit 0: this hook either emits an "allow" decision JSON or
# silently defers to the normal permission prompt. A non-zero status
# would surface as a "PreToolUse hook error" in Claude Code, even
# though the intent is just "no decision". Several branches above can
# fall through with a non-zero last-command status (e.g. `is_in_plugin
# … && emit_allow` when the path is not in the plugin, or the Bash
# subshell exiting 1 to signal "did not match the allowlist"); this
# normalizes all of those to a clean defer.
exit 0
