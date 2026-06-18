"""Tests for the plugin's `remind.sh` hook.

The hook script is invoked as a subprocess with the hook-input JSON
on stdin, the way Claude Code and Codex invoke it. Transcript-tail
cases run against real temporary JSONL files, and the Reboot-project
gate runs against real temporary directories.
"""

import json
import os
import subprocess
import tempfile
import unittest
from typing import Optional

# Path to the script under test, injected by Bazel via the `env` attr
# in `BUILD.bazel` as a runfiles-relative path. Absolutized so tests
# can run the hook from any working directory.
HOOK_SCRIPT = os.path.abspath(os.environ["REMIND_SH"])

# First line of the reminder; must match `sentinel` in `remind.sh`.
SENTINEL = "[reboot-plugin-reminder]"

# Size of the transcript tail the hook greps for the sentinel; must
# match `tail_lines` in `remind.sh`.
TAIL_LINES = 40


def run_hook(payload: dict, process_cwd: Optional[str] = None) -> str:
    """Invoke the hook with the given hook-input payload. Returns
    stdout. Raises when the hook exits non-zero (both CLIs treat that
    as a hook error, and this hook never has a reason to signal one)
    or when it takes longer than the timeout (a hung hook would block
    the CLI's whole turn). `process_cwd` sets the hook process's own
    working directory, which the Reboot-project gate falls back to
    for relative or missing `cwd` fields."""
    # Invoke via `sh` so the test doesn't depend on the executable bit
    # being preserved by Bazel.
    result = subprocess.run(
        ["sh", HOOK_SCRIPT],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=30,
        cwd=process_cwd,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"hook exited {result.returncode}: {result.stderr}"
        )
    return result.stdout


def context_from_stdout(stdout: str) -> Optional[str]:
    """The `additionalContext` string the hook emitted, or `None` when
    the hook stayed silent. Raises when whatever the hook printed is
    malformed: hosts reject malformed hook output, so a parse error
    here is a bug, not a "no decision"."""
    if not stdout.strip():
        return None
    decoded = json.loads(stdout)
    context = decoded["hookSpecificOutput"]["additionalContext"]
    if not isinstance(context, str):
        raise AssertionError(f"additionalContext is not a string: {context!r}")
    return context


def transcript_line(text: str) -> str:
    """One transcript entry: a single JSONL line whose message content
    embeds `text`, the way the agent CLIs record conversation
    entries."""
    return json.dumps({"role": "user", "content": text})


