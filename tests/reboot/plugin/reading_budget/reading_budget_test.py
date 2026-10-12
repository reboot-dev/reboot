"""Tests for the plugin's reading path (`reading_budget.py`).

The reading lists are checked against the skills as they are: every
reference a list names exists, every conditional reference still says
why it is conditional, and each front door's path stays under its
ceiling. The parser is checked on small, made-up lists.
"""

import os
import unittest
from pathlib import Path
from tests.reboot.plugin.reading_budget import reading_budget
from tests.reboot.plugin.reading_budget.reading_budget import (
    CONDITIONAL,
    FRONT_DOORS,
)

# The plugin's `skills/` folder: under Bazel, the runfiles path of
# `//reboot/plugin:skills`; otherwise `REBOOT_PLUGIN_SKILLS`.
SKILLS = Path(os.environ.get("REBOOT_PLUGIN_SKILLS", "reboot/plugin/skills"))

# Words on each front door's minimal reading path may grow to these.
# A change that needs more raises the ceiling in the same change and
# says why in its description; a change that cuts words may lower it.
CEILINGS = {
    "web-app": 39_000,  # 37,248 when this test was written
    "mcp-ui": 52_000,  # 49,907 when this test was written
}


class TheSkillsAsTheyAre(unittest.TestCase):

    def test_every_reference_a_reading_list_names_exists(self) -> None:
        for door in FRONT_DOORS:
            for entry in reading_budget.reading_list(SKILLS, door):
                with self.subTest(door=door, reference=entry.named):
                    self.assertTrue(
                        entry.path,
                        f"{door}'s reading list names {entry.named}, which "
                        f"no skill has (in: {entry.text[:80]!r})",
                    )

    def test_every_conditional_reference_still_says_why(self) -> None:
        for door in FRONT_DOORS:
            listed = {
                e.path: e.text
                for e in reading_budget.reading_list(SKILLS, door)
            }
            for path, words in CONDITIONAL[door].items():
                with self.subTest(door=door, reference=path):
                    self.assertIn(
                        path,
                        listed,
                        f"CONDITIONAL names {path}, which {door}'s reading "
                        "list no longer names; remove it from CONDITIONAL",
                    )
                    self.assertIn(
                        words,
                        listed[path],
                        f"{door}'s entry for {path} no longer says "
                        f"{words!r}; if it is now read by every build, "
                        "remove it from CONDITIONAL, else update the words",
                    )

    def test_every_loaded_skill_exists(self) -> None:
        for door in FRONT_DOORS:
            for skill in reading_budget.SKILLS_LOADED[door]:
                with self.subTest(door=door, skill=skill):
                    self.assertTrue((SKILLS / skill / "SKILL.md").is_file())

    def test_each_reading_path_stays_under_its_ceiling(self) -> None:
        for door in FRONT_DOORS:
            path = reading_budget.reading_path(SKILLS, door)
            # Shown in the test log, so a change's effect is visible.
            print(
                f"{door}: {path.minimal:,} words on the minimal path "
                f"(skills {path.skills:,}, references {path.references:,}),"
                f" {path.everything:,} with every conditional reference;"
                f" ceiling {CEILINGS[door]:,}"
            )
            with self.subTest(door=door):
                self.assertLessEqual(
                    path.minimal,
                    CEILINGS[door],
                    f"{door}'s minimal reading path is {path.minimal:,} "
                    f"words, over its ceiling of {CEILINGS[door]:,}. Every "
                    "build reads these words and sends them again on each "
                    "later turn: cut elsewhere, or raise the ceiling in "
                    "this change and say why",
                )


class TheParser(unittest.TestCase):

    def entries(self, markdown: str) -> list[tuple[str, str]]:
        return list(reading_budget.entries(markdown))

    def test_entries_take_their_step_from_the_heading_above(self) -> None:
        found = self.entries(
            "**Before the API definition:**\n\n"
            "- `python/references/api-methods.md` — factories.\n\n"
            "**Before the servicer:**\n\n"
            "- `python/references/rpc-calls.md` — kwargs.\n"
        )
        self.assertEqual(
            [step for step, _ in found], ["api definition", "servicer"]
        )

    def test_a_bullet_keeps_its_continuation_lines(self) -> None:
        [(_, text)] = self.entries(
            "**Before the servicer:**\n"
            "- `python/references/servicer-workflow.md` — only when\n"
            "  you declared a `Workflow`.\n"
        )
        self.assertIn("only when you declared a `Workflow`", text)

    def test_callouts_are_not_entries(self) -> None:
        found = self.entries(
            "**Before the frontend:**\n"
            "> Never read `mcp-ui/references/react-app-tsx.md` here.\n"
            "- `references/react-client.md` — the client.\n"
        )
        self.assertEqual(len(found), 1)
        self.assertIn("react-client", found[0][1])

    def test_prose_before_the_first_step_is_not_an_entry(self) -> None:
        self.assertEqual(
            self.entries("Read each once: `python/references/x.md`.\n"), []
        )

    def test_a_brace_list_names_each_reference(self) -> None:
        self.assertEqual(
            reading_budget.expand("servicer-{reader, writer}"),
            ["servicer-reader", "servicer-writer"],
        )
        self.assertEqual(reading_budget.expand("rpc-refs"), ["rpc-refs"])


if __name__ == "__main__":
    unittest.main()
