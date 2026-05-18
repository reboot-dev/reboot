"""Tests for the plugin's `auto-approve.sh` PreToolUse hook.

The hook auto-approves safe read-only tool calls on this plugin's own
skill files. These tests encode the edge cases observed during plugin
development (legitimate reads, look-alike paths, traversal attempts,
command chaining, shell metacharacter abuse, …) so regressions get
caught at CI time rather than surfacing as unexpected permission
prompts to end users.

The hook script is invoked as a subprocess with mocked
`$CLAUDE_PLUGIN_ROOT`; the path doesn't need to exist on disk because
the script's filter is a string prefix match.
"""

import enum
import json
import os
import subprocess
import unittest


class Decision(enum.Enum):
    """The two outcomes the hook can produce for a tool call: emit the
    `allow` JSON, or stay silent so Claude Code falls back to its normal
    permission prompt."""
    APPROVE = "approve"
    REJECT = "reject"


# Path to the script under test, injected by Bazel via the `env` attr
# in `BUILD.bazel`.
HOOK_SCRIPT = os.environ["AUTO_APPROVE_SH"]

# Stand-in for the plugin's install path. The script does string-prefix
# matching, not filesystem checks, so this doesn't need to physically
# exist.
PLUGIN_ROOT = "/test/plugin/root"


def run_hook(
    tool_name: str,
    tool_input: dict,
    *,
    plugin_root: str | None = PLUGIN_ROOT,
) -> str:
    """Invoke the hook with the given tool input. Returns stdout."""
    payload = json.dumps({
        "tool_name": tool_name,
        "tool_input": tool_input,
    })
    env = {**os.environ}
    if plugin_root is None:
        env.pop("CLAUDE_PLUGIN_ROOT", None)
    else:
        env["CLAUDE_PLUGIN_ROOT"] = plugin_root
    # Invoke via `sh` so the test doesn't depend on the executable bit
    # being preserved by Bazel.
    result = subprocess.run(
        ["sh", HOOK_SCRIPT],
        input=payload,
        capture_output=True,
        text=True,
        env=env,
    )
    return result.stdout


def decision_from_stdout(stdout: str) -> Decision:
    """The script approves by emitting an `allow` JSON object on stdout.
    Anything else (empty, malformed, `ask`/`deny`) means "fall through to
    the normal prompt."""
    if not stdout.strip():
        return Decision.REJECT
    try:
        decoded = json.loads(stdout)
    except json.JSONDecodeError:
        return Decision.REJECT
    if (
        decoded.get("hookSpecificOutput",
                    {}).get("permissionDecision") == "allow"
    ):
        return Decision.APPROVE
    return Decision.REJECT


