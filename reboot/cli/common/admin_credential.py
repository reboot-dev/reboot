import argparse
import os
from reboot.cli.common import terminal
from reboot.cli.common.rc import SubcommandParser
from reboot.settings import (
    ENVVAR_REBOOT_ADMIN_CREDENTIAL,
    ENVVAR_REBOOT_CLOUD_API_KEY,
)
from urllib.parse import urlparse

# Reboot Cloud applications are served on this host (or a subdomain of
# it), and accept a Reboot Cloud API key as an admin credential.
_CLOUD_HOST = 'rbt.cloud'


def add_admin_credential_args(subcommand: SubcommandParser) -> None:
    """Add the admin-credential flags shared by the admin CLI commands
    (`rbt inspect`, `rbt export`, `rbt import`): `--admin-credential`
    and, as an alternative for Reboot Cloud apps, `--api-key`."""
    subcommand.add_argument(
        '--admin-credential',
        type=str,
        help=(
            "the admin secret to use for authentication; defaults to the "
            "appropriate value for `dev`, but must be set explicitly in "
            "production. Can also be set via the "
            f"`{ENVVAR_REBOOT_ADMIN_CREDENTIAL}` environment variable"
        ),
        default=None,
    )
    subcommand.add_argument(
        '--api-key',
        type=str,
        help=(
            "a Reboot Cloud API key to authenticate with; accepted only "
            "when `--application-url` is a `*.rbt.cloud` host, and mutually "
            "exclusive with `--admin-credential`. Can also be set via the "
            f"`{ENVVAR_REBOOT_CLOUD_API_KEY}` environment variable"
        ),
        default=None,
    )


def resolve_admin_credential(args: argparse.Namespace) -> str:
    """Resolve the bearer credential to send with admin RPCs.

    Considers, in priority order: an explicit `--api-key` /
    `--admin-credential` flag, then the `REBOOT_CLOUD_API_KEY` /
    `REBOOT_ADMIN_CREDENTIAL` environment variables, then the `dev`
    default. The Cloud API key (`--api-key` / `REBOOT_CLOUD_API_KEY`)
    is only consulted when `--application-url` is a Reboot Cloud
    (`*.rbt.cloud`) host.
    """
    flag_admin_credential = args.admin_credential
    flag_api_key = args.api_key
    env_admin_credential = os.environ.get(ENVVAR_REBOOT_ADMIN_CREDENTIAL)
    env_api_key = os.environ.get(ENVVAR_REBOOT_CLOUD_API_KEY)

    is_cloud = _is_cloud_host(args.application_url)

    if flag_api_key is not None and not is_cloud:
        terminal.fail(
            "`--api-key` is only accepted when `--application-url` is a "
            "`*.rbt.cloud` host; use `--admin-credential` for other hosts."
        )

    if flag_api_key is not None and flag_admin_credential is not None:
        terminal.fail(
            "`--api-key` and `--admin-credential` are mutually exclusive; "
            "pass only one."
        )

    if flag_api_key is not None:
        return flag_api_key
    if flag_admin_credential is not None:
        return flag_admin_credential
    if is_cloud and env_api_key is not None:
        return env_api_key
    if env_admin_credential is not None:
        return env_admin_credential
    return 'dev'  # Could be anything; the `dev` runtime accepts it.


def _is_cloud_host(application_url: str) -> bool:
    parsed = urlparse(application_url)
    if parsed.scheme == '':
        terminal.fail(
            "`--application-url` must include an `http://` or `https://` "
            f"scheme; got `{application_url}`."
        )
    host = (parsed.hostname or '').lower()
    return host == _CLOUD_HOST or host.endswith('.' + _CLOUD_HOST)
