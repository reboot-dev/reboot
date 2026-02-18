import reboot.cli.cli as cli
import unittest
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from unittest.mock import patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class RbtTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_fail_on_no_subcommand_specified(self) -> None:
        with self.assertRaises(MockExitException) as e:
            cli.create_parser(argv=['rbt'])

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            e.exception.message,
            "rbt: error: the following arguments are required: "
            "subcommand\n"
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
