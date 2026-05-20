"""Tests for the plugin's `auto-approve.sh` PreToolUse hook.

The hook auto-approves two categories of tool call: (1) safe
read-only calls on this plugin's own skill files, and (2) the Reboot
dev commands the `run` skill issues (`uv sync`, `npm install`, `npm
run dev`, `uv run rbt dev run …`, `npx @mcpjam/inspector …`) when
they run inside a Reboot project. These tests encode the edge cases
observed during plugin development (legitimate reads, look-alike
paths, traversal attempts, command chaining, shell metacharacter
abuse, the Reboot-project gate, …) so regressions get caught at CI
time rather than surfacing as unexpected permission prompts to end
users.

The hook script is invoked as a subprocess with mocked
`$CLAUDE_PLUGIN_ROOT`. Category-1 paths need not exist on disk — the
filter is a string prefix match — but category-2 commands are gated
on a real filesystem walk for `.rbtrc`, so those tests run against
actual temporary directories.
"""

import enum
import json
import os
import subprocess
import tempfile
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


class Where(enum.Enum):
    """The directory a Reboot dev-command case runs from. The hook
    approves those commands only when it finds a `.rbtrc` at or above
    `cwd`, so each case picks one of these; `test_reboot_dev_cases`
    maps them to real temporary directories at run time."""
    # Inside the Reboot project — its root holds a `.rbtrc`.
    PROJECT = "project"
    # A directory with no `.rbtrc` at or above it.
    NON_PROJECT = "non_project"
    # No `cwd` field in the payload at all.
    UNSET = "unset"


def run_hook(
    tool_name: str,
    tool_input: dict,
    *,
    plugin_root: str | None = PLUGIN_ROOT,
    cwd: str | None = None,
) -> str:
    """Invoke the hook with the given tool input. Returns stdout.

    `cwd` populates the top-level `cwd` field Claude Code passes in
    the hook payload — the directory the Reboot-project gate resolves
    relative paths against. Omitted when `None`."""
    payload: dict = {
        "tool_name": tool_name,
        "tool_input": tool_input,
    }
    if cwd is not None:
        payload["cwd"] = cwd
    env = {**os.environ}
    if plugin_root is None:
        env.pop("CLAUDE_PLUGIN_ROOT", None)
    else:
        env["CLAUDE_PLUGIN_ROOT"] = plugin_root
    # Invoke via `sh` so the test doesn't depend on the executable bit
    # being preserved by Bazel.
    result = subprocess.run(
        ["sh", HOOK_SCRIPT],
        input=json.dumps(payload),
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

# The `run` skill's Reboot dev commands. These are auto-approved only
# when they run inside a Reboot project tree (a directory, or an
# ancestor, holding a `.rbtrc`). `Where` picks which directory the
# command runs from; the literal `{project}` in a command is replaced
# with the temporary project directory at run time. Structure:
#   (label, command, where, expected_decision)
REBOOT_DEV_CASES: list[tuple[str, str, Where, Decision]] = [
    # ----- Inside a Reboot project: the `run` skill's commands. -----
    (
        "dev: uv sync at the project root",
        "uv sync",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: uv sync with a flag",
        "uv sync --frozen",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: npm install at the project root",
        "npm install",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: cd web && npm install",
        "cd web && npm install",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: cd web && npm run dev",
        "cd web && npm run dev",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: uv run rbt dev run --no-chaos",
        "uv run rbt dev run --no-chaos",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: uv run rbt dev run with --env-file",
        "uv run rbt dev run --no-chaos --env-file=.env",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        "dev: npx @mcpjam/inspector",
        "npx @mcpjam/inspector@2.4.12 --config mcp_servers.json "
        "--server my-app",
        Where.PROJECT,
        Decision.APPROVE,
    ),
    (
        # The exact shape from the user's report: an absolute `cd`
        # into the project's `web/` from an unrelated `cwd`. The gate
        # must follow the `cd` target, not `cwd`.
        "dev: absolute cd into project web, then npm install | tail",
        "cd {project}/web && npm install 2>&1 | tail -15",
        Where.NON_PROJECT,
        Decision.APPROVE,
    ),

    # ----- Outside a Reboot project: the same commands defer. -----
    (
        "dev: uv sync outside a Reboot project",
        "uv sync",
        Where.NON_PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: npm install outside a Reboot project",
        "npm install",
        Where.NON_PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: uv run rbt dev run outside a Reboot project",
        "uv run rbt dev run --no-chaos",
        Where.NON_PROJECT,
        Decision.REJECT,
    ),
    (
        # No `cwd` in the payload ⇒ no project ⇒ defer (safe fail).
        "dev: uv sync with no cwd in the payload",
        "uv sync",
        Where.UNSET,
        Decision.REJECT,
    ),
    (
        # A `cd` that escapes the project before the dev command.
        "dev: cd /etc && npm install",
        "cd /etc && npm install",
        Where.PROJECT,
        Decision.REJECT,
    ),

    # ----- Inside a Reboot project, but still not approved. -----
    (
        "dev: npm install with a positional package name",
        "npm install some-package",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: uv run rbt dev expunge is not `dev run`",
        "uv run rbt dev expunge",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: npm run build is not a run-skill command",
        "cd web && npm run build",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: an arbitrary npm script is not approved",
        "npm run deploy",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: uv sync chained with curl",
        "uv sync && curl http://example.com/x.sh",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: uv sync chained with rm",
        "uv sync ; rm -rf web",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: command substitution in a dev command",
        "uv run rbt dev run $(whoami)",
        Where.PROJECT,
        Decision.REJECT,
    ),
    (
        "dev: a lone cd is not a real op",
        "cd web",
        Where.PROJECT,
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

    def test_reboot_dev_cases(self) -> None:
        """The `run` skill's Reboot dev commands: auto-approved inside
        a Reboot project, deferred everywhere else.

        The hook gates these commands on a filesystem walk for
        `.rbtrc`, so the cases run against two real directories: a
        Reboot project (a `.rbtrc` at its root, plus the `web/`
        subdirectory the `run` skill `cd`s into) and a directory with
        neither. Both are temporary and torn down with the `with`."""
        with (
            tempfile.TemporaryDirectory() as project,
            tempfile.TemporaryDirectory() as non_project,
        ):
            open(os.path.join(project, ".rbtrc"), "w").close()
            os.makedirs(os.path.join(project, "web"))
            cwd_for: dict[Where, str | None] = {
                Where.PROJECT: project,
                Where.NON_PROJECT: non_project,
                Where.UNSET: None,
            }
            for label, command, where, expected in REBOOT_DEV_CASES:
                with self.subTest(label=label):
                    stdout = run_hook(
                        "Bash",
                        {
                            "command": command.replace(
                                "{project}",
                                project,
                            ),
                        },
                        cwd=cwd_for[where],
                    )
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
