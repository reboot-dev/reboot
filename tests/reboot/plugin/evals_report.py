"""
Turn the nightly plugin evals' `claude plugin eval --json` results
into one report: a row per grader with its count without skills, on
the last evaluated `main`, and on tonight's `main`, and a severity
taken from tonight's count alone.

    python3 evals_report.py --tonight tonight.json --tonight-commit SHA \
        [--baseline baseline.json --baseline-commit SHA]

Prints the report as Markdown, its first line the mail's subject, and
exits 1 when any grader is critical.
"""

import argparse
import json
import sys
from typing import Optional

PASS = "🟢 Pass"
WARNING = "🟡 Warning"
CRITICAL = "🔴 Critical"


def counts(result: dict, arm: str) -> dict[tuple[str, str], tuple[int, int]]:
    """(case, grader) -> (runs passed, runs) for one arm of a result."""
    out: dict[tuple[str, str], tuple[int, int]] = {}
    for case in result["cases"]:
        runs = case["arms"].get(arm, [])
        # A run that errored lists no graders and counts as a failure.
        # Every grader runs with the plugin, so that arm takes them from
        # the case and keeps a case whose runs all errored. The
        # without-skills arm skips graders that only check a skill
        # loaded, so it has the graders its runs list.
        names = {g["name"] for run in runs for g in run["graders"]}
        if arm == "with":
            names |= {g["name"] for g in case["graders"]}
        for name in sorted(names):
            passed = sum(
                g["passed"] for run in runs for g in run["graders"]
                if g["name"] == name
            )
            out[(case["name"], name)] = (passed, len(runs))
    return out


def severity(passed: int, total: int) -> str:
    if total > 0 and passed == total:
        return PASS
    if passed * 2 > total:
        return WARNING
    return CRITICAL


def show(count: Optional[tuple[int, int]]) -> str:
    return "—" if count is None else f"{count[0]}/{count[1]}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tonight", required=True)
    parser.add_argument("--tonight-commit", required=True)
    parser.add_argument("--baseline")
    parser.add_argument("--baseline-commit")
    args = parser.parse_args()

    with open(args.tonight) as f:
        tonight = json.load(f)
    baseline = None
    if args.baseline:
        with open(args.baseline) as f:
            baseline = json.load(f)

    with_skills = counts(tonight, "with")
    without_skills = counts(tonight, "without")
    last_main = counts(baseline, "with") if baseline else {}

    rows = []
    tally = {PASS: 0, WARNING: 0, CRITICAL: 0}
    for (case, grader), count in with_skills.items():
        level = severity(*count)
        tally[level] += 1
        without = without_skills.get((case, grader))
        lift = "—" if without is None else f"{count[0] - without[0]:+d}"
        rows.append(
            f"| {case} | {grader} | {show(without)} "
            f"| {show(last_main.get((case, grader)))} | {show(count)} "
            f"| {lift} | {level} |"
        )

    subject = (
        f"Nightly plugin evals: {tally[CRITICAL]} critical, "
        f"{tally[WARNING]} warning, {tally[PASS]} pass"
    )
    cost = tonight["costUsd"] + (baseline["costUsd"] if baseline else 0)

    print(f"## {subject}")
    print()
    print(f"- Tonight's `main`: `{args.tonight_commit}`")
    if baseline:
        print(f"- Last evaluated `main`: `{args.baseline_commit}`")
    else:
        print("- Last evaluated `main`: none, so no comparison column")
    print(f"- Claude Code {tonight['claudeVersion']}, judged by "
          f"{tonight['suite']['judgeModel']}")
    print(f"- Cost: ${cost:.2f}")
    print()
    print(
        "Severity is from tonight's count alone: every run passed is a "
        "pass, a majority is a warning, anything less is critical. "
        "Lift is tonight's passes with the skills minus without them; "
        "graders that only check a skill loaded have no without-skills "
        "count."
    )
    print()
    print(
        "| Case | Grader | Without skills | Last `main` | Tonight "
        "| Lift | Severity |"
    )
    print("|---|---|---|---|---|---|---|")
    print("\n".join(rows))

    sys.exit(1 if tally[CRITICAL] else 0)


if __name__ == "__main__":
    main()
