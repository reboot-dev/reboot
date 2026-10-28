import argparse
import reboot.cli.common.cli as cli
import reboot.cli.common.command_group as command_group
import tempfile
import unittest
from contextlib import contextmanager
from reboot.cli.common.rc import ArgumentParser
from typing import Iterator, Optional
from unittest.mock import patch


class HelloCommandGroup:
    """A command group, as an installed package would provide one, that
    registers `hello world` and exits with `EXIT_CODE` when run."""

    EXIT_CODE = 42

    def subcommands(self) -> list[str]:
        return ['hello world']

    def register(self, parser: ArgumentParser) -> None:
        parser.subcommand('hello world').add_argument(
            '--name',
            type=str,
            required=True,
            help='who to greet',
        )

    async def handle(self, args: argparse.Namespace) -> Optional[int]:
        if args.subcommand == 'hello world':
            return self.EXIT_CODE
        return None


class FakeEntryPoint:
    """An `importlib.metadata.EntryPoint` stand-in whose `load()` returns
    `command_group`, or raises it when it is an exception."""

    def __init__(self, name: str, command_group: object):
        self.name = name
        self.value = f'{name}_commands'
        self._command_group = command_group

    def load(self) -> object:
        if isinstance(self._command_group, BaseException):
            raise self._command_group
        return self._command_group


@contextmanager
def optional_command_groups(**packages: str) -> Iterator[None]:
    """Pretends that the given command groups, keyed by their first
    word, are the ones that separate packages provide."""
    with patch.dict(
        'reboot.cli.common.command_group.OPTIONAL_COMMAND_GROUPS',
        packages,
        clear=True,
    ):
        yield


@contextmanager
def installed_command_groups(**command_groups: object) -> Iterator[None]:
    """Pretends that, for each keyword argument, a package is installed
    whose `rbt.commands` entry point of that name loads the given command
    group, or fails with it when it is an exception."""
    entry_points = [
        FakeEntryPoint(name, command_group)
        for name, command_group in command_groups.items()
    ]
    with patch(
        'reboot.cli.common.command_group.entry_points',
        return_value=entry_points,
    ):
        yield


class CommandGroupTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_cloud_is_built_in(self) -> None:
        with installed_command_groups():
            command_groups = command_group.load_command_groups()

        self.assertIn(
            'cloud up',
            [
                subcommand for command_group in command_groups
                for subcommand in command_group.subcommands()
            ],
        )

    async def test_missing_optional_command_group_names_its_package(
        self
    ) -> None:
        with optional_command_groups(hello='reboot-hello'):
            with installed_command_groups():
                command_groups = command_group.load_command_groups()

        parser = cli.create_parser(
            argv=['rbt', 'hello', 'world', '--name=rbt'],
            command_groups=command_groups,
        )
        args, _ = parser.parse_args()

        self.assertEqual(args.subcommand, 'hello')
        [hello] = [
            group for group in command_groups
            if group.subcommands() == ['hello']
        ]
        with patch(
            'reboot.cli.common.command_group.terminal.fail',
            side_effect=SystemExit(1),
        ) as fail:
            with self.assertRaises(SystemExit):
                await hello.handle(args)

        self.assertIn('pip install reboot-hello==', fail.call_args[0][0])

    async def test_missing_optional_command_group_parses_dot_rc(self) -> None:
        # A `.rbtrc` written for the package must not stop `rbt` from
        # parsing when the package is missing.
        with optional_command_groups(hello='reboot-hello'):
            with installed_command_groups():
                command_groups = command_group.load_command_groups()

        with tempfile.NamedTemporaryFile(mode='w') as rc_file:
            rc_file.write('hello world --name=rbt\n')
            rc_file.flush()

            parser = cli.create_parser(
                rc_file=rc_file.name,
                argv=['rbt', 'hello'],
                command_groups=command_groups,
            )
            args, _ = parser.parse_args()

        self.assertEqual(args.arguments, ['world', '--name=rbt'])

    async def test_installed_optional_command_group_has_no_stand_in(
        self
    ) -> None:
        hello = HelloCommandGroup()
        with optional_command_groups(hello='reboot-hello'):
            with installed_command_groups(hello=hello):
                command_groups = command_group.load_command_groups()

        self.assertIn(hello, command_groups)
        self.assertEqual(
            [
                group for group in command_groups
                if isinstance(group, command_group.MissingCommandGroup)
            ],
            [],
        )

    async def test_installed_command_group_is_parsed_and_handled(self) -> None:
        hello = HelloCommandGroup()
        with installed_command_groups(hello=hello):
            command_groups = command_group.load_command_groups()

        self.assertIs(command_groups[-1], hello)

        parser = cli.create_parser(
            argv=['rbt', 'hello', 'world', '--name=rbt'],
            command_groups=command_groups,
        )
        args, _ = parser.parse_args()

        self.assertEqual(args.subcommand, 'hello world')
        self.assertEqual(args.name, 'rbt')
        self.assertEqual(await hello.handle(args), HelloCommandGroup.EXIT_CODE)

    async def test_installed_command_groups_are_ordered_by_name(self) -> None:
        first = HelloCommandGroup()
        second = HelloCommandGroup()
        with installed_command_groups(b=second, a=first):
            command_groups = command_group.load_command_groups()

        self.assertEqual(command_groups[-2:], [first, second])

    async def test_installed_subcommand_expands_dot_rc(self) -> None:
        # Flags in `.rbtrc` are only expanded for subcommands the parser
        # knows, so an installed subcommand's flags must be too.
        with installed_command_groups(hello=HelloCommandGroup()):
            command_groups = command_group.load_command_groups()

        with tempfile.NamedTemporaryFile(mode='w') as rc_file:
            rc_file.write('hello world --name=from-rc\n')
            rc_file.flush()

            parser = cli.create_parser(
                rc_file=rc_file.name,
                argv=['rbt', 'hello', 'world'],
                command_groups=command_groups,
            )
            args, _ = parser.parse_args()

        self.assertEqual(args.name, 'from-rc')

    async def test_command_group_that_fails_to_load_fails_the_cli(
        self
    ) -> None:
        with installed_command_groups(broken=ImportError('boom')):
            with self.assertRaises(SystemExit) as e:
                command_group.load_command_groups()

        self.assertEqual(e.exception.code, 1)


if __name__ == '__main__':
    unittest.main()
