import reboot.cli.rc as rc
import unittest


class NestedSubcommandsTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_nested_subcommands_with_args(self) -> None:

        parser = rc.ArgumentParser(
            program='rbt',
            filename='.rbtrc',
            subcommands=['cloud up'],
            argv=[
                'rbt', 'cloud', '--this-is-fine', 'up', '--this-is-great=yes'
            ],
        )

        parser.subcommand('cloud').add_argument(
            '--this-is-fine',
            type=bool,
            help='this should work',
        )

        parser.subcommand('cloud up').add_argument(
            '--this-is-great',
            type=str,
            repeatable=True,
            help='this should work',
        )

        args, args_after_dash_dash = parser.parse_args()
        self.assertDictEqual(
            vars(args),
            dict(
                subcommand='cloud up',
                config=None,
                default_config=None,
                this_is_fine=True,
                this_is_great=['yes'],
            )
        )
        self.assertListEqual(args_after_dash_dash, [])


if __name__ == '__main__':
    unittest.main()
