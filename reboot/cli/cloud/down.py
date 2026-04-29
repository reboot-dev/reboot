import argparse
import traceback
from rbt.cloud.v1alpha1.application.application_pb2 import Status
from rbt.cloud.v1alpha1.application.application_rbt import Application
from rbt.v1alpha1.errors_pb2 import PermissionDenied, StateNotConstructed
from reboot.aio.aborted import Aborted
from reboot.aio.external import ExternalContext
from reboot.cli import terminal
from reboot.cli.cloud.common import (
    _add_common_cloud_args,
    _parse_common_cloud_args,
)
from reboot.cli.rc import ArgumentParser


def register_cloud_down(parser: ArgumentParser) -> None:
    down_subcommand = parser.subcommand('cloud down')
    _add_common_cloud_args(down_subcommand)
    down_subcommand.add_argument(
        '--expunge',
        type=bool,
        required=True,
        help='if true, expunge all application state when bringing '
        'the application down',
    )


async def cloud_down(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud down' subcommand."""

    if not args.expunge:
        terminal.fail(
            "Currently all applications brought down are expunged. "
            "Support for bringing down without expunging will be "
            "added in a future release, please see: "
            "https://github.com/reboot-dev/reboot/issues/71"
        )

    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )

    context = ExternalContext(
        name="cloud-down",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )

    try:
        response = await Application.ref(
            qualified_application_name,
        ).Down(context)

        if response.status == Status.DOWNING:
            # TODO(rjh): once the CLoud waits to resolve
            #            `down_response.down_task_id` until the application has
            #            terminated, await the completion of
            #            `down_response.down_task_id` here, and tell the user
            #            when their application has in fact terminated.

            terminal.info(
                f"Application '{args.application_name}' is being terminated..."
            )
        elif response.status in (Status.DOWN, Status.EXPUNGED):
            terminal.info(
                f"Application '{args.application_name}' is already terminated."
            )
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed():  # type: ignore[misc]
                if organization_name is None:
                    terminal.fail(
                        f"User '{user_id}' does not have an application "
                        f"named '{args.application_name}'. If the application "
                        "belongs to an organization, try adding "
                        "--organization=<name>."
                    )
                else:
                    terminal.fail(
                        f"Organization '{organization_name}' does not have "
                        f"an application named '{args.application_name}'"
                    )
            case PermissionDenied():  # type: ignore[misc]
                # Invariant for applications before organizations were
                # added was that users _always_ had admin permissions
                # for their own applications so we should only get
                # `PermissionDenied` for applications launched after
                # organizations were introduced.
                assert organization_name is not None
                terminal.fail(
                    f"User '{user_id}' does not have permission to bring down "
                    f"applications in the organization '{organization_name}'"
                )
            case _:
                # There are no other expected errors for `Down()`.
                traceback.print_exc()
                terminal.fail("Please report this bug to the maintainers")
