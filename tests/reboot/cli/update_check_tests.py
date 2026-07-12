import contextlib
import io
import json
import os
import tempfile
import time
import unittest
from reboot.cli.common import update_check
from reboot.settings import ENVVAR_REBOOT_NO_VERSION_CHECK
from unittest.mock import patch


class UpdateCheckTestCase(unittest.TestCase):

    def setUp(self) -> None:
        # Point the cache at a fresh temporary directory and make sure
        # neither opt-out environment variable is set.
        self._temporary_directory = tempfile.TemporaryDirectory()
        self._environ = patch.dict(
            os.environ,
            {'XDG_CACHE_HOME': self._temporary_directory.name},
            clear=False,
        )
        self._environ.start()
        # Bazel sets `REBOOT_NO_VERSION_CHECK` for every test via
        # `.bazelrc`; remove it (and `CI`) so the tests below exercise
        # the non-test code path.
        os.environ.pop(ENVVAR_REBOOT_NO_VERSION_CHECK, None)
        os.environ.pop('CI', None)

    def tearDown(self) -> None:
        self._environ.stop()
        self._temporary_directory.cleanup()

    def _check(self) -> str:
        """Runs the check and returns what it printed to stderr."""
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            update_check.check_for_newer_version()
        return stderr.getvalue()

    def test_notice_when_newer_version_available(self) -> None:
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0'
        ):
            output = self._check()
        self.assertIn('999.0.0', output)
        self.assertIn(update_check.REBOOT_VERSION, output)
        self.assertIn('upgrade', output)
        self.assertIn('https://docs.reboot.dev/upgrade', output)

    def test_no_notice_when_up_to_date(self) -> None:
        with patch.object(
            update_check,
            '_fetch_latest_version',
            return_value=update_check.REBOOT_VERSION,
        ):
            self.assertEqual(self._check(), '')

    def test_no_notice_when_pypi_is_older(self) -> None:
        with patch.object(
            update_check, '_fetch_latest_version', return_value='0.0.1'
        ):
            self.assertEqual(self._check(), '')

    def test_no_notice_on_unparseable_version(self) -> None:
        with patch.object(
            update_check, '_fetch_latest_version', return_value='unparseable'
        ):
            self.assertEqual(self._check(), '')

    def test_notice_on_newer_suffixed_version(self) -> None:
        # A version with a (development) suffix is parseable; its
        # numeric components decide that it is newer than this `rbt`.
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0rc1'
        ):
            self.assertIn('999.0.0rc1', self._check())

    def test_silent_on_fetch_failure(self) -> None:
        with patch.object(
            update_check,
            '_fetch_latest_version',
            side_effect=OSError('no network'),
        ):
            self.assertEqual(self._check(), '')

    def test_opt_out_environment_variables(self) -> None:
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0'
        ) as fetch:
            with patch.dict(
                os.environ, {ENVVAR_REBOOT_NO_VERSION_CHECK: 'true'}
            ):
                self.assertEqual(self._check(), '')
            with patch.dict(os.environ, {'CI': 'true'}):
                self.assertEqual(self._check(), '')
        # Opting out skips even the fetch.
        fetch.assert_not_called()

    def test_fetch_is_throttled_by_cache(self) -> None:
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0'
        ) as fetch:
            self._check()
            self._check()
        # The second check used the cache instead of fetching again.
        self.assertEqual(fetch.call_count, 1)

    def test_fetch_failure_is_cached(self) -> None:
        with patch.object(
            update_check,
            '_fetch_latest_version',
            side_effect=OSError('no network'),
        ) as fetch:
            self._check()
            self._check()
        # The failure is cached too: an offline machine retries at
        # most once per interval.
        self.assertEqual(fetch.call_count, 1)

    def test_stale_cache_triggers_refetch(self) -> None:
        cache_file = update_check._cache_file()
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(
            json.dumps(
                {
                    'checked_at':
                        time.time() - update_check.CHECK_INTERVAL_SECONDS - 1,
                    'latest':
                        '888.0.0',
                }
            ),
            encoding='utf-8',
        )
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0'
        ) as fetch:
            output = self._check()
        fetch.assert_called_once()
        self.assertIn('999.0.0', output)

    def test_corrupt_cache_is_tolerated(self) -> None:
        cache_file = update_check._cache_file()
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text('not json', encoding='utf-8')
        with patch.object(
            update_check, '_fetch_latest_version', return_value='999.0.0'
        ):
            output = self._check()
        self.assertIn('999.0.0', output)


if __name__ == '__main__':
    unittest.main()