# Edge cases observed during development, plus adversarial cases the
# hook must reject. Adding a new case is one line — the structure is:
#   (label, tool_name, tool_input, expected_decision)
CASES: list[tuple[str, str, dict, Decision]] = [
    # ----- Read tool: legitimate reads of plugin references. -----
    (
        "Read: SKILL.md inside plugin",
        "Read",
        {
            "file_path": f"{PLUGIN_ROOT}/skills/python/SKILL.md"
        },
        Decision.APPROVE,
    ),
    (
        "Read: reference file inside plugin",
        "Read",
        {
            "file_path":
                f"{PLUGIN_ROOT}/skills/python/references/patterns-common-gotchas.md"
        },
        Decision.APPROVE,
    ),

    # ----- Read tool: paths the hook must NOT approve. -----
    (
        "Read: /etc/passwd",
        "Read",
        {
            "file_path": "/etc/passwd"
        },
        Decision.REJECT,
    ),
    (
        "Read: look-alike path elsewhere",
        "Read",
        {
            "file_path": "/tmp/evil/plugin/skills/python/whatever.md"
        },
        Decision.REJECT,
    ),
    (
        "Read: path traversal out of plugin",
        "Read",
        {
            "file_path":
                f"{PLUGIN_ROOT}/skills/python/references/../../../../etc/passwd"
        },
        Decision.REJECT,
    ),

    # ----- LS / Glob / Grep on plugin paths. -----
    (
        "LS: directory inside plugin",
        "LS",
        {
            "path": f"{PLUGIN_ROOT}/skills/python/references"
        },
        Decision.APPROVE,
    ),
    (
        "LS: outside plugin",
        "LS",
        {
            "path": "/etc"
        },
        Decision.REJECT,
    ),
    (
        "Glob: pattern with path inside plugin",
        "Glob",
        {
            "pattern": "*.md",
            "path": f"{PLUGIN_ROOT}/skills/python/references",
        },
        Decision.APPROVE,
    ),
    (
        "Glob: pattern without path",
        "Glob",
        {
            "pattern": "*.md"
        },
        Decision.REJECT,
    ),
    (
        "Grep: search inside plugin",
        "Grep",
        {
            "pattern": "foo",
            "path": f"{PLUGIN_ROOT}/skills/chat-app/references",
        },
        Decision.APPROVE,
    ),

    # ----- Bash: simple read-only ops inside plugin. -----
    (
        "Bash: ls plugin references",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/references/"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ls -la with flags",
        "Bash",
        {
            "command": f"ls -la {PLUGIN_ROOT}/skills/chat-app/references/"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: cat a reference file",
        "Bash",
        {
            "command":
                f"cat {PLUGIN_ROOT}/skills/python/references/workflow-method.md"
        },
        Decision.APPROVE,
    ),

    # ----- Bash: command chaining (the case from the user's session). -----
    (
        "Bash: ls || ls with 2>&1 (real reported case)",
        "Bash",
        {
            "command":
                f"ls {PLUGIN_ROOT}/skills/python/ 2>&1 || "
                f"ls {PLUGIN_ROOT}/skills/ 2>&1"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: && between two safe ops",
        "Bash",
        {
            "command":
                f"ls {PLUGIN_ROOT}/skills/python/ && "
                f"ls {PLUGIN_ROOT}/skills/chat-app/"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ; between two safe ops",
        "Bash",
        {
            "command":
                f"ls {PLUGIN_ROOT}/skills/python/ ; "
                f"ls {PLUGIN_ROOT}/skills/chat-app/"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: cat then ls (mixed safe binaries)",
        "Bash",
        {
            "command":
                f"cat {PLUGIN_ROOT}/skills/python/SKILL.md && "
                f"ls {PLUGIN_ROOT}/skills/"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: trailing 2>&1",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ 2>&1"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: trailing >/dev/null",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ >/dev/null"
        },
        Decision.APPROVE,
    ),

    # ----- Bash: pipes to stdin-only filter commands. -----
    (
        "Bash: ls | head -50 (real reported case)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/references/ | head -50"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ls | head (no args)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ | head"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ls | head -n 50",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ | head -n 50"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ls | tail -20",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ | tail -20"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: ls | wc -l",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ | wc -l"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: cat | sort",
        "Bash",
        {
            "command": f"cat {PLUGIN_ROOT}/skills/python/SKILL.md | sort"
        },
        Decision.APPROVE,
    ),
    (
        "Bash: find | head",
        "Bash",
        {
            "command": f"find {PLUGIN_ROOT}/skills/ | head -100"
        },
        Decision.APPROVE,
    ),

    # ----- Bash: pipes where RHS is dangerous. -----
    (
        "Bash: ls | sh (pipe to shell)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ | sh"
        },
        Decision.REJECT,
    ),
    (
        "Bash: ls | xargs cat (xargs not a pure filter)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ | xargs cat"
        },
        Decision.REJECT,
    ),
    (
        "Bash: ls | head /etc/passwd (filter with absolute path)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ | head /etc/passwd"
        },
        Decision.REJECT,
    ),
    (
        "Bash: ls | head bar.txt (filter with relative path arg)",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ | head bar.txt"
        },
        Decision.REJECT,
    ),

    # ----- Bash: chaining where one part is unsafe. -----
    (
        "Bash: safe ls || ls outside plugin",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ || ls /etc"
        },
        Decision.REJECT,
    ),
    (
        "Bash: safe ls && rm",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ && rm {PLUGIN_ROOT}/skills/x"
        },
        Decision.REJECT,
    ),
    (
        "Bash: safe ls ; cat /etc/passwd",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/ ; cat /etc/passwd"
        },
        Decision.REJECT,
    ),

    # ----- Bash: dangerous shell metacharacters. -----
    (
        "Bash: pipe to grep",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ | grep x"
        },
        Decision.REJECT,
    ),
    (
        "Bash: background &",
        "Bash",
        {
            "command":
                f"ls {PLUGIN_ROOT}/skills/python/ & "
                f"ls {PLUGIN_ROOT}/skills/"
        },
        Decision.REJECT,
    ),
    (
        "Bash: redirect to file",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python/ > /tmp/x"
        },
        Decision.REJECT,
    ),
    (
        "Bash: command substitution $(...)",
        "Bash",
        {
            "command": f"ls $(echo {PLUGIN_ROOT}/skills/python/)"
        },
        Decision.REJECT,
    ),
    (
        "Bash: command substitution backticks",
        "Bash",
        {
            "command": f"ls `echo {PLUGIN_ROOT}/skills/python/`"
        },
        Decision.REJECT,
    ),
    (
        "Bash: subshell parentheses",
        "Bash",
        {
            "command": f"(ls {PLUGIN_ROOT}/skills/python/)"
        },
        Decision.REJECT,
    ),
    (
        "Bash: backslash escape attempt",
        "Bash",
        {
            "command": f"ls {PLUGIN_ROOT}/skills/python\\;rm /tmp/x"
        },
        Decision.REJECT,
    ),

    # ----- Bash: paths the hook must NOT approve. -----
    (
        "Bash: ls /etc",
        "Bash",
        {
            "command": "ls /etc"
        },
        Decision.REJECT,
    ),
    (
        "Bash: rm on plugin path (not in safe binary list)",
        "Bash",
        {
            "command": f"rm -rf {PLUGIN_ROOT}/skills/python/references/"
        },
        Decision.REJECT,
    ),
    (
        "Bash: look-alike `plugin/skills/` elsewhere",
        "Bash",
        {
            "command": "ls /tmp/fake/plugin/skills/python/"
        },
        Decision.REJECT,
    ),
    (
        "Bash: path traversal",
        "Bash",
        {
            "command":
                f"cat {PLUGIN_ROOT}/skills/python/../../../../etc/passwd"
        },
        Decision.REJECT,
    ),
    (
        "Bash: lsof impersonating ls",
        "Bash",
        {
            "command": f"lsof {PLUGIN_ROOT}/skills/python/"
        },
        Decision.REJECT,
    ),

    # ----- Bash: edge cases. -----
    (
        "Bash: empty command",
        "Bash",
        {
            "command": ""
        },
        Decision.REJECT,
    ),
    (
        "Bash: just `ls` (no path)",
        "Bash",
        {
            "command": "ls"
        },
        Decision.REJECT,
    ),
    (
        "Bash: whitespace only",
        "Bash",
        {
            "command": "   "
        },
        Decision.REJECT,
    ),
    (
        "Bash: only chainers",
        "Bash",
        {
            "command": "&& ||"
        },
        Decision.REJECT,
    ),

    # ----- Unknown tools must always fall through. -----
    (
        "Write tool: never approved even on plugin path",
        "Write",
        {
            "file_path": f"{PLUGIN_ROOT}/skills/python/references/zzz.md",
            "content": "x",
        },
        Decision.REJECT,
    ),
    (
        "Edit tool: never approved even on plugin path",
        "Edit",
        {
            "file_path": f"{PLUGIN_ROOT}/skills/python/SKILL.md",
            "old_string": "x",
            "new_string": "y",
        },
        Decision.REJECT,
    ),
]


