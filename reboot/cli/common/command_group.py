"""The command groups of the `rbt` CLI, including those that other
installed packages register."""
import argparse
from importlib.metadata import entry_points
from reboot.cli.commands import cloud
from reboot.cli.common import terminal
from reboot.cli.common.rc import ArgumentParser
from reboot.version import REBOOT_VERSION
from typing import NewType, Optional, Protocol

# The entry point group a Python package registers under to add a
# command group to `rbt`. An entry point's name is the group's first
# word, e.g. `cloud`, and its value refers to an object, usually a
# module, that satisfies `CommandGroup`.
ENTRY_POINT_GROUP = 'rbt.commands'

# The first word of a command group's subcommands, e.g. `cloud`.
CommandGroupName = NewType('CommandGroupName', str)

# The name of a package on PyPI, e.g. `reboot-cloud`.
PackageName = NewType('PackageName', str)

# Command groups that separate packages provide, so that `rbt` can name
# the package to install when one of their commands runs without it.
OPTIONAL_COMMAND_GROUPS: dict[CommandGroupName, PackageName] = {}


class CommandGroup(Protocol):
    """A set of related `rbt` subcommands, e.g. `cloud up` and `cloud
    down`, that registers with the CLI through these three callables. A
    module whose top-level functions have these names satisfies the
    protocol."""

    def subcommands(self) -> list[str]:
        """Returns every (nested) subcommand the group registers, e.g.
        `['cloud up', 'cloud down']`."""

    def register(self, parser: ArgumentParser) -> None:
        """Adds the group's subcommands and their flags to `parser`."""

    async def handle(self, args: argparse.Namespace) -> Optional[int]:
        """Runs the subcommand in `args` and returns its exit code, or
        returns `None` when the subcommand belongs to another group."""


class MissingCommandGroup:
    """Stands in for an optional command group whose package is not
    installed. It registers the group's first word as a subcommand that
    accepts anything, so that `.rbtrc` lines for the group still parse,
    and fails with how to install the package when that subcommand
    runs."""

    def __init__(self, name: CommandGroupName, package: PackageName):
        self._name = name
        self._package = package

    def subcommands(self) -> list[str]:
        return [self._name]

    def register(self, parser: ArgumentParser) -> None:
        # The group's real flags are unknown here, so the subcommand
        # takes whatever follows it. Otherwise `rbt cloud up --api-key=K`
        # would fail on `--api-key` as an unrecognized flag before
        # `handle()` gets to say which package to install.
        parser.subcommand(self._name).add_argument(
            'arguments',
            type=str,
            remainder=True,
            help=f"the `rbt {self._name}` command and its flags",
        )

    async def handle(self, args: argparse.Namespace) -> Optional[int]:
        if args.subcommand != self._name:
            return None
        terminal.fail(
            f"`rbt {self._name}` is provided by the '{self._package}' "
            f"package; install it with `pip install "
            f"{self._package}=={REBOOT_VERSION}`"
        )


def load_command_groups() -> list[CommandGroup]:
    """Returns the command groups: those that ship with `rbt` followed by
    those that installed packages register under `ENTRY_POINT_GROUP`,
    ordered by entry point name, preceded by a `MissingCommandGroup` for
    each optional group none of them provides."""
    installed: list[CommandGroup] = [cloud]
    for entry_point in sorted(
        entry_points(group=ENTRY_POINT_GROUP),
        key=lambda entry_point: entry_point.name,
    ):
        try:
            installed.append(entry_point.load())
        except Exception as e:
            terminal.fail(
                f"Failed to load the `rbt {entry_point.name}` commands from "
                f"'{entry_point.value}': {e}"
            )

    provided = {
        subcommand.split()[0]
        for command_group in installed
        for subcommand in command_group.subcommands()
    }
    missing: list[CommandGroup] = [
        MissingCommandGroup(name, package)
        for name, package in OPTIONAL_COMMAND_GROUPS.items()
        if name not in provided
    ]
    return missing + installed
