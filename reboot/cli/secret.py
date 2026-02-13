from pathlib import Path
from reboot.cli import terminal
from reboot.cli.cloud import add_cloud_options
from reboot.cli.rc import ArgumentParser


def register_secret(parser: ArgumentParser):

    def add_common_args(subcommand):
        add_cloud_options(subcommand, api_key_required=True)
        subcommand.add_argument(
            '--secret-name',
            type=str,
            required=True,
            help="name of the secret",
        )

    secret_write = parser.subcommand('cloud secret write')
    add_common_args(secret_write)
    # TODO: These two options should be a mutually exclusive group, but that
    # facility is not exposed by `rc.py`.
    secret_write.add_argument(
        '--secret-value',
        type=str,
        help=
        "the secret value to store; the value will be UTF8 encoded for storage",
    )
    secret_write.add_argument(
        '--secret-value-file',
        type=Path,
        help="a file containing a secret value to store",
    )

    add_common_args(parser.subcommand('cloud secret delete'))


async def secret_write(args) -> None:
    """Implementation of the 'cloud secret write' subcommand."""
    terminal.fail(
        "Secrets are not supported on Reboot Cloud yet. Please reach out and "
        "let us know about your use-case and we'll prioritize this feature!"
    )


async def secret_delete(args) -> None:
    """Implementation of the 'cloud secret delete' subcommand."""
    terminal.fail(
        "Secrets are not supported on Reboot Cloud yet. Please reach out and "
        "let us know about your use-case and we'll prioritize this feature!"
    )
