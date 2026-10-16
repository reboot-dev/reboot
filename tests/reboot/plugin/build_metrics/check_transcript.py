"""Show how a build went, and compare it with a baseline build.

    bazel run //tests/reboot/plugin/build_metrics:check_transcript -- \\
        <build> [--baseline <build>]

A build is a Claude Code transcript (`.jsonl`), or the folder of one
project's transcripts under `~/.claude/projects/`, meaning its newest
session. With `--baseline`, exits 1 when the build is worse on a number
a change to the skills must not make worse (`build_metrics.GATED`).
"""

import argparse
import sys
from pathlib import Path
from tests.reboot.plugin.build_metrics import build_metrics


def transcript(arg: str) -> Path:
    path = Path(arg).expanduser()
    if path.is_dir():
        sessions = sorted(
            path.glob("*.jsonl"), key=lambda p: p.stat().st_mtime
        )
        if not sessions:
            raise SystemExit(f"{path} holds no transcript (*.jsonl)")
        return sessions[-1]
    if not path.is_file():
        raise SystemExit(f"no transcript at {path}")
    return path


def shown(key: str, value: int) -> str:
    if not key.endswith("_s"):
        return f"{value:,}"
    return "never" if value < 0 else f"{value // 60}m {value % 60:02d}s"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("build", help="a transcript, or a project's folder")
    parser.add_argument("--baseline", help="a build to compare with")
    args = parser.parse_args()
    build = build_metrics.read(transcript(args.build))
    base = None
    if args.baseline:
        base = build_metrics.read(transcript(args.baseline))
    print(f"plugin: {build.plugin or 'unknown'}")
    rows = build_metrics.COMPARED + (
        ("passed", "Scenarios passed, last run"),
        ("sub_agent_words", "Words read by sub-agents"),
    )
    for key, label in rows:
        line = f"{label:<44}{shown(key, getattr(build, key)):>10}"
        if base is not None:
            line += f"   baseline {shown(key, getattr(base, key)):>10}"
            if key != "passed" and build_metrics.worse(
                key, getattr(build, key), getattr(base, key)
            ):
                gated = " (gated)" if key in build_metrics.GATED else ""
                line += f"   worse{gated}"
        print(line)
    for error in build.error_lines:
        print(f"  error: {error}")
    if base is None:
        return 0
    worse = set(build_metrics.worse_on(build, base))
    return 1 if worse & set(build_metrics.GATED) else 0


if __name__ == "__main__":
    sys.exit(main())
