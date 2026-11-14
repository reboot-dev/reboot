#!/usr/bin/env bash
#
# Compare this branch's plugin with `main`'s on the eval cases and
# write the result to RESULT.md, for the PR's reviewer.
#
#   tests/reboot/plugin/evals/compare.sh [claude plugin eval flags...]
#   tests/reboot/plugin/evals/compare.sh --check
#
# Run it once, when the branch is done, and commit RESULT.md. It runs
# every case against the plugin at the commit the branch left `main`
# from, and against the branch's plugin with and without it loaded.
# The raw results stay in results/compare-<time>/, which git ignores.
#
# A flag that would run part of the suite or another plugin is
# refused, because RESULT.md is recorded for the whole change. Use
# `run.sh` to try one case.
#
# RESULT.md records the ID of the branch's change to the plugin and the
# cases (`git patch-id`). `--check` runs no evals: it fails when the
# branch changes the plugin or the cases and RESULT.md does not record
# that change's ID. A rebase keeps the ID, so a result stays current
# until the branch changes the plugin or the cases again.
#
# `BASE_REF` names the branch to compare with, `origin/main` if unset.

set -euo pipefail
HERE="$(cd "$(dirname -- "$0")" && pwd)"
cd "$(git -C "$HERE" rev-parse --show-toplevel)"
EVALS=tests/reboot/plugin/evals
RESULT="$EVALS/RESULT.md"
# The parts of the plugin that `run.sh` loads.
PLUGIN=(reboot/plugin/skills reboot/plugin/hooks reboot/plugin/hooks-handlers reboot/plugin/bin reboot/plugin/lib)
# What a result depends on. RESULT.md and the README do not affect it.
CHANGE=("${PLUGIN[@]}" "$EVALS" ":(exclude,glob)$EVALS/*.md")
BASE="$(git merge-base "${BASE_REF:-origin/main}" HEAD)"

# The options are fixed so that the ID does not depend on the git
# configuration of the machine that computes it. No context lines
# (`-U0`), so that a rebase over a change to a nearby line keeps the ID.
change_id() {
  git diff -U0 --no-color --no-ext-diff --no-textconv --no-renames \
    --diff-algorithm=myers "$BASE" HEAD -- "${CHANGE[@]}" \
    | git patch-id --stable | cut -d' ' -f1
}

ID="$(change_id)"
if [ -z "$ID" ]; then
  echo "This branch does not change the plugin or its eval cases."
  exit 0
fi

if [ "${1:-}" = --check ]; then
  if grep -qF "\`$ID\`" "$RESULT" 2>/dev/null; then
    echo "$RESULT records this branch's change ($ID)."
    exit 0
  fi
  echo "This branch changes the plugin or its eval cases, and $RESULT" >&2
  echo "does not record a run for that change ($ID)." >&2
  echo "Run $EVALS/compare.sh and commit $RESULT." >&2
  echo "The steps are in $EVALS/README.md, under" >&2
  echo "\"If \`Check Plugin Evals Result\` fails\"." >&2
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    --case|--plugin|--ablation|--runs|--output-dir)
      echo "compare.sh does not take $arg: RESULT.md records a full run of" >&2
      echo "every case. Use $EVALS/run.sh to try one case." >&2
      exit 1 ;;
  esac
done

if [ -n "$(git status --porcelain -- "${CHANGE[@]}")" ]; then
  echo "Commit the changes to the plugin and the cases first: the result" >&2
  echo "is recorded for the committed change." >&2
  exit 1
fi

# An absolute path, because `run.sh` runs the evals from another folder.
OUT="$PWD/$EVALS/results/compare-$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$OUT"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/reboot-evals-compare.XXXXXX")"
# `|| true`, because there is no worktree when the plugin is unchanged,
# and a failure here would become the script's exit status.
trap 'git worktree remove --force "$TMP/base" 2>/dev/null || true; rm -rf "$TMP"' EXIT
report=(--change "$ID" --branch "$OUT/branch/aggregate-result.json"
        --branch-commit "$(git rev-parse --short HEAD)")

# `--threshold 0`, so a low score does not stop the comparison.
if git diff --quiet "$BASE" HEAD -- "${PLUGIN[@]}"; then
  echo "The plugin is unchanged, so there is no run against main's plugin."
else
  git worktree add --detach "$TMP/base" "$BASE" > /dev/null
  "$EVALS/run.sh" --plugin "$TMP/base/reboot/plugin" \
    --ablation none --threshold 0 -j 4 "$@" --output-dir "$OUT/main"
  report+=(--main "$OUT/main/aggregate-result.json"
           --main-commit "$(git rev-parse --short "$BASE")")
fi
"$EVALS/run.sh" --ablation with-without --threshold 0 -j 4 "$@" \
  --output-dir "$OUT/branch"

# Written aside first, so that a failure leaves the old RESULT.md alone.
python3 tests/reboot/plugin/evals_report.py "${report[@]}" > "$TMP/RESULT.md"
mv "$TMP/RESULT.md" "$RESULT"
echo "Wrote $RESULT. Commit it. The raw results are in $OUT."
