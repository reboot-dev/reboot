import os
import reboot.cli.terminal as terminal
import sys
from pathlib import Path
from reboot.cli.cloud import cloud_down, cloud_logs, cloud_up, register_cloud
from reboot.cli.dev import dev_expunge, dev_run, register_dev
from reboot.cli.export_import import (
    do_export,
    do_import,
    register_export_and_import,
)
from reboot.cli.generate import generate, register_generate
from reboot.cli.init.init import init_run, register_init
from reboot.cli.rc import ArgumentParser
from reboot.cli.secret import register_secret, secret_delete, secret_write
from reboot.cli.serve import register_serve, serve_run
from reboot.cli.subprocesses import Subprocesses
from reboot.cli.task import register_task, task_cancel, task_list
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
        subcommands=[
            'cloud down',
            'cloud up',
            'cloud secret delete',
            'cloud secret write',
            'cloud logs',
            'dev expunge',
            'dev run',
            'export',
            'import',
            'init',
            'generate',
            'serve run',
            'task list',
            'task cancel',
        ],
        rc_file=rc_file,
        argv=argv,
    )

    add_global_options(parser)

    register_dev(parser)
    register_export_and_import(parser)
    register_generate(parser)
    register_secret(parser)
    register_cloud(parser)
    register_init(parser)
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

    # Install signal handlers to help ensure that Subprocesses get cleaned up.
    Subprocesses.install_terminal_app_signal_handlers()

    parser = create_parser(argv=argv)

    args, argv_after_dash_dash = parser.parse_args()

    if args.subcommand == 'dev run':
        return await dev_run(
            args,
            parser=parser,
            parser_factory=lambda argv: create_parser(argv=argv),
        )
    elif args.subcommand == 'dev expunge':
        await dev_expunge(args, parser)
        return 0
    elif args.subcommand == 'export':
        return await do_export(args)
    elif args.subcommand == 'import':
        return await do_import(args)
    elif args.subcommand == 'generate':
        return await generate(args, argv_after_dash_dash, parser=parser)
    elif args.subcommand == 'secret write':
        await secret_write(args)
        return 0
    elif args.subcommand == 'secret delete':
        await secret_delete(args)
        return 0
    elif args.subcommand == 'cloud up':
        return await cloud_up(args)
    elif args.subcommand == 'cloud down':
        await cloud_down(args)
        return 0
    elif args.subcommand == 'cloud logs':
        await cloud_logs(args)
        return 0
    elif args.subcommand == 'init':
        await init_run(args)
        return 0
    elif args.subcommand == 'serve run':
        return await serve_run(
            args,
            parser=parser,
            parser_factory=lambda argv: create_parser(argv=argv),
        )
    elif args.subcommand == 'task list':
        await task_list(args)
        return 0
    elif args.subcommand == 'task cancel':
        await task_cancel(args)
        return 0

    raise NotImplementedError(
        f"Subcommand '{args.subcommand}' is not implemented"
    )
