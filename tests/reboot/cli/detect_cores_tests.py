import unittest
from reboot.cli.detect_cores import cgroups_enabled, detect_cores
from reboot.cli.serve import servers_from_cores
from reboot.controller.plan_makers import validate_num_servers
from unittest.mock import patch


# Mock fail, because the original fail will exit the program.
def mock_raise_instead_fail(message):
    raise ValueError(message)


@patch('reboot.cli.terminal.fail', mock_raise_instead_fail)
class DetectCoresTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_basic(self) -> None:
        # This is really just a coverage test: if we had a better method to
        # validate the returned value, then we'd use that method to compute it!

        self.assertEqual(bool, type(cgroups_enabled()))

        with patch(
            'reboot.cli.detect_cores.cgroups_enabled',
            lambda: False,
        ):
            # Call `detect_cores()` via `servers_from_cores` so that a
            # non-power-of-two result doesn't crash `validate_num_server`.
            validate_num_servers(servers_from_cores(), 'servers')

        with patch(
            'reboot.cli.detect_cores.cgroups_enabled',
            lambda: True,
        ):
            with self.assertRaises(ValueError) as exc:
                detect_cores(flag_name='--servers')
            self.assertIn(
                "This process is running in a cgroup, which makes it difficult to",
                str(exc.exception),
            )


if __name__ == '__main__':
    unittest.main()
