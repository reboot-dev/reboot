"""What `reboot.bdd.feature.parse` makes of a `.feature` file."""
import unittest
from reboot.bdd.feature import parse


class ReadTest(unittest.TestCase):
    """What `reboot.bdd.feature.parse` makes of the Gherkin shapes."""

    def test_doc_strings_tables_and_outlines(self) -> None:
        feature = parse(
            'Feature: F\n'
            '  Scenario Outline: O\n'
            '    Given a step with:\n'
            '      """\n'
            '      doc string body\n'
            '      """\n'
            '    And a table:\n'
            '      | a | b |\n'
            '      | 1 | 2 |\n'
            '    And <x>\n'
            '    Examples: some\n'
            '      | x |\n'
            '      | 1 |\n'
        )
        assert feature is not None
        scenario = feature.scenarios[0]
        self.assertEqual(scenario.keyword, 'Scenario Outline')
        self.assertEqual(scenario.steps[0].doc_string, 'doc string body')
        self.assertEqual(
            [list(row.cells) for row in scenario.steps[1].table.rows],
            [['a', 'b'], ['1', '2']],
        )
        examples = scenario.examples[0]
        self.assertEqual(examples.name, 'some')
        self.assertEqual(
            [list(row.cells) for row in examples.table.rows],
            [['x'], ['1']],
        )

    def test_bare_headings_name_nothing(self) -> None:
        feature = parse('Feature:\n  Scenario:\n    Given ok\n')
        assert feature is not None
        self.assertFalse(feature.HasField('name'))
        self.assertFalse(feature.HasField('description'))
        self.assertFalse(feature.scenarios[0].HasField('name'))

    def test_a_file_declaring_no_feature_is_none(self) -> None:
        self.assertIsNone(parse('# only a comment\n'))

    def test_a_file_that_will_not_parse_carries_why(self) -> None:
        feature = parse(
            'Feature: broken\n  Scenario: s\n    Given ok\n  %%% what\n'
        )
        assert feature is not None
        self.assertIn('Parser errors', feature.error)
        self.assertEqual(feature.name, '')


if __name__ == '__main__':
    unittest.main()
