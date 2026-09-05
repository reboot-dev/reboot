"""Where a scenario's recordings are kept beside its feature file."""
import unittest
from pathlib import Path
from reboot.bdd import recordings


class RecordingsTest(unittest.TestCase):

    def test_the_directory_is_beside_the_feature_file(self) -> None:
        self.assertEqual(
            recordings.recordings_directory(Path('backend/tests/web.feature')),
            Path('backend/tests/web.recordings'),
        )

    def test_a_scenario_is_named_by_its_slug(self) -> None:
        self.assertEqual(
            recordings.scenario_directory(
                Path('backend/tests/web.feature'),
                "Transferring between two of the customer's accounts",
            ),
            Path(
                'backend/tests/web.recordings/'
                'transferring-between-two-of-the-customer-s-accounts'
            ),
        )
        self.assertEqual(
            recordings.scenario_slug('  Odd -- name! '), 'odd-name'
        )

    def test_a_screenshot_is_named_by_its_line(self) -> None:
        self.assertEqual(recordings.screenshot_filename(14), '14.png')


if __name__ == '__main__':
    unittest.main()
