"""Tests for the plugin's `type-check.sh` Stop hook.

The hook script is invoked as a subprocess with the hook-input JSON
on stdin, the way Claude Code and Codex invoke it, against a real
temporary project directory laid out the way the skills scaffold a
Reboot Python project. A fake `uv`, first on `PATH`, replaces the
real one: it records its working directory and arguments and exits
with the mypy status, stdout, and stderr the test configured.
"""

import json
import os
import stat
import subprocess
import tempfile
import unittest
from typing import Optional

# Path to the script under test, injected by Bazel via the `env` attr
# in `BUILD.bazel` as a runfiles-relative path. Absolutized so tests
# can run the hook from any working directory.
HOOK_SCRIPT = os.path.abspath(os.environ["TYPE_CHECK_SH"])

# The stamp file a run with no errors writes, relative to the project
# root; must match `stamp` in `type-check.sh`.
STAMP = os.path.join(".mypy_cache", "reboot-plugin-type-check")

# How many of the last lines of mypy output a block reason contains;
# must match `tail_lines` in `type-check.sh`.
TAIL_LINES = 60

# A fixed time in the past for the mtimes the tests set. The comparison
# against the stamp file then depends only on these values, and a stamp
# file the hook writes now is newer than all of them.
EPOCH = 1_700_000_000

# The fake `uv`. Appends `<cwd> <args>` to a log and exits with the
# mypy stdout, stderr, and status the test set in the environment.
FAKE_UV = """#!/bin/sh
printf '%s %s\\n' "$PWD" "$*" >> "$FAKE_UV_LOG"
if [ -n "${FAKE_MYPY_OUTPUT:-}" ]; then
    printf '%s\\n' "$FAKE_MYPY_OUTPUT"
fi
if [ -n "${FAKE_MYPY_STDERR:-}" ]; then
    printf '%s\\n' "$FAKE_MYPY_STDERR" >&2
fi
exit "${FAKE_MYPY_EXIT:-0}"
"""

# A fake `uv` standing where the plugin's shim would be: appends a
# `plugin <args>` line to the same log and reports no errors.
PLUGIN_UV = """#!/bin/sh
printf 'plugin %s\\n' "$*" >> "$FAKE_UV_LOG"
exit 0
"""

# A `python3` that always exits 1, so the hook uses its sed and awk
# parsers.
BROKEN_PYTHON3 = """#!/bin/sh
exit 1
"""


def install(directory: str, name: str, script: str) -> None:
    """Write `script` as an executable named `name` in `directory`."""
    path = os.path.join(directory, name)
    with open(path, "w") as f:
        f.write(script)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)


