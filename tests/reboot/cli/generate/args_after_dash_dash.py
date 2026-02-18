import reboot.cli.cli as cli
import unittest
from reboot.cli.rc import ArgumentParser
from tests.reboot.cli.generate.tests_helper import RbtGenerateBaseTestCase


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_args_after_dash_dash(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'generate',
                '--working-directory=.',
                'some.py',
                '--',
                '--after-dash-dash-1',
                '-after-dash-dash-2',
                'after-dash-dash-3',
                'after-dash-dash-4=after-dash-dash-4-value',
            ]
        )

        self.assertListEqual(
            parser.parse_args()[1],
            [
                '--after-dash-dash-1',
                '-after-dash-dash-2',
                'after-dash-dash-3',
                'after-dash-dash-4=after-dash-dash-4-value',
            ],
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
