import argparse
import traceback
from rbt.cloud.v1alpha1.application.application_pb2 import (
    CustomDomainInfo,
    InvalidInputError,
)
from rbt.cloud.v1alpha1.application.application_rbt import Application
from rbt.cloud.v1alpha1.custom_domain.custom_domain_pb2 import CustomDomain
from rbt.v1alpha1.errors_pb2 import PermissionDenied, StateNotConstructed
from reboot.aio.aborted import Aborted
from reboot.aio.external import ExternalContext
from reboot.cli.commands.cloud.common import (
    _add_common_cloud_args,
    _parse_common_cloud_args,
)
from reboot.cli.common import terminal
from reboot.cli.common.rc import ArgumentParser
from typing import NoReturn, Optional

# How each status is shown to the user.
_STATUS_NAMES = {
    CustomDomain.Status.WAITING_FOR_DNS: "WAITING_FOR_DNS",
    CustomDomain.Status.ISSUING_CERTIFICATE: "ISSUING_CERTIFICATE",
    CustomDomain.Status.ACTIVE: "ACTIVE",
    CustomDomain.Status.FAILED: "FAILED",
    CustomDomain.Status.REMOVED: "REMOVED",
}


def register_cloud_domain(parser: ArgumentParser) -> None:
    domain_add = parser.subcommand('cloud domain add')
    _add_common_cloud_args(domain_add)
    domain_add.add_argument(
        'hostname',
        type=str,
        help=(
            "the hostname to serve the application on, e.g. "
            "'api.example.com'; must be a subdomain you control"
        ),
    )

    domain_list = parser.subcommand('cloud domain list')
    _add_common_cloud_args(domain_list)

    domain_status = parser.subcommand('cloud domain status')
    _add_common_cloud_args(domain_status)
    domain_status.add_argument(
        'hostname',
        type=str,
        help="the hostname to show the status of",
    )

    domain_remove = parser.subcommand('cloud domain remove')
    _add_common_cloud_args(domain_remove)
    domain_remove.add_argument(
        'hostname',
        type=str,
        help="the hostname to stop serving the application on",
    )


def _fail_for_aborted(
    aborted: Aborted,
    *,
    user_id: Optional[str],
    application_name: str,
    organization_name: Optional[str],
    action: str,
) -> NoReturn:
    match aborted.error:
        case StateNotConstructed():
            if organization_name is None:
                terminal.fail(
                    f"User '{user_id}' does not have an application named "
                    f"'{application_name}'. If the application belongs to "
                    "an organization, try adding '--organization=<name>'."
                )
            else:
                terminal.fail(
                    f"Organization '{organization_name}' does not have an "
                    f"application named '{application_name}'"
                )
        case PermissionDenied():
            # Before organizations were added, users always had admin
            # permissions for their own apps, so `PermissionDenied`
            # only occurs for org apps.
            assert organization_name is not None
            terminal.fail(
                f"User '{user_id}' does not have permission to {action} "
                f"for application '{application_name}' in the organization "
                f"'{organization_name}'"
            )
        case InvalidInputError():
            terminal.fail(aborted.error.reason)
        case _:
            traceback.print_exc()
            terminal.fail("Please report this bug to the maintainers")


def _status_name(status: CustomDomain.Status.ValueType) -> str:
    return _STATUS_NAMES.get(status, "UNKNOWN")


def _print_domain(domain: CustomDomainInfo) -> None:
    print(f"{domain.hostname}  {_status_name(domain.status)}")
    if domain.status == CustomDomain.Status.ACTIVE:
        print(f"  URL:          https://{domain.hostname}")
    print(f"  CNAME target: {domain.cname_target}")
    if domain.dns_observation:
        print(f"  DNS:          {domain.dns_observation}")
    if domain.failure_reason:
        print(f"  Failure:      {domain.failure_reason}")


async def cloud_domain_add(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud domain add' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-domain-add",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        response = await application.add_custom_domain(
            context, hostname=args.hostname
        )
    except Aborted as aborted:
        _fail_for_aborted(
            aborted,
            user_id=user_id,
            application_name=args.application_name,
            organization_name=organization_name,
            action="add a custom domain",
        )

    terminal.info(
        f"Registered '{response.hostname}' for "
        f"'{args.application_name}'.\n"
        "\n"
        "Create this record at your DNS provider (proxying off, if it "
        "offers it):\n"
        "\n"
        f"  {response.hostname}  CNAME  {response.cname_target}\n"
        "\n"
        "Reboot Cloud checks for the record, obtains a certificate and "
        "activates the hostname; follow along with:\n"
        "\n"
        f"  rbt cloud domain status {response.hostname} "
        f"--application-name={args.application_name}\n"
    )


async def cloud_domain_list(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud domain list' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-domain-list",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        response = await application.list_custom_domains(context)
    except Aborted as aborted:
        _fail_for_aborted(
            aborted,
            user_id=user_id,
            application_name=args.application_name,
            organization_name=organization_name,
            action="list custom domains",
        )

    for domain in response.domains:
        _print_domain(domain)


async def cloud_domain_status(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud domain status' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-domain-status",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        response = await application.list_custom_domains(context)
    except Aborted as aborted:
        _fail_for_aborted(
            aborted,
            user_id=user_id,
            application_name=args.application_name,
            organization_name=organization_name,
            action="show custom domains",
        )

    for domain in response.domains:
        if domain.hostname == args.hostname:
            _print_domain(domain)
            return

    terminal.fail(
        f"'{args.hostname}' is not a custom domain of "
        f"'{args.application_name}'"
    )


async def cloud_domain_remove(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud domain remove' subcommand."""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )
    context = ExternalContext(
        name="cloud-domain-remove",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )
    application = Application.ref(qualified_application_name)
    try:
        await application.remove_custom_domain(context, hostname=args.hostname)
    except Aborted as aborted:
        _fail_for_aborted(
            aborted,
            user_id=user_id,
            application_name=args.application_name,
            organization_name=organization_name,
            action="remove a custom domain",
        )

    terminal.info(
        f"Removed '{args.hostname}' from '{args.application_name}'. You "
        "can delete its CNAME record at your DNS provider."
    )
