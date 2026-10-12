#!/usr/bin/env bash
#
# Run the plugin's eval cases with `claude plugin eval`, against this
# checkout's plugin or another one, with and without the plugin.
#
#   tests/reboot/plugin/evals/run.sh [--plugin DIR] [claude plugin eval flags...]
#   e.g. tests/reboot/plugin/evals/run.sh -j 3
#        tests/reboot/plugin/evals/run.sh --case route-mcp --runs 1 --ablation none
#        tests/reboot/plugin/evals/run.sh --plugin ../other/reboot/plugin --ablation none
#
# `claude plugin eval` wants the cases inside the plugin, and a run must
# be able to read the plugin's references by their real path, so this
# builds a throwaway wrapper: a plugin.json, copies of skills/, hooks/,
# hooks-handlers/ and these cases, and links to bin/ and lib/. Every
# hook is kept: the eval sees the plugin as a user does. Judging is by
# Sonnet unless a --judge-model is given; Haiku failed designs that
# plainly met a rubric. A case with a fixture gets --scaffold. Results
# land in results/ beside this script, with the plugin's commit in
# plugin.txt.

set -euo pipefail
HERE="$(cd "$(dirname -- "$0")" && pwd)"
PLUGIN="$(cd "$HERE/../../../../reboot/plugin" && pwd)"
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) PLUGIN="$(cd "$2" && pwd)"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- ${args[@]+"${args[@]}"}
case " $* " in *" --judge-model "*) ;; *) set -- --judge-model sonnet "$@" ;; esac
case " $* " in *" --scaffold "*|*" --no-scaffold "*) ;; *) set -- --scaffold "$@" ;; esac

WRAP="$(mktemp -d "${TMPDIR:-/tmp}/reboot-evals.XXXXXX")"
trap 'rm -rf "$WRAP"' EXIT
mkdir -p "$WRAP/.claude-plugin"
for d in skills hooks hooks-handlers; do rsync -a "$PLUGIN/$d/" "$WRAP/$d/"; done
for d in bin lib; do ln -s "$PLUGIN/$d" "$WRAP/$d"; done
rev="$(git -C "$PLUGIN" rev-parse --short HEAD)$(git -C "$PLUGIN" diff --quiet -- skills hooks hooks-handlers || echo -dirty)"
cat > "$WRAP/.claude-plugin/plugin.json" <<JSON
{"name": "reboot", "version": "0.0.0-$rev", "description": "Eval wrapper for $PLUGIN at $rev."}
JSON
rsync -a --exclude results --exclude run.sh --exclude README.md --exclude .gitignore "$HERE/" "$WRAP/evals/"
echo "plugin: $PLUGIN at $rev"

status=0
(cd "$WRAP" && claude plugin eval . --no-publish --trust-plugin "$@") || status=$?
mkdir -p "$HERE/results"
for dir in "$WRAP/evals/results"/*/; do
  [ -f "$dir/aggregate-result.json" ] || continue
  out="$HERE/results/$(basename -- "$dir")"
  cp -R "$dir" "$out"
  echo "$rev $PLUGIN" > "$out/plugin.txt"
  echo "results: $out"
done
exit "$status"