class AutoApproveTest(unittest.TestCase):

    def test_cases(self) -> None:
        for label, tool_name, tool_input, expected in CASES:
            with self.subTest(label=label):
                stdout = run_hook(tool_name, tool_input)
                actual = decision_from_stdout(stdout)
                self.assertEqual(
                    actual,
                    expected,
                    f"{label}: expected {expected.value}, got "
                    f"{actual.value}; stdout={stdout!r}",
                )

    def test_unset_plugin_root_never_approves(self) -> None:
        """Defense in depth: if `$CLAUDE_PLUGIN_ROOT` is unset for any
        reason, no tool call gets auto-approved even when the input
        otherwise matches."""
        cases = [
            ("Read", {
                "file_path": f"{PLUGIN_ROOT}/skills/python/SKILL.md"
            }),
            ("LS", {
                "path": f"{PLUGIN_ROOT}/skills/python/references"
            }),
            (
                "Bash",
                {
                    "command": f"ls {PLUGIN_ROOT}/skills/python/references/"
                },
            ),
        ]
        for tool_name, tool_input in cases:
            with self.subTest(tool=tool_name):
                stdout = run_hook(tool_name, tool_input, plugin_root=None)
                self.assertEqual(
                    decision_from_stdout(stdout),
                    Decision.REJECT,
                    f"unset CLAUDE_PLUGIN_ROOT must never approve, but "
                    f"{tool_name} got stdout={stdout!r}",
                )


if __name__ == "__main__":
    unittest.main()
