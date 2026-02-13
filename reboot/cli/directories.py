import argparse
import os
import shutil
from contextlib import contextmanager
from pathlib import Path
from reboot.cli.rc import ArgumentParser, SubcommandParser
from reboot.cli.terminal import fail, info
from rebootdev.aio.directories import chdir
from typing import Optional


def add_working_directory_options(subcommand: SubcommandParser) -> None:
    # TODO: Move to a global option.
    subcommand.add_argument(
        '--working-directory',
        type=Path,
        help=(
            "directory in which to execute; defaults to the location of the "
            "`.rbtrc` file."
        ),
    )


def is_on_path(file):
    """Helper to check if a file is on the PATH."""
    return shutil.which(file) is not None


def get_absolute_path_from_path(file) -> Optional[str]:
    """Helper to get the absolute path of a file that is on PATH."""
    for directory in os.environ['PATH'].split(os.pathsep):
        path = os.path.join(directory, file)
        if os.path.exists(path):
            return path
    return None


def dot_rbt_directory(
    args: argparse.Namespace,
    parser: ArgumentParser,
) -> Path:
    state_directory: Path
    if args.state_directory is not None:
        state_directory = Path(args.state_directory)
    elif parser.dot_rc is not None:
        state_directory = Path(parser.dot_rc).parent
    else:
        fail(
            "Either a `.rbtrc` file must be configured, or the "
            "`--state-directory` option must be specified."
        )

    return (state_directory / ".rbt").absolute().resolve()


def dot_rbt_dev_directory(
    args: argparse.Namespace,
    parser: ArgumentParser,
) -> Path:
    """Helper for determining the '.rbt/dev' directory."""
    return dot_rbt_directory(args, parser) / 'dev'


def compute_working_directory(
    args: argparse.Namespace,
    parser: ArgumentParser,
) -> Path:
    working_directory: Path
    if args.working_directory is not None:
        working_directory = Path(args.working_directory)
    elif parser.dot_rc is not None:
        working_directory = Path(parser.dot_rc).parent
    else:
        fail(
            "Either a `.rbtrc` file must be configured, or the "
            "`--working-directory` option must be specified."
        )

    return working_directory.absolute().resolve()


@contextmanager
def use_working_directory(
    args: argparse.Namespace,
    parser: ArgumentParser,
    verbose: bool = False,
):
    """Context manager that changes into an explicitly specified
    --working-directory, or else the location of the `.rbtrc` file.

    `add_working_directory_options` must have been called to register
    the option which is used here.
    """
    working_directory = compute_working_directory(args, parser)

    if verbose:
        if parser.dot_rc is not None:
            info(
                f"Using {parser.dot_rc_filename} "
                f"(from {os.path.relpath(parser.dot_rc, os.getcwd())}) "
                f"and working directory {os.path.relpath(working_directory, os.getcwd())}"
            )
        else:
            info(
                f"Using working directory {os.path.relpath(working_directory, os.getcwd())}"
            )

    with chdir(working_directory):
        yield
