"""Where a scenario's recordings are kept beside its feature file."""
import unittest
from pathlib import Path
from rbt.v1alpha1.bdd.feature_pb2 import Background, Scenario, Step
from reboot.bdd import recordings


def _scenario(name: str, *texts: str) -> Scenario:
    return Scenario(
        name=name,
        steps=[Step(keyword='Then', text=text) for text in texts],
    )


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

    def test_a_run_is_named_by_the_digest_of_what_it_runs(self) -> None:
        scenario = _scenario('S', 'the page shows "a"')
        digest = recordings.digest(scenario, [])

        self.assertRegex(digest, '^[0-9a-f]{16}$')
        self.assertEqual(
            recordings.recording_directory(
                Path('backend/tests/web.feature'), scenario, []
            ),
            Path(f'backend/tests/web.recordings/s/{digest}'),
        )
        # The same scenario digests the same, however it is described
        # or tagged, since neither changes what a recording shows.
        described = Scenario()
        described.CopyFrom(scenario)
        described.description = 'A description.'
        described.tags.append('@wip')
        described.keyword = 'Example'
        self.assertEqual(recordings.digest(described, []), digest)
        # A changed step, a changed name, or a changed background
        # each digest differently.
        self.assertNotEqual(
            recordings.digest(_scenario('S', 'the page shows "b"'), []),
            digest,
        )
        self.assertNotEqual(
            recordings.digest(_scenario('T', 'the page shows "a"'), []),
            digest,
        )
        self.assertNotEqual(
            recordings.digest(
                scenario,
                [Background(steps=[Step(keyword='Given', text='up')])],
            ),
            digest,
        )

    def test_a_screenshot_is_named_by_its_position(self) -> None:
        self.assertEqual(recordings.screenshot_filename(2), '2.png')


if __name__ == '__main__':
    unittest.main()
