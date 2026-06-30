import os
import reboot.cli.common.terminal as terminal
import sys
from pathlib import Path
from reboot.cli.commands.cloud import (
    cloud_subcommands,
    handle_cloud_subcommand,
    register_cloud,
)
from reboot.cli.commands.dev import (
    dev_subcommands,
    handle_dev_subcommand,
    register_dev,
)
from reboot.cli.commands.export_import import (
    export_and_import_subcommands,
    handle_export_and_import_subcommand,
    register_export_and_import,
)
from reboot.cli.commands.generate import (
    generate_subcommands,
    handle_generate_subcommand,
    register_generate,
)
from reboot.cli.commands.init.init import (
    handle_init_subcommand,
    init_subcommands,
    register_init,
)
from reboot.cli.commands.inspect import (
    handle_inspect_subcommand,
    inspect_subcommands,
    register_inspect,
)
from reboot.cli.commands.serve import (
    handle_serve_subcommand,
    register_serve,
    serve_subcommands,
)
from reboot.cli.commands.task import (
    handle_task_subcommand,
    register_task,
    task_subcommands,
)
from reboot.cli.common.rc import ArgumentParser
from reboot.cli.common.subprocesses import Subprocesses
from reboot.cli.common.update_check import check_for_newer_version
from typing import Optional


def add_global_options(
    parser: ArgumentParser,
) -> None:
    parser.add_argument(
        '--state-directory',
        type=Path,
        help=(
            "parent directory for the `.rbt` directory, which stores application "
            "state; defaults to the directory containing an `.rbtrc` file."
        ),
    )


def create_parser(
    *,
    rc_file: Optional[str] = None,
    argv: Optional[list[str]] = None,
) -> ArgumentParser:

    parser = ArgumentParser(
        program='rbt',
        filename='.rbtrc',
        subcommands=(
            cloud_subcommands() + dev_subcommands() +
            export_and_import_subcommands() + generate_subcommands() +
            init_subcommands() + inspect_subcommands() + serve_subcommands() +
            task_subcommands()
        ),
        rc_file=rc_file,
        argv=argv,
    )

    add_global_options(parser)

    register_cloud(parser)
    register_dev(parser)
    register_export_and_import(parser)
    register_generate(parser)
    register_init(parser)
    register_inspect(parser)
    register_serve(parser)
    register_task(parser)

    return parser


async def cli() -> int:
    if os.getpid() == 1:
        terminal.fail(
            "The `rbt` CLI should not be used as the `ENTRYPOINT` of a "
            "Docker container, because it does not act as an init system. "
            "If you are using the Reboot base image "
            '("FROM ghcr.io/reboot-dev/reboot-base:X.Y.Z"), set the `rbt` '
            "command as the `CMD` of your `Dockerfile` instead. If you "
            "must override `ENTRYPOINT` (or are using a base image "
            "without an `ENTRYPOINT`), invoke `rbt` with something like "
            "`tini` (https://github.com/krallin/tini).\n"
        )

    # Sets up the terminal for logging.
    verbose, argv = ArgumentParser.strip_any_arg(sys.argv, '-v', '--verbose')
    terminal.init(verbose=verbose)

    # Best-effort notice (to stderr) when a newer Reboot release is
    # available; throttled and silent on any failure.
    check_for_newer_version()

    # Install signal handlers to help ensure that Subprocesses get cleaned up.
    Subprocesses.install_terminal_app_signal_handlers()

    parser = create_parser(argv=argv)

    args, argv_after_dash_dash = parser.parse_args()

    if (result := await handle_cloud_subcommand(args)) is not None:
        return result
    elif (
        result := await handle_dev_subcommand(
            args,
            parser=parser,
            parser_factory=lambda argv: create_parser(argv=argv),
        )
    ) is not None:
        return result
    elif (
        result := await handle_export_and_import_subcommand(args)
    ) is not None:
        return result
    elif (
        result := await handle_generate_subcommand(
            args,
            argv_after_dash_dash=argv_after_dash_dash,
            parser=parser,
        )
    ) is not None:
        return result
    elif (result := await handle_init_subcommand(args)) is not None:
        return result
    elif (result := await handle_inspect_subcommand(args)) is not None:
        return result
    elif (
        result := await handle_serve_subcommand(
            args,
            parser=parser,
            parser_factory=lambda argv: create_parser(argv=argv),
        )
    ) is not None:
        return result
    elif (result := await handle_task_subcommand(args)) is not None:
        return result

    raise NotImplementedError(
        f"Subcommand '{args.subcommand}' is not implemented"
    )
