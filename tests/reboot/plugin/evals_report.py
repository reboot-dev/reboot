"""
Turn a branch's `claude plugin eval --json` results into the report
that `evals/compare.sh` writes to RESULT.md: what got worse or better
than on `main`, then a table of each grader's count.

    python3 evals_report.py --change ID \
        --branch branch.json --branch-commit SHA \
        [--main main.json --main-commit SHA]

`--branch` is the result for the branch's plugin, with and without
the plugin loaded. `--main` is the result for the plugin the branch
started from, and is absent when the branch does not change the
plugin. Prints the report as Markdown, ending with the ID that
`compare.sh --check` looks for.
"""

import argparse
import json
from typing import Optional

Key = tuple[str, str]
Count = tuple[int, int]


def counts(result: dict, arm: str) -> dict[Key, Count]:
    """(case, grader) -> (runs passed, runs) for one arm of a result."""
    out: dict[Key, Count] = {}
    for case in result["cases"]:
        runs = case["arms"].get(arm, [])
        # A run that errored lists no graders and counts as a failure.
        # Every grader runs with the plugin, so that arm takes them from
        # the case and keeps a case whose runs all errored. The
        # without-plugin arm skips graders that only check a skill
        # loaded, so it has the graders its runs list.
        names = {g["name"] for run in runs for g in run["graders"]}
        if arm == "with":
            names |= {g["name"] for g in case["graders"]}
        for name in sorted(names):
            passed = sum(
                g["passed"]
                for run in runs
                for g in run["graders"]
                if g["name"] == name
            )
            out[(case["name"], name)] = (passed, len(runs))
    return out


def show(count: Optional[Count]) -> str:
    return "" if count is None else f"{count[0]}/{count[1]}"


def words(count: Count) -> str:
    return f"{count[0]} of {count[1]} runs"


def plural(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def table(header: list[str], rows: list[list[str]]) -> str:
    # The columns are padded so that the table can be read as plain
    # text, which is how a pull request's diff shows it.
    widths = [
        max(len(row[i])
            for row in [header] + rows)
        for i in range(len(header))
    ]

    def line(cells: list[str]) -> str:
        padded = [cell.ljust(width) for cell, width in zip(cells, widths)]
        return "| " + " | ".join(padded) + " |"

    rule = ["-" * width for width in widths]
    return "\n".join([line(header), line(rule)] + [line(row) for row in rows])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--change", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--branch-commit", required=True)
    parser.add_argument("--main")
    parser.add_argument("--main-commit")
    args = parser.parse_args()

    with open(args.branch) as f:
        branch = json.load(f)
    on_main = None
    if args.main:
        with open(args.main) as f:
            on_main = json.load(f)

    with_plugin = counts(branch, "with")
    without_plugin = counts(branch, "without")
    main_counts = counts(on_main, "with") if on_main else {}

    worse = []
    better = []
    failed = []
    skill_not_loaded = []
    rows = []
    for (case, grader), count in with_plugin.items():
        name = f"`{case}` / `{grader}`"
        if (case, grader) not in without_plugin:
            # A grader that only records whether a skill loaded. It is
            # not scored, so it is reported in a sentence, not a row.
            if count[0] < count[1]:
                skill_not_loaded.append(f"- `{case}`: {words(count)}")
            continue

        if count[0] < count[1]:
            failed.append(f"- {name}: passed {words(count)}")

        main_count = main_counts.get((case, grader))
        delta = 0 if main_count is None else count[0] - main_count[0]
        if delta != 0:
            assert main_count is not None
            change = (
                f"- {name}: passed {words(main_count)} on `main`, "
                f"{words(count)} on this branch"
            )
            if delta == -1:
                change += ". A drop of one run can be chance."
            (worse if delta < 0 else better).append(change)

        cells = [case, grader, show(without_plugin[(case, grader)])]
        if on_main:
            cells.append(show(main_count))
        cells.append(show(count))
        rows.append((min(delta, 0), cells))
    # The graders that got worse come first, the largest drop at the
    # top. The sort is stable, so the other rows keep their order.
    rows.sort(key=lambda row: row[0])

    print("# Plugin eval results")
    print()
    if on_main is None:
        print(
            "This branch does not change the plugin, so there is no "
            "comparison with `main`. The table shows how the cases did "
            "with the plugin and without it."
        )
    else:
        if worse:
            print(
                f"**{plural(len(worse), 'grader')} got worse** on this "
                "branch than on `main`:"
            )
            print()
            print("\n".join(worse))
        else:
            print("No grader got worse on this branch than on `main`.")
        print()
        if better:
            print(f"{plural(len(better), 'grader')} got better:")
            print()
            print("\n".join(better))
        else:
            print("No grader got better.")
    print()
    if failed:
        print(
            f"With this branch's plugin, {plural(len(failed), 'grader')} "
            "failed at least one run:"
        )
        print()
        print("\n".join(failed))
    else:
        print("With this branch's plugin, every grader passed every run.")
    if skill_not_loaded:
        print()
        print("No Reboot skill loaded in some runs of these cases:")
        print()
        print("\n".join(skill_not_loaded))
    print()

    print("Each cell is the runs a grader passed, out of the runs made.")
    print()
    header = ["Case", "Grader", "Without the plugin"]
    if on_main:
        header += ["`main`", "This branch"]
    else:
        header += ["With the plugin"]
    print(table(header, [cells for _, cells in rows]))
    print()

    cost = branch["costUsd"] + (on_main["costUsd"] if on_main else 0)
    run = f"`compare.sh` ran this at commit `{args.branch_commit}`"
    if on_main:
        run += f", against `main` at `{args.main_commit}`"
    print(
        f"{run}, with Claude Code {branch['claudeVersion']} and "
        f"{branch['suite']['judgeModel']} as the judge. It cost ${cost:.2f} "
        "at API prices."
    )
    print()
    print(
        "The `Check Plugin Evals Result` job looks for this ID, which "
        f"identifies the branch's change: `{args.change}`"
    )


if __name__ == "__main__":
    main()
