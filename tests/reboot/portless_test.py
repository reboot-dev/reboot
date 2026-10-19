import os
import unittest
from reboot import portless
from reboot.settings import ENVVAR_RBT_PORTLESS_NAME
from unittest.mock import patch


class PortTest(unittest.TestCase):
    """Under portless the application serves on the port `portless run`
    picked, told in `PORT`."""

    def test_the_port_is_portless_s(self) -> None:
        environment = {ENVVAR_RBT_PORTLESS_NAME: 'bank', 'PORT': '4321'}
        with patch.dict(os.environ, environment):
            self.assertTrue(portless.enabled())
            self.assertEqual(portless.port(), 4321)

    def test_says_when_not_run_by_portless(self) -> None:
        with patch.dict(os.environ, {ENVVAR_RBT_PORTLESS_NAME: 'bank'}):
            os.environ.pop('PORT', None)
            with self.assertRaises(RuntimeError) as raised:
                portless.port()
        self.assertIn('portless run', str(raised.exception))


if __name__ == '__main__':
    unittest.main()
