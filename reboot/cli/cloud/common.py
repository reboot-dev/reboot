import argparse
import traceback
from rbt.cloud.v1alpha1.auth.auth_rbt import APIKey
from rbt.cloud.v1alpha1.organizations.organizations_rbt import Organizations
from rbt.v1alpha1.errors_pb2 import (
    PermissionDenied,
    StateNotConstructed,
    Unauthenticated,
)
from reboot.aio.aborted import Aborted
from reboot.aio.external import ExternalContext
from reboot.aio.types import ApplicationId
from reboot.api_keys import (
    InvalidAPIKeyBearerToken,
    parse_api_key_bearer_token,
)
from reboot.cli import terminal
from reboot.cli.rc import SubcommandParser
from reboot.naming import (
    ORGANIZATIONS_ID,
    OrganizationId,
    OrganizationName,
    QualifiedApplicationName,
    UserId,
    make_qualified_application_name_from_owner_id_and_application_name,
)
from typing import Optional

DEFAULT_REBOOT_CLOUD_URL = "https://cloud.prod1.rbt.cloud:9991"

_API_KEY_FLAG = '--api-key'


def _add_common_cloud_args(subcommand: SubcommandParser) -> None:
    """Adds flags common to every `rbt cloud` subcommand."""
    # TODO: Consider moving these to flags on the `cloud` subcommand using #3845

    subcommand.add_argument(
        '--cloud-url',
        type=str,
        help="the URL of the Reboot cloud API",
        default=DEFAULT_REBOOT_CLOUD_URL,
        non_empty_string=True,
    )
    # TODO: This should probably be read from a file by default.
    subcommand.add_argument(
        _API_KEY_FLAG,
        type=str,
        help="the API key to use to connect to the Reboot Cloud API",
        default=None,
        required=True,
        non_empty_string=True,
    )
    subcommand.add_argument(
        '--organization',
        type=str,
        help="the organization to use for the application",
        default=None,
        non_empty_string=True,
    )

    subcommand.add_argument(
        '--application-name',
        type=str,
        required=True,
        help="name of the application",
        non_empty_string=True,
    )
    subcommand.add_renamed_flag('--name', '--application-name')


def _application_url(application_id: ApplicationId, cloud_url: str) -> str:
    """
    Given a cloud URL (e.g. `https://cloud.prod1.rbt.cloud:9991`), returns the
    url for the given application (e.g. `https://a12345.prod1.rbt.cloud:9991`).
    """
    if not (
        cloud_url.startswith("https://") or cloud_url.startswith("http://")
    ):
        terminal.fail(
            f"Cloud URL '{cloud_url}' must have 'https://' or 'http://'."
        )
    protocol, hostname_port = cloud_url.split("://", maxsplit=1)
    if not hostname_port.startswith("cloud."):
        terminal.fail(
            f"Cloud host '{hostname_port}' is missing expected 'cloud.' prefix"
        )
    cell_hostname_port = hostname_port.removeprefix("cloud.")
    return f"{protocol}://{application_id}.{cell_hostname_port}"


async def _user_id_from_api_key(api_key: str, cloud_url: str) -> str:
    try:
        api_key_id, api_key_secret = parse_api_key_bearer_token(token=api_key)
    except InvalidAPIKeyBearerToken:
        # Note that we do not log the API key contents; they are a secret, which
        # we don't want to output to a log file (if any).
        terminal.fail(
            "Invalid API key shape (expected: "
            "'XXXXXXXXXX-XXXXXXXXXXXXXXXXXXXX')"
        )

    context = ExternalContext(
        name="user-id-from-api-key",
        url=cloud_url,
        # TODO(rjh): once APIKey reads the bearer token for `Authenticate`, use
        #            that instead of passing `secret` in the proto below.
    )

    try:
        return (
            await APIKey.ref(api_key_id).Authenticate(
                context,
                secret=api_key_secret,
            )
        ).user_id
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed(  # type: ignore[misc]
            ) | PermissionDenied(  # type: ignore[misc]
            ) | Unauthenticated():  # type: ignore[misc]
                # Note that we do not log the API key contents; they
                # are a secret, which we don't want to output to a log
                # file (if any).
                terminal.fail("Invalid API key")
            case _:
                terminal.fail(f"Unexpected error: {aborted}")


async def _get_organization_id(
    *,
    user_id: UserId,
    organization_name: OrganizationName,
    cloud_url: str,
    api_key: str,
) -> Optional[OrganizationId]:
    # Validate the organization name is nonempty.
    if organization_name.strip() == "":
        terminal.fail("Invalid organization, got empty string")

    context = ExternalContext(
        name="get-organization-id",
        url=cloud_url,
        bearer_token=api_key,
    )

    organizations = Organizations.ref(ORGANIZATIONS_ID)
    try:
        response = await organizations.resolve(
            context,
            organization_name=organization_name,
        )
    except Aborted as aborted:
        match aborted.error:
            case _:
                # Not expecting any errors; invariant here is that
                # we've already authenticated the API key because we
                # have a user ID (which we can only get from
                # authenticating the API key).
                traceback.print_exc()
                terminal.fail("Please report this bug to the maintainers")
    else:
        if response.HasField("organization_id"):
            return response.organization_id
        return None


async def _parse_common_cloud_args(
    args: argparse.Namespace
) -> tuple[UserId, QualifiedApplicationName, Optional[OrganizationName]]:
    user_id = await _user_id_from_api_key(
        api_key=args.api_key,
        cloud_url=args.cloud_url,
    )

    # If --organization was specified (which is not required for
    # backwards compatibility) then get its ID. This also validates
    # that the organization exists which provides a better experience
    # for our users that might have just misspelled it.
    organization_name: Optional[OrganizationName] = args.organization
    organization_id: Optional[OrganizationId] = None
    if organization_name is not None:
        organization_id = await _get_organization_id(
            user_id=user_id,
            organization_name=organization_name,
            cloud_url=args.cloud_url,
            api_key=args.api_key,
        )
        if organization_id is None:
            terminal.fail(f"Organization '{organization_name}' does not exist")

    qualified_application_name = (
        make_qualified_application_name_from_owner_id_and_application_name(
            owner_id=organization_id or user_id,
            application_name=args.application_name,
        )
    )

    return user_id, qualified_application_name, organization_name
