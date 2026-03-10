import reboot.cli.cli as cli
import unittest
from reboot.cli.rc import ArgumentParser
from tests.reboot.cli.generate.tests_helper import RbtGenerateBaseTestCase
from tests.reboot.cli.mock_exit import MockExitException


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_requires_input(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'generate',
                '--working-directory=.',
                '--python=.',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            e.exception.message,
            "rbt generate: error: the following arguments are required: "
            "proto_directories\n"
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
