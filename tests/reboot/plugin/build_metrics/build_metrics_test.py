"""Tests for reading a build's numbers from its transcript.

`testdata/` holds seven small transcripts written for these tests:

* `baseline.jsonl`: one question answered after a 60 s wait, the design
  shown at 90 s, the API file written at 160 s, 3 scenarios passing at
  260 s;
* `slower.jsonl`: the same build, slower to every moment;
* `messy.jsonl`: lines that are not records, a declined tool call, a
  traceback, the API file written from a shell, and a failing test run
  before a passing one;
* `design_first.jsonl`: today's shape: a question before the design,
  `design/design.md` written, a short design message, the go-ahead
  ("Ready to build?"), the feature file, API file and servicers, a test
  run read back from its record (one failing, then passing), a page,
  and a long handoff with its "Your turn";
* `with_sub_agent.jsonl`, with `with_sub_agent/subagents/agent-a1.jsonl`
  beside it: the API file and servicers in the session, a sub-agent
  that reads, writes the first page and passes 2 browser scenarios, then
  the session's own run of 9;
* `codex.jsonl`: a Codex session in the shapes Codex records: its skill
  roots, an `AGENTS.md` taken in, code-mode scripts (one with
  JavaScript arrows, one reading a file, one writing a patch), then
  shell calls with a traceback and a passing run;
* `turn_end.jsonl`: the build ends its turn with the Claude app's
  `wrap_up` at 10 s, the person prompts again at 600 s, and the API
  file is written at 620 s.
"""

import os
import unittest
from pathlib import Path
from tests.reboot.plugin.build_metrics import build_metrics

TESTDATA = Path(
    os.environ.get(
        "BUILD_METRICS_TESTDATA",
        "tests/reboot/plugin/build_metrics/testdata",
    )
)


def read(name: str) -> build_metrics.Metrics:
    return build_metrics.read(TESTDATA / name)


class Moments(unittest.TestCase):

    def test_time_spent_answering_does_not_count(self) -> None:
        # The question waited 60 s; every moment is 60 s earlier than
        # the clock says.
        m = read("baseline.jsonl")
        self.assertEqual(m.questions, 1)
        self.assertEqual((m.design_s, m.api_s, m.green_s), (30, 100, 200))
        self.assertEqual(m.passed, 3)

    def test_time_after_the_build_ended_its_turn_does_not_count(self) -> None:
        # The turn ended at 10 s and the build spoke again at 620 s: the
        # API file written then is 10 s of the build's own time.
        self.assertEqual(read("turn_end.jsonl").api_s, 10)

    def test_the_api_file_can_be_written_from_a_shell(self) -> None:
        self.assertEqual(read("messy.jsonl").api_s, 20)

    def test_calls_before_the_first_edit_are_counted(self) -> None:
        m = read("messy.jsonl")
        self.assertEqual((m.edit_s, m.calls_before_edit), (20, 2))

    def test_a_run_with_a_failure_is_not_the_first_passing_one(self) -> None:
        m = read("messy.jsonl")
        self.assertEqual(m.green_s, 60)
        self.assertEqual(m.passed, 5)

    def test_a_moment_that_never_came_is_minus_one(self) -> None:
        self.assertEqual(read("messy.jsonl").design_s, -1)


class TheDesignDocument(unittest.TestCase):
    # Two waits: 30 s on the first question, 20 s on the go-ahead.

    def test_the_design_is_the_go_ahead_after_design_md(self) -> None:
        # Not "How should it be built?" before the design (5 s), not the
        # long handoff (260 s): the go-ahead at 80 s, less 30 s waited.
        self.assertEqual(read("design_first.jsonl").design_s, 50)

    def test_each_moment_after_it(self) -> None:
        m = read("design_first.jsonl")
        self.assertEqual(
            (m.feature_s, m.api_s, m.servicers_s, m.page_s, m.handoff_s),
            (60, 80, 100, 170, 210),
        )

    def test_a_run_read_back_from_its_record(self) -> None:
        # The record with a failure is not green; the next one is.
        m = read("design_first.jsonl")
        self.assertEqual((m.green_s, m.passed), (151, 4))

    def test_a_build_before_the_design_document_still_reads(self) -> None:
        # No design.md: the long message, as before.
        self.assertEqual(read("baseline.jsonl").design_s, 30)