class RemindTest(unittest.TestCase):

    def setUp(self) -> None:
        # A Reboot project (a `.rbtrc` at its root, plus a `web/`
        # subdirectory) and a directory with no `.rbtrc` at or above
        # it, for the Reboot-project gate.
        project_dir = tempfile.TemporaryDirectory()
        self.addCleanup(project_dir.cleanup)
        self.project_dir = project_dir.name
        open(os.path.join(self.project_dir, ".rbtrc"), "w").close()
        os.makedirs(os.path.join(self.project_dir, "web"))
        non_project_dir = tempfile.TemporaryDirectory()
        self.addCleanup(non_project_dir.cleanup)
        self.non_project_dir = non_project_dir.name

    def write_transcript(self, lines: list[str]) -> str:
        """Write a JSONL transcript holding `lines` and return its
        path. The file lives in a per-test temporary directory torn
        down by the cleanup hook."""
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = os.path.join(directory.name, "transcript.jsonl")
        with open(path, "w") as f:
            f.write("\n".join(lines) + "\n")
        return path

    def test_session_start_emits(self) -> None:
        stdout = run_hook(
            {
                "hook_event_name": "SessionStart",
                "source": "startup",
                "cwd": self.project_dir,
                "transcript_path": None,
            }
        )
        context = context_from_stdout(stdout)
        if context is None:
            self.fail("expected the hook to emit a reminder")
        self.assertTrue(context.startswith(SENTINEL))
        decoded = json.loads(stdout)
        self.assertEqual(
            decoded["hookSpecificOutput"]["hookEventName"],
            "SessionStart",
        )

    def test_session_start_emits_despite_recent_reminder(self) -> None:
        """`SessionStart` fires where in-conversation copies of the
        reminder get dropped (e.g. right after compaction), so it
        emits even when the transcript's tail still shows one."""
        path = self.write_transcript(
            [transcript_line(f"{SENTINEL} reminder text")]
        )
        stdout = run_hook(
            {
                "hook_event_name": "SessionStart",
                "source": "compact",
                "cwd": self.project_dir,
                "transcript_path": path,
            }
        )
        self.assertIsNotNone(context_from_stdout(stdout))

    def test_prompt_submit_emits_without_transcript(self) -> None:
        """No transcript to check means no proof a recent copy exists,
        so the hook errs on the side of emitting. Codex passes
        `transcript_path: null` in some sessions; a missing key and a
        stale path get the same treatment."""
        payloads: list[dict] = [
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.project_dir,
            },
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.project_dir,
                "transcript_path": None,
            },
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.project_dir,
                "transcript_path": "/nonexistent/transcript.jsonl",
            },
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                stdout = run_hook(payload)
                context = context_from_stdout(stdout)
                if context is None:
                    self.fail("expected the hook to emit a reminder")
                self.assertTrue(context.startswith(SENTINEL))
                decoded = json.loads(stdout)
                self.assertEqual(
                    decoded["hookSpecificOutput"]["hookEventName"],
                    "UserPromptSubmit",
                )

    def test_prompt_submit_silent_when_reminder_recent(self) -> None:
        """A sentinel anywhere in the last `TAIL_LINES` transcript
        lines suppresses the reminder — including at the very edge of
        the window."""
        cases = [
            ("sentinel on the last line", 0),
            ("sentinel just inside the tail window", TAIL_LINES - 1),
        ]
        for label, lines_after in cases:
            with self.subTest(label=label):
                path = self.write_transcript(
                    [transcript_line(f"{SENTINEL} reminder text")] + [
                        transcript_line(f"filler {i}")
                        for i in range(lines_after)
                    ]
                )
                stdout = run_hook(
                    {
                        "hook_event_name": "UserPromptSubmit",
                        "prompt": "hi",
                        "cwd": self.project_dir,
                        "transcript_path": path,
                    }
                )
                self.assertIsNone(context_from_stdout(stdout))

    def test_prompt_submit_emits_when_reminder_stale(self) -> None:
        """A sentinel pushed out of the tail window by later entries
        no longer counts as recent, so the hook re-emits."""
        path = self.write_transcript(
            [transcript_line(f"{SENTINEL} reminder text")] +
            [transcript_line(f"filler {i}") for i in range(TAIL_LINES)]
        )
        stdout = run_hook(
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.project_dir,
                "transcript_path": path,
            }
        )
        self.assertIsNotNone(context_from_stdout(stdout))

    def test_round_trip_through_transcript(self) -> None:
        """The throttle must recognize the hook's own output: emit
        once, record the emitted context into a transcript the way a
        CLI would, and the next prompt stays silent."""
        first = run_hook(
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.project_dir,
                "transcript_path": None,
            }
        )
        context = context_from_stdout(first)
        if context is None:
            self.fail("expected the first prompt to emit a reminder")
        path = self.write_transcript(
            [
                transcript_line("hello"),
                transcript_line(f"<system-reminder>{context}"),
            ]
        )
        second = run_hook(
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi again",
                "cwd": self.project_dir,
                "transcript_path": path,
            }
        )
        self.assertIsNone(context_from_stdout(second))

    def test_unknown_event_stays_silent(self) -> None:
        stdout = run_hook(
            {
                "hook_event_name": "PreCompact",
                "trigger": "auto",
                "cwd": self.project_dir,
                "transcript_path": None,
            }
        )
        self.assertEqual(stdout, "")

    def test_outside_reboot_project_stays_silent(self) -> None:
        """The plugin is typically installed globally, so the hook
        runs in every session; with no `.rbtrc` at or above `cwd`, the
        session is not a Reboot project and gets no reminder — even
        in payloads that would otherwise always emit."""
        payloads: list[dict] = [
            {
                "hook_event_name": "SessionStart",
                "source": "startup",
                "cwd": self.non_project_dir,
                "transcript_path": None,
            },
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt": "hi",
                "cwd": self.non_project_dir,
                "transcript_path": None,
            },
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                self.assertEqual(run_hook(payload), "")

    def test_missing_cwd_stays_silent(self) -> None:
        """With no `cwd` in the payload the gate falls back to the
        hook process's own working directory, which in this test is
        not a Reboot project."""
        stdout = run_hook(
            {
                "hook_event_name": "SessionStart",
                "source": "startup",
                "transcript_path": None,
            }
        )
        self.assertEqual(stdout, "")

    def test_project_subdirectory_emits(self) -> None:
        """The gate walks ancestors, so a session running from a
        subdirectory of the project (e.g. its `web/` frontend) still
        gets the reminder."""
        stdout = run_hook(
            {
                "hook_event_name": "SessionStart",
                "source": "startup",
                "cwd": os.path.join(self.project_dir, "web"),
                "transcript_path": None,
            }
        )
        self.assertIsNotNone(context_from_stdout(stdout))

    def test_relative_cwd_resolves_and_terminates(self) -> None:
        """A relative `cwd` resolves against the hook process's own
        working directory, and the ancestor walk terminates rather
        than spinning on a path that never reaches `/` (`run_hook`'s
        timeout turns such a spin into a failure)."""
        cases = [
            # `web` under the project root: a Reboot project.
            ("web", self.project_dir, True),
            # The same relative directory under a non-project root.
            ("web", self.non_project_dir, False),
        ]
        os.makedirs(os.path.join(self.non_project_dir, "web"))
        for relative_cwd, process_cwd, expect_reminder in cases:
            with self.subTest(process_cwd=process_cwd):
                stdout = run_hook(
                    {
                        "hook_event_name": "SessionStart",
                        "source": "startup",
                        "cwd": relative_cwd,
                        "transcript_path": None,
                    },
                    process_cwd=process_cwd,
                )
                if expect_reminder:
                    self.assertIsNotNone(context_from_stdout(stdout))
                else:
                    self.assertEqual(stdout, "")

    def test_prompt_containing_field_shaped_text(self) -> None:
        """A prompt whose text itself contains `"cwd": ...` or
        `"transcript_path": ...` must not shadow the payload's real
        top-level fields when deciding the Reboot-project gate."""
        stdout = run_hook(
            {
                "hook_event_name": "UserPromptSubmit",
                "prompt":
                    (
                        'what does "cwd": "/nowhere" mean in '
                        '"transcript_path": "/nowhere/t.jsonl"?'
                    ),
                "cwd": self.project_dir,
                "transcript_path": None,
            }
        )
        self.assertIsNotNone(context_from_stdout(stdout))


if __name__ == "__main__":
    unittest.main()
