import os
import unittest
from reboot.server.local_envoy_factory import LocalEnvoyFactory
from reboot.settings import ENVVAR_LOCAL_ENVOY_MODE, LocalEnvoyMode
from typing import Optional
from unittest import mock


def _which(*available: str):
    """Returns a `shutil.which` replacement that reports only the given
    executables as present on the `PATH`."""

    def which(executable: str) -> Optional[str]:
        if executable in available:
            return f'/usr/bin/{executable}'
        return None

    return which


class TestPickMode(unittest.TestCase):

    def setUp(self):
        # Run every test with `ENVVAR_LOCAL_ENVOY_MODE` unset; tests
        # that need it set it explicitly.
        patcher = mock.patch.dict('os.environ', clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop(ENVVAR_LOCAL_ENVOY_MODE, None)

    def _patch_which(self, *available: str):
        patcher = mock.patch(
            'reboot.server.local_envoy_factory.shutil.which',
            side_effect=_which(*available),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_prefers_executable_when_both_available(self):
        self._patch_which('envoy', 'docker')
        self.assertIs(LocalEnvoyFactory.pick_mode(), LocalEnvoyMode.EXECUTABLE)

    def test_picks_executable_when_only_envoy_available(self):
        self._patch_which('envoy')
        self.assertIs(LocalEnvoyFactory.pick_mode(), LocalEnvoyMode.EXECUTABLE)

    def test_falls_back_to_docker_when_no_envoy(self):
        self._patch_which('docker')
        self.assertIs(LocalEnvoyFactory.pick_mode(), LocalEnvoyMode.DOCKER)

    def test_fails_when_neither_available(self):
        self._patch_which()
        with self.assertRaises(ValueError) as raised:
            LocalEnvoyFactory.pick_mode()
        self.assertIn('neither was found', str(raised.exception))

    def test_respects_explicit_executable(self):
        os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'executable'
        self._patch_which('envoy', 'docker')
        self.assertIs(LocalEnvoyFactory.pick_mode(), LocalEnvoyMode.EXECUTABLE)

    def test_respects_explicit_docker(self):
        os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'docker'
        self._patch_which('envoy', 'docker')
        self.assertIs(LocalEnvoyFactory.pick_mode(), LocalEnvoyMode.DOCKER)

    def test_fails_when_explicit_executable_not_on_path(self):
        os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'executable'
        self._patch_which('docker')
        with self.assertRaises(ValueError) as raised:
            LocalEnvoyFactory.pick_mode()
        self.assertIn(
            "`envoy` was not found on your `PATH`", str(raised.exception)
        )

    def test_fails_when_explicit_docker_not_on_path(self):
        os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'docker'
        self._patch_which('envoy')
        with self.assertRaises(ValueError) as raised:
            LocalEnvoyFactory.pick_mode()
        self.assertIn(
            "`docker` was not found on your `PATH`", str(raised.exception)
        )

    def test_fails_on_invalid_mode(self):
        os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'banana'
        self._patch_which('envoy', 'docker')
        with self.assertRaises(ValueError) as raised:
            LocalEnvoyFactory.pick_mode()
        self.assertIn(
            f"Invalid value 'banana' for '{ENVVAR_LOCAL_ENVOY_MODE}'",
            str(raised.exception),
        )


if __name__ == '__main__':
    unittest.main()
