"""Scenarios appear as the developer writes their feature files.

The behaviors watcher reads every `.feature` file under the working
directory, so these tests run the dashboard in a temporary working
directory of their own.
"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import Dashboard
from reboot.aio.tests import Reboot
from reboot.dashboard.backend.constants import (
    DASHBOARD_ID,
    ENVVAR_RBT_API_DIRECTORY,
)
from reboot.dashboard.backend.main import application
from typing import Optional
from unittest.mock import patch

BANK = '''Feature: Bank accounts
  Money that is deposited can be withdrawn.

  Background:
    Given the application is up

  Scenario: Depositing moves the balance
    When the `Account` for "alice" gets a `deposit` with `amount=100`
    Then `balance` on the `Account` for "alice" has `balance=100`

  Rule: Overdrafts are refused
    @wip
    Example: Withdrawing more than the balance
      When the `Account` for "alice" attempts a `withdraw` with `amount=1`
      Then the attempt aborts with `OverdraftError`
      And the overdraft was logged
'''


class BehaviorsWatcherTest(unittest.IsolatedAsyncioTestCase):

    watcher: Optional[asyncio.Task] = None

    async def asyncSetUp(self) -> None:
        # The workflow reads the working directory when the
        # application comes up, so it has to be this test's own
        # before then.
        self._directory = tempfile.TemporaryDirectory()
        self.directory = Path(self._directory.name)
        self._working_directory = os.getcwd()
        os.chdir(self.directory)

        # The API watcher's workflow requires a directory, even
        # though these tests write no API files into it.
        (self.directory / 'api').mkdir()
        self._environment = patch.dict(
            os.environ,
            {ENVVAR_RBT_API_DIRECTORY: 'api'},
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()

    async def _start_dashboard(self) -> None:
        """Brings the dashboard up.

        Called by each test rather than in setup, so a test can write
        feature files first and start the dashboard against files
        that already exist.
        """
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        os.chdir(self._working_directory)
        self._directory.cleanup()

    async def _wait_for_features(self, satisfied):
        """Returns the recorded features once they satisfy, reading
        again whenever they change."""
        context = self.rbt.create_external_context(name=self.id())

        async for response in Dashboard.ref(DASHBOARD_ID
                                           ).reactively().Get(context):
            if satisfied(response.features):
                return response.features

        raise AssertionError('never satisfied')

    def _write_feature_file(self, relative: str, source: str) -> None:
        path = self.directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source)

    async def test_scenarios_appear_and_follow_changes(self) -> None:
        """What a feature file declares is recorded against its path,
        and a save is read again."""
        self._write_feature_file('backend/tests/bank.feature', BANK)

        await self._start_dashboard()
        features = await self._wait_for_features(
            lambda features: len(features) == 1
        )

        feature = features['backend/tests/bank.feature']
        self.assertEqual(feature.name, 'Bank accounts')
        self.assertEqual(
            feature.description, 'Money that is deposited can be withdrawn.'
        )
        self.assertEqual(
            [step.text for step in feature.background.steps],
            ['the application is up'],
        )
        self.assertEqual(len(feature.scenarios), 1)
        scenario = feature.scenarios[0]
        self.assertEqual(scenario.keyword, 'Scenario')
        self.assertEqual(scenario.name, 'Depositing moves the balance')
        self.assertEqual(
            [(step.keyword, step.text) for step in scenario.steps],
            [
                (
                    'When', 'the `Account` for "alice" gets a `deposit` '
                    'with `amount=100`'
                ),
                (
                    'Then', '`balance` on the `Account` for "alice" has '
                    '`balance=100`'
                ),
            ],
        )
        # Each step the grammar defines is parsed into its parts.
        built_in = scenario.steps[0].built_in
        self.assertEqual(built_in.WhichOneof('step'), 'gets')
        self.assertEqual(built_in.gets.state.type, 'Account')
        self.assertEqual(built_in.gets.state.id, 'alice')
        self.assertEqual(built_in.gets.method, 'deposit')
        self.assertEqual(len(built_in.gets.assignments), 1)
        self.assertEqual(len(feature.rules), 1)
        rule = feature.rules[0]
        self.assertEqual(rule.name, 'Overdrafts are refused')
        self.assertEqual(len(rule.scenarios), 1)
        self.assertEqual(rule.scenarios[0].keyword, 'Example')
        self.assertEqual(list(rule.scenarios[0].tags), ['@wip'])
        # A step the grammar does not define, such as one the
        # application defines itself, has no built-in syntax.
        self.assertFalse(rule.scenarios[0].steps[2].HasField('built_in'))

        # A second scenario, saved while the dashboard is watching.
        self._write_feature_file(
            'backend/tests/bank.feature',
            BANK + '''
  Scenario: A second withdrawal is also refused
    When the `Account` for "alice" attempts a `withdraw` with `amount=2`
    Then the attempt aborts with `OverdraftError`
''',
        )

        features = await self._wait_for_features(
            lambda features: len(features) == 1 and
            len(features['backend/tests/bank.feature'].rules) == 1 and
            len(features['backend/tests/bank.feature'].rules[0].scenarios) == 2
        )

    async def test_a_file_that_will_not_parse_says_so(self) -> None:
        """Why a file could not be parsed is recorded against that
        file, and a save that fixes it replaces the error with what
        the file declares."""
        self._write_feature_file(
            'broken.feature',
            'Feature: broken\n  Scenario: s\n    Given ok\n  %%% what\n',
        )

        await self._start_dashboard()
        features = await self._wait_for_features(
            lambda features: 'broken.feature' in features and features[
                'broken.feature'].HasField('error')
        )
        self.assertIn('Parser errors', features['broken.feature'].error)

        self._write_feature_file(
            'broken.feature',
            'Feature: fixed\n  Scenario: s\n    Given ok\n',
        )

        features = await self._wait_for_features(
            lambda features: 'broken.feature' in features and not features[
                'broken.feature'].HasField('error')
        )
        self.assertEqual(features['broken.feature'].name, 'fixed')

    async def test_installed_packages_feature_files_are_left_out(
        self,
    ) -> None:
        """A `.venv` or `node_modules` carries installed packages'
        feature files, which are not the developer's."""
        self._write_feature_file('backend/tests/bank.feature', BANK)
        self._write_feature_file(
            '.venv/lib/site-packages/other/their.feature',
            'Feature: theirs\n',
        )
        self._write_feature_file(
            'node_modules/other/their.feature',
            'Feature: theirs\n',
        )

        await self._start_dashboard()
        features = await self._wait_for_features(
            lambda features: len(features) > 0
        )
        self.assertEqual(
            list(features.keys()),
            ['backend/tests/bank.feature'],
        )


if __name__ == '__main__':
    unittest.main()
