"""Checks the plugin's skills against the plugin directories' limits."""
import os
import unittest
import yaml

SKILL_FILES = os.environ["SKILL_FILES"].split()

# OpenAI's plugin directory rejects a skill whose description is longer
# than this, counted after it collapses runs of whitespace:
# https://developers.openai.com/plugins/deploy/submission-errors
MAX_DESCRIPTION_LENGTH = 1024


class SkillsTest(unittest.TestCase):

    def test_at_most_1024_characters(self) -> None:
        self.assertTrue(SKILL_FILES)
        for path in SKILL_FILES:
            with self.subTest(skill=path):
                with open(path) as skill_file:
                    front_matter = skill_file.read().split("---\n")[1]
                description = " ".join(
                    yaml.safe_load(front_matter)["description"].split()
                )
                self.assertLessEqual(len(description), MAX_DESCRIPTION_LENGTH)


if __name__ == "__main__":
    unittest.main()
