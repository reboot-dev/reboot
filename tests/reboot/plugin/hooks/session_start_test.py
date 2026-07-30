"""Tests for the plugin's `session-start.sh` hook.

The hook script is invoked as a subprocess the way Claude Code and
Codex invoke it: with the hook-input JSON on stdin and the host's
environment variables set (or, for Codex, not set). The env file it
appends to is a real temporary file.
"""

import json
import os
import subprocess
import tempfile
import unittest

# Path to the script under test, injected by Bazel via the `env` attr
# in `BUILD.bazel` as a runfiles-relative path. Absolutized so tests
# can run the hook from any working directory.
HOOK_SCRIPT = os.path.abspath(os.environ["SESSION_START_SH"])

# A representative `SessionStart` hook input; both CLIs pass one on
# stdin, though this handler reads no fields from it.
HOOK_INPUT = {
    "hook_event_name": "SessionStart",
    "source": "startup",
}


def run_hook(environment: dict[str, str]) -> str:
    """Invoke the hook with `environment` as its entire environment
    beyond `PATH`. Returns stdout. Raises when the hook exits non-zero,
    which both CLIs surface to the developer as a hook error."""
    result = subprocess.run(
        ["bash", HOOK_SCRIPT],
        input=json.dumps(HOOK_INPUT),
        capture_output=True,
        text=True,
        timeout=30,
        env={
            "PATH": os.environ.get("PATH", ""),
            **environment,
        },
    )
    if result.returncode != 0:
        raise AssertionError(
            f"hook exited {result.returncode}: {result.stderr}"
        )
    return result.stdout


class SessionStartTest(unittest.TestCase):

    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.plugin_root = os.path.join(directory.name, "plugin")
        os.makedirs(os.path.join(self.plugin_root, "bin"))
        self.env_file = os.path.join(directory.name, "env")

    def read_env_file(self) -> str:
        if not os.path.exists(self.env_file):
            return ""
        with open(self.env_file) as f:
            return f.read()

    def test_prepends_plugin_bin_to_path(self) -> None:
        """The line the hook appends must prepend the plugin's `bin/`
        to whatever PATH is in effect when the agent's shell sources
        the env file — so `${PATH}` stays literal while the plugin root
        is baked in."""
        self.assertEqual(
            run_hook(
                {
                    "CLAUDE_ENV_FILE": self.env_file,
                    "CLAUDE_PLUGIN_ROOT": self.plugin_root,
                }
            ),
            "",
        )
        self.assertEqual(
            self.read_env_file(),
            f'export PATH="{self.plugin_root}/bin:$PATH"\n',
        )

    def test_appended_line_prepends_at_source_time(self) -> None:
        """Sourcing the appended line in a shell with an arbitrary PATH
        puts the plugin's `bin/` first and keeps the rest intact."""
        run_hook(
            {
                "CLAUDE_ENV_FILE": self.env_file,
                "CLAUDE_PLUGIN_ROOT": self.plugin_root,
            }
        )
        result = subprocess.run(
            ["bash", "-c", f'. "{self.env_file}"; printf "%s" "$PATH"'],
            capture_output=True,
            text=True,
            timeout=30,
            env={"PATH": "/usr/bin:/bin"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout,
            f"{self.plugin_root}/bin:/usr/bin:/bin",
        )

    def test_appends_rather_than_truncates(self) -> None:
        """Other SessionStart hooks write to the same env file, so the
        handler must leave what is already there alone."""
        with open(self.env_file, "w") as f:
            f.write("export EXISTING=1\n")
        run_hook(
            {
                "CLAUDE_ENV_FILE": self.env_file,
                "CLAUDE_PLUGIN_ROOT": self.plugin_root,
            }
        )
        self.assertEqual(
            self.read_env_file(),
            "export EXISTING=1\n"
            f'export PATH="{self.plugin_root}/bin:$PATH"\n',
        )

    def test_no_op_without_host_variables(self) -> None:
        """Codex runs the same `hooks.json` without setting either
        variable, and wires the PATH prepend through
        `~/.codex/config.toml` instead. The handler must succeed
        silently rather than fail the session with a hook error."""
        cases: list[dict[str, str]] = [
            # Codex: neither variable set.
            {},
            # An env file but no plugin root: a prepend would put a
            # bogus `/bin` at the front of PATH.
            {
                "CLAUDE_ENV_FILE": self.env_file
            },
            # A plugin root but no env file: nowhere to write.
            {
                "CLAUDE_PLUGIN_ROOT": self.plugin_root
            },
            # Set but empty is as good as unset.
            {
                "CLAUDE_ENV_FILE": "",
                "CLAUDE_PLUGIN_ROOT": ""
            },
        ]
        for environment in cases:
            with self.subTest(environment=environment):
                self.assertEqual(run_hook(environment), "")
                self.assertEqual(self.read_env_file(), "")


if __name__ == "__main__":
    unittest.main()