class TypeCheckTest(unittest.TestCase):

    def setUp(self) -> None:
        # A Reboot Python project: `.rbtrc` naming the generated-code
        # directory, `.mypy.ini`, `pyproject.toml`, the pydantic API
        # definition, generated code, a servicer, and a test module.
        project_dir = tempfile.TemporaryDirectory()
        self.addCleanup(project_dir.cleanup)
        self.project_dir = os.path.realpath(project_dir.name)
        self.write(".rbtrc", "generate api/\ngenerate --python=backend/api\n")
        self.write(".mypy.ini", "[mypy]\n")
        self.write("pyproject.toml", '[project]\nname = "app"\n')
        self.write("api/app/v1/app.py", "")
        self.write("backend/api/app/v1/app_rbt.py", "")
        self.write("backend/src/main.py", "")
        self.write("tests/app_test.py", "")

        # The fake `uv` (and, when a test asks for it, a broken
        # `python3`), first on `PATH`.
        bin_dir = tempfile.TemporaryDirectory()
        self.addCleanup(bin_dir.cleanup)
        self.bin_dir = bin_dir.name
        install(self.bin_dir, "uv", FAKE_UV)
        self.uv_log = os.path.join(self.bin_dir, "uv.log")

    def write(self, relative: str, content: str) -> str:
        """Write `content` at `relative` under the project, creating
        directories as needed. Returns the absolute path."""
        path = os.path.join(self.project_dir, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        return path

    def set_mtime(self, relative: str, seconds: int) -> None:
        os.utime(os.path.join(self.project_dir, relative), (seconds, seconds))

    def pin_mtimes(self) -> None:
        """Set every `.py` file's mtime before the stamp file's, so no
        file counts as changed until a test sets one file's mtime
        after the stamp's."""
        for relative in [
            "api/app/v1/app.py",
            "backend/api/app/v1/app_rbt.py",
            "backend/src/main.py",
            "tests/app_test.py",
        ]:
            self.set_mtime(relative, EPOCH - 10)
        self.set_mtime(STAMP, EPOCH)

    def stamp(self) -> str:
        return os.path.join(self.project_dir, STAMP)

    def stop(self, **overrides: object) -> dict:
        """A `Stop` payload for the project; `overrides` replace
        fields."""
        payload: dict = {
            "hook_event_name": "Stop",
            "cwd": self.project_dir,
            "transcript_path": None,
            "stop_hook_active": False,
        }
        payload.update(overrides)
        return payload

    def run_hook(
        self,
        payload: dict,
        mypy_exit: int = 0,
        mypy_output: str = "",
        mypy_stderr: str = "",
        extra_env: Optional[dict[str, str]] = None,
    ) -> str:
        """Invoke the hook with the given hook-input payload, with the
        fake `uv` exiting with the given mypy status, stdout, and
        stderr, and with `extra_env` in the hook's environment.
        Returns stdout. Raises when
        the hook exits non-zero (both CLIs show that as a hook error,
        and every path of this hook exits 0) or when it takes longer
        than the timeout (a hung hook would block the CLI's whole
        turn)."""
        env = dict(os.environ)
        # The hook puts `$CLAUDE_PLUGIN_ROOT/bin` first on PATH; only
        # the test that checks that sets the variable.
        env.pop("CLAUDE_PLUGIN_ROOT", None)
        env["PATH"] = self.bin_dir + os.pathsep + env.get("PATH", "")
        env["FAKE_UV_LOG"] = self.uv_log
        env["FAKE_MYPY_EXIT"] = str(mypy_exit)
        env["FAKE_MYPY_OUTPUT"] = mypy_output
        env["FAKE_MYPY_STDERR"] = mypy_stderr
        env.update(extra_env or {})
        # Invoke via `sh`, so the script runs even when Bazel dropped
        # its executable bit.
        result = subprocess.run(
            ["sh", HOOK_SCRIPT],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )
        if result.returncode != 0:
            raise AssertionError(
                f"hook exited {result.returncode}: {result.stderr}"
            )
        return result.stdout

    def uv_calls(self) -> list[str]:
        """Every `<cwd> <args>` line the fake `uv` logged."""
        if not os.path.exists(self.uv_log):
            return []
        with open(self.uv_log) as f:
            return f.read().splitlines()

    def decoded(self, stdout: str) -> Optional[dict]:
        """The JSON the hook printed, or `None` when it printed nothing.
        Raises when whatever the hook printed is malformed: hosts
        reject malformed hook output, so a parse error here is a bug
        in the hook."""
        if not stdout.strip():
            return None
        return json.loads(stdout)

    # When the check runs.

    def test_no_errors_prints_nothing_and_writes_the_stamp(self) -> None:
        stdout = self.run_hook(self.stop())
        self.assertEqual(stdout, "")
        self.assertEqual(
            self.uv_calls(),
            [f"{self.project_dir} run mypy backend/ tests/"],
        )
        self.assertTrue(os.path.exists(self.stamp()))

    def test_other_events_print_nothing(self) -> None:
        for event in ["PostToolUse", "SubagentStop", "SessionEnd"]:
            with self.subTest(event=event):
                stdout = self.run_hook(self.stop(hook_event_name=event))
                self.assertEqual(stdout, "")
        self.assertEqual(self.uv_calls(), [])

    def test_outside_reboot_project_prints_nothing(self) -> None:
        """The plugin is typically installed globally, so the hook
        runs in every session; one with no `.rbtrc` at or above its
        working directory has nothing to check."""
        elsewhere = tempfile.TemporaryDirectory()
        self.addCleanup(elsewhere.cleanup)
        stdout = self.run_hook(self.stop(cwd=elsewhere.name))
        self.assertEqual(stdout, "")
        self.assertEqual(self.uv_calls(), [])

    def test_no_mypy_config_prints_nothing(self) -> None:
        os.remove(os.path.join(self.project_dir, ".mypy.ini"))
        stdout = self.run_hook(self.stop())
        self.assertEqual(stdout, "")
        self.assertEqual(self.uv_calls(), [])

    def test_before_generate_prints_nothing(self) -> None:
        """The check runs only after `rbt generate` has written the
        Python bindings; before that, mypy would report only the
        missing `*_rbt` modules."""
        os.remove(
            os.path.join(self.project_dir, "backend/api/app/v1/app_rbt.py")
        )
        os.removedirs(os.path.join(self.project_dir, "backend/api/app/v1"))
        stdout = self.run_hook(self.stop())
        self.assertEqual(stdout, "")
        self.assertEqual(self.uv_calls(), [])

    def test_generated_directory_comes_from_rbtrc(self) -> None:
        """A project that points `generate --python=` elsewhere is
        gated on that directory."""
        self.write(".rbtrc", "generate api/\ngenerate --python gen/py\n")
        with self.subTest("custom directory missing"):
            stdout = self.run_hook(self.stop())
            self.assertEqual(stdout, "")
            self.assertEqual(self.uv_calls(), [])
        with self.subTest("custom directory present"):
            self.write("gen/py/app/v1/app_rbt.py", "")
            stdout = self.run_hook(self.stop())
            self.assertEqual(stdout, "")
            self.assertEqual(len(self.uv_calls()), 1)

    def test_unchanged_python_skips_mypy(self) -> None:
        """The hook runs mypy only when a `.py` file is newer than the
        stamp file of the last run with no errors, so a turn that
        changed no Python runs no mypy. Every watched directory
        counts, including `api/`, which mypy checks through the
        servicers' imports."""
        self.run_hook(self.stop())
        self.assertEqual(len(self.uv_calls()), 1)
        self.pin_mtimes()

        with self.subTest("nothing newer than the stamp"):
            stdout = self.run_hook(self.stop())
            self.assertEqual(stdout, "")
            self.assertEqual(len(self.uv_calls()), 1)

        for relative in [
            "backend/src/main.py",
            "tests/app_test.py",
            "api/app/v1/app.py",
        ]:
            with self.subTest(changed=relative):
                self.pin_mtimes()
                self.set_mtime(relative, EPOCH + 10)
                calls_before = len(self.uv_calls())
                self.run_hook(self.stop())
                self.assertEqual(len(self.uv_calls()), calls_before + 1)
                # The run with no errors wrote a stamp file newer than
                # the change.
                self.assertGreater(os.stat(self.stamp()).st_mtime, EPOCH + 10)

    def test_only_python_changes_count(self) -> None:
        self.run_hook(self.stop())
        self.pin_mtimes()
        self.write("tests/deposits.feature", "Feature: Deposits\n")
        self.set_mtime("tests/deposits.feature", EPOCH + 10)
        stdout = self.run_hook(self.stop())
        self.assertEqual(stdout, "")
        self.assertEqual(len(self.uv_calls()), 1)

    # How mypy is run.

    def test_runs_from_project_root_for_a_subdirectory_cwd(self) -> None:
        """The agent may stop with its working directory anywhere in
        the project; the check runs from the root, which has
        `.mypy.ini` and which the relative targets are resolved
        against."""
        cwd = os.path.join(self.project_dir, "backend", "src")
        self.run_hook(self.stop(cwd=cwd))
        self.assertEqual(
            self.uv_calls(),
            [f"{self.project_dir} run mypy backend/ tests/"],
        )

    def test_plugin_uv_comes_first_on_path(self) -> None:
        """The hook runs the plugin's pinned `uv`, the one the agent's
        shell commands run, when `CLAUDE_PLUGIN_ROOT` names the
        plugin."""
        plugin_root = tempfile.TemporaryDirectory()
        self.addCleanup(plugin_root.cleanup)
        os.makedirs(os.path.join(plugin_root.name, "bin"))
        install(os.path.join(plugin_root.name, "bin"), "uv", PLUGIN_UV)
        stdout = self.run_hook(
            self.stop(),
            extra_env={"CLAUDE_PLUGIN_ROOT": plugin_root.name},
        )
        self.assertEqual(stdout, "")
        self.assertEqual(self.uv_calls(), ["plugin run mypy backend/ tests/"])

    def test_targets_only_the_directories_that_exist(self) -> None:
        """A project with no `tests/` yet is checked as `backend/`
        alone."""
        os.remove(os.path.join(self.project_dir, "tests/app_test.py"))
        os.rmdir(os.path.join(self.project_dir, "tests"))
        self.run_hook(self.stop())
        self.assertEqual(
            self.uv_calls(),
            [f"{self.project_dir} run mypy backend/"],
        )

    # Decisions.

    def test_errors_block_the_stop_with_the_output(self) -> None:
        output = (
            "backend/src/main.py:3: error: Name \"Foo\" is not defined"
            "  [name-defined]\n"
            "Found 1 error in 1 file (checked 2 source files)"
        )
        stdout = self.run_hook(self.stop(), mypy_exit=1, mypy_output=output)
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected the hook to block the stop")
        self.assertEqual(decoded["decision"], "block")
        reason = decoded["reason"]
        self.assertTrue(reason.startswith("[reboot-plugin-type-check]"))
        self.assertIn("`uv run mypy backend/ tests/`", reason)
        self.assertIn("Name \"Foo\" is not defined", reason)
        self.assertIn("Found 1 error in 1 file", reason)
        self.assertIn("type: ignore", reason)
        self.assertNotIn("rbt generate", reason)
        self.assertNotIn("systemMessage", decoded)
        # Only a run with no errors writes the stamp file, so the next
        # stop runs mypy again.
        self.assertFalse(os.path.exists(self.stamp()))

    def test_missing_generated_module_adds_the_generate_hint(self) -> None:
        """An error about a missing `*_rbt` module is fixed by
        `rbt generate`, so the reason says so for that error."""
        output = (
            "backend/src/main.py:1: error: Cannot find implementation or "
            'library stub for module named "bank.v1.bank_rbt"  '
            "[import-not-found]\n"
            "Found 1 error in 1 file (checked 2 source files)"
        )
        stdout = self.run_hook(self.stop(), mypy_exit=1, mypy_output=output)
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected the hook to block the stop")
        self.assertIn(
            "`uv run rbt generate` has to run first", decoded["reason"]
        )

    def test_errors_after_one_block_let_the_turn_end(self) -> None:
        """The hook blocks one stop per turn. When it already blocked
        one (`stop_hook_active`) and mypy still reports errors, the
        turn ends, so the agent can ask for help, and a
        `systemMessage` tells the developer."""
        output = "Found 2 errors in 1 file (checked 2 source files)"
        stdout = self.run_hook(
            self.stop(stop_hook_active=True),
            mypy_exit=1,
            mypy_output=output,
        )
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected a systemMessage")
        self.assertNotIn("decision", decoded)
        self.assertIn("still reports errors", decoded["systemMessage"])
        self.assertIn("Found 2 errors", decoded["systemMessage"])
        self.assertFalse(os.path.exists(self.stamp()))

    def test_mypy_failure_to_run_lets_the_turn_end(self) -> None:
        """mypy exits 1 for type errors and with another status when
        it checked nothing; the latter is for the developer to fix,
        so the hook prints a `systemMessage` and lets the turn end."""
        stderr = "error: Failed to spawn: `mypy`\n  Caused by: No such file"
        stdout = self.run_hook(self.stop(), mypy_exit=2, mypy_stderr=stderr)
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected a systemMessage")
        self.assertNotIn("decision", decoded)
        self.assertIn("exited 2", decoded["systemMessage"])
        self.assertIn("Failed to spawn", decoded["systemMessage"])
        self.assertFalse(os.path.exists(self.stamp()))

    def test_reason_has_mypy_stdout_alone(self) -> None:
        """uv reports on stderr what it installed and how it linked
        files, and the plugin's shim reports a first-time install
        there too; the agent receives mypy's report, which is on
        stdout."""
        output = (
            "backend/src/main.py:3: error: Name \"Foo\" is not defined\n"
            "Found 1 error in 1 file (checked 2 source files)"
        )
        stderr = (
            "Uninstalled 1 package in 132ms\n"
            "warning: Failed to hardlink files; falling back to full copy.\n"
            "Installed 1 package in 598ms"
        )
        stdout = self.run_hook(
            self.stop(),
            mypy_exit=1,
            mypy_output=output,
            mypy_stderr=stderr,
        )
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected the hook to block the stop")
        self.assertIn(output, decoded["reason"])
        self.assertNotIn("Installed", decoded["reason"])
        self.assertNotIn("hardlink", decoded["reason"])

    def test_reason_has_only_the_last_lines_of_the_output(self) -> None:
        lines = [
            f"backend/src/main.py:{i}: error: line-{i:03d}" for i in range(80)
        ]
        lines.append("Found 80 errors in 1 file (checked 2 source files)")
        stdout = self.run_hook(
            self.stop(), mypy_exit=1, mypy_output="\n".join(lines)
        )
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected the hook to block the stop")
        reason = decoded["reason"]
        kept = len(lines) - TAIL_LINES
        self.assertNotIn(f"line-{kept - 1:03d}", reason)
        self.assertIn(f"line-{kept:03d}", reason)
        self.assertIn("Found 80 errors", reason)

    # Output encoding.

    def test_json_special_characters_in_output_encode(self) -> None:
        """mypy output has double quotes around names, backslashes in
        Windows paths, and tabs; the JSON the hook prints must encode
        all of them."""
        output = (
            'backend\\src\\main.py:3: error: "Foo" has no attribute "bar"\n'
            "\tnote: tab-indented context\n"
            "Found 1 error in 1 file (checked 2 source files)"
        )
        stdout = self.run_hook(self.stop(), mypy_exit=1, mypy_output=output)
        decoded = self.decoded(stdout)
        if decoded is None:
            self.fail("expected the hook to block the stop")
        self.assertIn(output, decoded["reason"])

    def test_without_python3_sed_and_awk_give_the_same_results(self) -> None:
        """With no working `python3`, the hook parses its input with
        sed and encodes its output with sed and awk; both must give
        the same results as the `python3` paths."""
        install(self.bin_dir, "python3", BROKEN_PYTHON3)
        output = (
            'backend\\src\\main.py:3: error: "Foo" has no attribute "bar"\n'
            "\tnote: tab-indented context\n"
            "Found 1 error in 1 file (checked 2 source files)"
        )
        with self.subTest("block"):
            stdout = self.run_hook(
                self.stop(), mypy_exit=1, mypy_output=output
            )
            decoded = self.decoded(stdout)
            if decoded is None:
                self.fail("expected the hook to block the stop")
            self.assertEqual(decoded["decision"], "block")
            self.assertIn(output, decoded["reason"])
        with self.subTest("stop_hook_active"):
            stdout = self.run_hook(
                self.stop(stop_hook_active=True),
                mypy_exit=1,
                mypy_output=output,
            )
            decoded = self.decoded(stdout)
            if decoded is None:
                self.fail("expected a systemMessage")
            self.assertNotIn("decision", decoded)
            self.assertIn("still reports errors", decoded["systemMessage"])
        with self.subTest("no errors"):
            stdout = self.run_hook(self.stop())
            self.assertEqual(stdout, "")
            self.assertTrue(os.path.exists(self.stamp()))


if __name__ == "__main__":
    unittest.main()
