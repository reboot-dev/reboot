import argparse
import os
import traceback
from rbt.cloud.v1alpha1.application.application_pb2 import InvalidInputError
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


def register_cloud_secret(parser: ArgumentParser) -> None:
    secret_set = parser.subcommand('cloud secret set')
    _add_common_cloud_args(secret_set)
    secret_set.add_argument(
        'key_values',
        type=str,
        repeatable=True,
        required=True,
        help=(
            "KEY=VALUE pairs, or just KEY to read the value from your "
            "environment; keys must be uppercase environment variable "
            "names (letters, digits, underscores; not starting with a "
            "digit). 'REBOOT_*' and 'RBT_*' are reserved by the Reboot "
            "platform"
        ),
    )

    secret_list = parser.subcommand('cloud secret list')
    _add_common_cloud_args(secret_list)

    secret_delete = parser.subcommand('cloud secret delete')
    _add_common_cloud_args(secret_delete)
    secret_delete.add_argument(
        'names',
        type=str,
        repeatable=True,
        required=True,
        help="names of the secrets to delete",
    )


async def cloud_secret_set(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud secret set' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    secrets = {}
    for key_value in args.key_values:
        if '=' not in key_value:
            # No value on the command line; read from the environment so
            # that secret values don't appear in shell history or
            # process listings.
            key = key_value
            value = os.environ.get(key)
            if value is None:
                terminal.fail(
                    f"'{key}' environment variable not found: please set "
                    f"this environment variable or pass '{key}=[VALUE] if you "
                    "are okay with the secret value appearing in your shell "
                    "history and process listings"
                )
        else:
            key, value = key_value.split('=', 1)
        secrets[key] = value

    context = ExternalContext(
        name="cloud-secret-set",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        await application.set_secrets(context, secrets=secrets)
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed():
                if organization_name is None:
                    terminal.fail(
                        f"User '{user_id}' does not have an application named "
                        f"'{args.application_name}'. If the application "
                        "belongs to an organization, try adding "
                        "--organization=<name>."
                    )
                else:
                    terminal.fail(
                        f"Organization '{organization_name}' does not have an "
                        f"application named '{args.application_name}'"
                    )
            case PermissionDenied():
                # Before organizations were added, users always
                # had admin permissions for their own apps, so
                # `PermissionDenied` only occurs for org apps.
                assert organization_name is not None
                terminal.fail(
                    f"User '{user_id}' does not have permission to set secrets "
                    "for applications in the organization "
                    f"'{organization_name}', only owners and editors are "
                    "allowed to do so"
                )
            case InvalidInputError():
                terminal.fail(aborted.error.reason)
            case _:
                traceback.print_exc()
                terminal.fail("Please report this bug to the maintainers")


async def cloud_secret_list(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud secret list' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-secret-list",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        response = await application.list_secrets(context)
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed():
                if organization_name is None:
                    terminal.fail(
                        f"User '{user_id}' does not have an application named "
                        f"'{args.application_name}'. If the application "
                        "belongs to an organization, try adding "
                        "'--organization=<name>'."
                    )
                else:
                    terminal.fail(
                        f"Organization '{organization_name}' does not have an "
                        f"application named '{args.application_name}'"
                    )
            case PermissionDenied():
                # Before organizations were added, users always had
                # admin permissions for their own apps, so
                # `PermissionDenied` only occurs for org apps.
                assert organization_name is not None
                terminal.fail(
                    f"User '{user_id}' does not have permission to list "
                    f"secrets for application '{args.application_name}' in the "
                    f"organization '{organization_name}'; are you a member of "
                    "the organization?"
                )
            case _:
                traceback.print_exc()
                terminal.fail("Please report this bug to the maintainers")
    for name in response.names:
        print(name)


async def cloud_secret_delete(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud secret delete' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-secret-delete",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        await application.delete_secrets(context, names=args.names)
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed():
                if organization_name is None:
                    terminal.fail(
                        f"User '{user_id}' does not have an application named "
                        f"'{args.application_name}'. If the application "
                        "belongs to an organization, try adding "
                        "'--organization=<name>'."
                    )
                else:
                    terminal.fail(
                        f"Organization '{organization_name}' does not have an "
                        f"application named '{args.application_name}'"
                    )
            case PermissionDenied():
                # Before organizations were added, users always had
                # admin permissions for their own apps, so
                # `PermissionDenied` only occurs for org apps.
                assert organization_name is not None
                terminal.fail(
                    f"User '{user_id}' does not have permission to delete "
                    "secrets for applications in the organization "
                    f"'{organization_name}', only owners and editors are "
                    "allowed"
                )
            case InvalidInputError():
                terminal.fail(aborted.error.reason)
            case _:
                traceback.print_exc()
                terminal.fail("Please report this bug to the maintainers")