class SubAgents(unittest.TestCase):

    def test_a_sub_agents_work_counts_toward_the_moments(self) -> None:
        # The page and the first passing run are the sub-agent's.
        m = read("with_sub_agent.jsonl")
        self.assertEqual((m.api_s, m.servicers_s), (40, 90))
        self.assertEqual((m.page_s, m.green_s), (120, 170))
        self.assertEqual(m.passed, 9)

    def test_its_reading_stays_out_of_the_main_conversation(self) -> None:
        m = read("with_sub_agent.jsonl")
        self.assertGreaterEqual(m.sub_agent_words, 120)
        self.assertLess(m.words_before_api, 60)

    def test_its_messages_are_not_the_handoff(self) -> None:
        self.assertEqual(read("with_sub_agent.jsonl").handoff_s, -1)

    def test_a_session_without_sub_agents_reads_as_before(self) -> None:
        self.assertEqual(read("baseline.jsonl").sub_agent_words, 0)


class WhatItSkips(unittest.TestCase):

    def test_lines_that_are_not_records_are_skipped(self) -> None:
        # Not JSON, a JSON list, a record with no timestamp: none of
        # them stops the reading or counts.
        m = read("messy.jsonl")
        self.assertEqual(m.questions, 0)
        self.assertEqual(m.plugin, "reboot-next (installed)")

    def test_a_declined_call_is_not_an_error(self) -> None:
        m = read("messy.jsonl")
        self.assertEqual(m.errors, 1)
        self.assertIn("reserved method name", m.error_lines[0])

    def test_a_loaded_skill_counts_as_read(self) -> None:
        self.assertGreater(read("messy.jsonl").words_before_api, 50)


class AgainstABaseline(unittest.TestCase):

    def test_slower_on_every_moment_is_worse_on_each(self) -> None:
        worse = build_metrics.worse_on(
            read("slower.jsonl"), read("baseline.jsonl")
        )
        self.assertEqual(worse, ["design_s", "api_s", "green_s"])

    def test_a_build_is_no_worse_than_itself(self) -> None:
        m = read("baseline.jsonl")
        self.assertEqual(build_metrics.worse_on(m, m), [])

    def test_a_time_within_the_slack_is_not_worse(self) -> None:
        self.assertFalse(build_metrics.worse("api_s", 109, 100))
        self.assertTrue(build_metrics.worse("api_s", 111, 100))

    def test_one_more_question_is_worse(self) -> None:
        self.assertTrue(build_metrics.worse("questions", 4, 3))

    def test_never_reaching_a_moment_the_baseline_reached_is_worse(
        self,
    ) -> None:
        self.assertTrue(build_metrics.worse("green_s", -1, 600))
        self.assertFalse(build_metrics.worse("green_s", -1, -1))


class Codex(unittest.TestCase):

    def test_a_codex_transcript_is_read_as_codex(self) -> None:
        self.assertEqual(read("codex.jsonl").agent, "codex")
        self.assertEqual(read("baseline.jsonl").agent, "claude")

    def test_its_moments(self) -> None:
        m = read("codex.jsonl")
        self.assertEqual(m.design_s, 40)
        # The patch adds the API file: the first edit and the API file.
        self.assertEqual((m.edit_s, m.api_s), (50, 50))
        # A script that filters tools with `x=>...` writes nothing.
        self.assertEqual(m.calls_before_edit, 2)
        self.assertEqual((m.green_s, m.passed), (120, 4))

    def test_what_it_took_in(self) -> None:
        m = read("codex.jsonl")
        self.assertTrue(m.map_loaded)
        self.assertEqual(m.plugin, "reboot-next (installed)")
        self.assertEqual(m.errors, 1)
        self.assertIn("bad field", m.error_lines[0])


class PluginSource(unittest.TestCase):

    def test_where_a_skill_came_from(self) -> None:
        cases = {
            "/Users/a/Library/Application Support/Claude/"
            "local-agent-mode-sessions/x/rpm/plugin_1":
                "Claude app upload",
            "/Users/a/.claude/plugins/cache/reboot-plugin/reboot/abc":
                "reboot-plugin (installed)",
            "/Users/a/.codex/.tmp/marketplaces/reboot-plugin/plugins/reboot":
                "reboot-plugin (installed)",
            "/Users/a/projects/reboot-next/reboot/plugin":
                "plugin",
        }
        for base, expected in cases.items():
            with self.subTest(base=base):
                self.assertEqual(build_metrics.plugin_source(base), expected)


if __name__ == "__main__":
    unittest.main()
