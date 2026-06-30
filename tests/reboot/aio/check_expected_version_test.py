import os
import unittest
from reboot.aio.applications import check_expected_version
from reboot.settings import ENVVAR_REBOOT_EXPECTED_VERSION
from reboot.version import REBOOT_VERSION
from unittest.mock import patch


# Mock `terminal.fail`, because the original would exit the program.
def mock_raise_instead_of_fail(message):
    raise RuntimeError(message)


@patch('reboot.cli.common.terminal.fail', mock_raise_instead_of_fail)
class CheckExpectedVersionTest(unittest.TestCase):

    def setUp(self) -> None:
        os.environ.pop(ENVVAR_REBOOT_EXPECTED_VERSION, None)

    def test_no_expectation(self) -> None:
        # Without the environment variable (e.g. under `pytest`) the
        # check is a no-op.
        check_expected_version()

    def test_matching_version(self) -> None:
        with patch.dict(
            os.environ, {ENVVAR_REBOOT_EXPECTED_VERSION: REBOOT_VERSION}
        ):
            check_expected_version()

    def test_library_older_than_cli(self) -> None:
        with patch.dict(
            os.environ, {ENVVAR_REBOOT_EXPECTED_VERSION: '999.0.0'}
        ):
            with self.assertRaises(RuntimeError) as fail:
                check_expected_version()
        message = str(fail.exception)
        self.assertIn(REBOOT_VERSION, message)
        self.assertIn('999.0.0', message)
        # The application is behind: agents should run the `upgrade`
        # skill.
        self.assertIn('`upgrade` skill', message)
        self.assertIn('https://docs.reboot.dev/upgrade', message)

    def test_library_newer_than_cli(self) -> None:
        with patch.dict(os.environ, {ENVVAR_REBOOT_EXPECTED_VERSION: '0.0.1'}):
            with self.assertRaises(RuntimeError) as fail:
                check_expected_version()
        message = str(fail.exception)
        # The CLI is behind: the user should update the plugin (or
        # their `rbt` install), not downgrade the application.
        self.assertIn('older than this application', message)
        self.assertIn('https://docs.reboot.dev/upgrade', message)

    def test_dev_cli_newer_than_release_library(self) -> None:
        # A development `rbt` (e.g. built from the
        # `//reboot:reboot.dev` Bazel target) carries a suffix on the
        # release version it was built after and counts as NEWER than
        # that bare release, so the application is the older side and
        # should be upgraded.
        with patch.dict(
            os.environ,
            {ENVVAR_REBOOT_EXPECTED_VERSION: f'{REBOOT_VERSION}.dev0'}
        ):
            with self.assertRaises(RuntimeError) as fail:
                check_expected_version()
        message = str(fail.exception)
        self.assertIn('`upgrade` skill', message)
        self.assertNotIn('older than this application', message)

    def test_unparseable_expected_version(self) -> None:
        with patch.dict(os.environ, {ENVVAR_REBOOT_EXPECTED_VERSION: 'bogus'}):
            with self.assertRaises(RuntimeError) as fail:
                check_expected_version()
        # Still a mismatch, even though we can't tell the direction.
        self.assertIn('https://docs.reboot.dev/upgrade', str(fail.exception))


if __name__ == '__main__':
    unittest.main()
