"""Command groups that extend the `rbt` CLI from other distributions."""
import argparse
from importlib.metadata import entry_points
from reboot.cli.common import terminal
from reboot.cli.common.rc import ArgumentParser
from typing import Optional, Protocol

# The entry point group a Python distribution registers under to add a
# command group to `rbt`. An entry point's name is the group's first
# word, e.g. `cloud`, and its value refers to an object, usually a
# module, that satisfies `CommandGroup`.
ENTRY_POINT_GROUP = 'rbt.commands'


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


def discover_command_groups() -> list[CommandGroup]:
    """Returns the command groups that installed distributions register
    under `ENTRY_POINT_GROUP`, ordered by entry point name."""
    command_groups: list[CommandGroup] = []
    for entry_point in sorted(
        entry_points(group=ENTRY_POINT_GROUP),
        key=lambda entry_point: entry_point.name,
    ):
        try:
            command_groups.append(entry_point.load())
        except Exception as e:
            terminal.fail(
                f"Failed to load the `rbt {entry_point.name}` commands from "
                f"'{entry_point.value}': {e}"
            )
    return command_groups
