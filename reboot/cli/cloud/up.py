import argparse
import base64
import json
import tempfile
import traceback
from pathlib import Path
from rbt.cloud.v1alpha1.application.application_pb2 import (
    ApplicationSize,
    ConcurrentModificationError,
    InvalidInputError,
    PaymentMethodRequiredError,
    Status,
)
from rbt.cloud.v1alpha1.application.application_rbt import Application
from rbt.v1alpha1.errors_pb2 import (
    PermissionDenied,
    StateAlreadyConstructed,
    StateNotConstructed,
)
from reboot.aio.aborted import Aborted
from reboot.aio.external import ExternalContext
from reboot.aio.types import ApplicationId
from reboot.cli import terminal
from reboot.cli.cloud.common import (
    _add_common_cloud_args,
    _application_url,
    _parse_common_cloud_args,
)
from reboot.cli.cloud.logs import SourceType, _cloud_logs
from reboot.cli.commands import run_command
from reboot.cli.rc import ArgumentParser
from reboot.naming import QualifiedApplicationName
from typing import Optional

SIZE_NAME_TO_ENUM = {
    'xsmall': ApplicationSize.XSMALL,
    'small': ApplicationSize.SMALL,
    'medium': ApplicationSize.MEDIUM,
    'large': ApplicationSize.LARGE,
    'xlarge': ApplicationSize.XLARGE,
}

VALID_SIZES = list(SIZE_NAME_TO_ENUM.keys())


def register_cloud_up(parser: ArgumentParser) -> None:
    up_subcommand = parser.subcommand('cloud up')
    _add_common_cloud_args(up_subcommand)
    up_subcommand.add_argument(
        '--dockerfile',
        type=Path,
        help='the Dockerfile to build this application from',
        default='./Dockerfile',
    )
    up_subcommand.add_argument(
        '--docker-build-arg',
        type=str,
        repeatable=True,
        help='additional build arguments to pass to the Docker build command. '
        'Can be specified multiple times, e.g. '
        '`--docker-build-arg=key1=value1 --docker-build-arg=key2`',
    )
    up_subcommand.add_argument(
        '--size',
        type=str,
        choices=VALID_SIZES,
        default='xsmall',
        help='the size of the application',
    )


async def _maybe_create_application(
    qualified_application_name: QualifiedApplicationName,
    cloud_url: str,
    api_key: str,
) -> None:
    """
    Creates the Application with the given `qualified_application_name` if it
    doesn't exist yet.
    """
    # Use a separate context for `Create()`, since that call is allowed to fail
    # and will then leave its context unable to continue due to idempotency
    # uncertainty.
    context = ExternalContext(
        name="cloud-up-create-application",
        url=cloud_url,
        bearer_token=api_key,
    )
    try:
        await Application.Create(context, qualified_application_name)
    except Aborted as aborted:
        match aborted.error:
            case StateAlreadyConstructed():  # type: ignore[misc]
                # That's OK; we just want the application to exist!
                pass
            case _:
                # Unexpected error, propagate it.
                raise


async def _does_application_exist(
    *,
    qualified_application_name: QualifiedApplicationName,
    cloud_url: str,
    api_key: str,
) -> bool:
    """
    Checks if the `Application` with the given
    `qualified_application_name` exists.
    """
    # Use a separate context since that call is allowed to fail and
    # will then leave its context unable to continue due to
    # idempotency uncertainty.
    context = ExternalContext(
        name="cloud-application-status",
        url=cloud_url,
        bearer_token=api_key,
    )
    try:
        await Application.ref(qualified_application_name).status(context)
    except Aborted as aborted:
        match aborted.error:
            case StateNotConstructed():  # type: ignore[misc]
                return False
            case _:
                # Unexpected error, propagate it.
                raise
    return True


async def cloud_up(args: argparse.Namespace) -> int:
    """Implementation of the 'cloud up' subcommand."""

    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )

    # If the application does not yet exist then --org is required!
    if organization_name is None and not await _does_application_exist(
        qualified_application_name=qualified_application_name,
        cloud_url=args.cloud_url,
        api_key=args.api_key,
    ):
        terminal.fail("--organization=... is required for new applications")

    context = ExternalContext(
        name="cloud-up",
        url=args.cloud_url,
        bearer_token=args.api_key,
    )

    try:
        terminal.info("[😇] checking permissions...", end=" ")
        await _maybe_create_application(
            qualified_application_name=qualified_application_name,
            cloud_url=args.cloud_url,
            api_key=args.api_key,
        )
        application = Application.ref(qualified_application_name)

        pushinfo_response = await application.PushInfo(context)
        terminal.info("✅")

        registry_endpoint = (
            pushinfo_response.registry_url
            # Regardless of whether the prefix is "https" or "http", we must
            # remove it; the Docker client will decide for itself whether it
            # believes the registry is "secure" or "insecure". We hope it
            # guesses right, otherwise the requests will fail.
            .removeprefix("https://").removeprefix("http://")
        )
        docker_tag = f"{registry_endpoint}/{pushinfo_response.repository}:{pushinfo_response.tag}"

        digest = await _docker_build_and_push(
            dockerfile=args.dockerfile,
            tag=docker_tag,
            registry_endpoint=registry_endpoint,
            registry_username=pushinfo_response.username,
            registry_password=pushinfo_response.password,
            docker_build_args=args.docker_build_arg,
        )

        terminal.info("[🚀] deploying...", end=" ")
        up_response = await application.idempotently().Up(
            context,
            digest=digest,
            size=SIZE_NAME_TO_ENUM[args.size],
        )

    except Aborted as aborted:
        if isinstance(aborted.error, InvalidInputError):
            terminal.fail("🛑 failed:\n"
                          f"  {aborted.error.reason}")
        elif isinstance(aborted.error, ConcurrentModificationError):
            terminal.fail(
                "🛑 failed:\n"
                "  The application is already being `up`ped or `down`ed. "
                "Please wait until that operation completes."
            )
        elif isinstance(aborted.error, PaymentMethodRequiredError):
            terminal.fail(
                "🛑 failed:\n"
                f"  Organization '{organization_name}' does not have a "
                "valid payment method. Please add a payment method before "
                "deploying applications."
            )
        elif isinstance(aborted.error, PermissionDenied):
            # Invariant for applications before organizations were
            # added was that users _always_ had admin permissions for
            # their own applications so we should only get
            # `PermissionDenied` for applications launched after
            # organizations were introduced.
            assert organization_name is not None
            terminal.fail(
                "🛑 failed:\n"
                f"  User '{user_id}' does not have permission to bring up "
                f"applications in the organization '{organization_name}', "
                "only owners and editors are allowed."
            )
        else:
            print(f"🛑 unexpected error: {aborted}")
            traceback.print_exc()
            terminal.fail("Please report this bug to the maintainers")

    async for status_response in application.reactively().RevisionStatus(
        context, revision_number=up_response.revision_number
    ):
        revision = status_response.revision
        if revision.status == Status.UPPING:
            # Keep waiting.
            continue

        if revision.status == Status.UP:
            url = _application_url(
                ApplicationId(up_response.application_id),
                args.cloud_url,
            )
            terminal.info(
                f"✅\n"
                "\n"
                f"  '{args.application_name}' revision {revision.number} is "
                "available:\n"
                "\n"
                f"  Your API is available at:      {url}\n"
                f"  MCP clients can connect at:    {url}/mcp\n"
                "  You can inspect your state at: "
                f"{url}/__/inspect\n"
            )
            return 0

        if revision.status == Status.FAILED:
            terminal.error(
                "🛑 failed:\n"
                f"Could not deploy revision {revision.number}:\n"
                f"  {revision.failure_reason}\n"
                "\n"
                f"### Logs for revision {revision.number} ###"
            )
            await _cloud_logs(
                user_id=user_id,
                organization_name=organization_name,
                qualified_application_name=qualified_application_name,
                source=SourceType.CONFIG,
                name=args.application_name,
                cloud_url=args.cloud_url,
                api_key=args.api_key,
                revisions=f"{revision.number}",
                last=None,  # Show all logs for this revision.
                show_revision=False,
                show_source=False,
                show_timestamp=False,
                follow=False,
            )
            terminal.error(
                f"### End of logs for revision {revision.number} ###\n"
                "Please correct the issue and try again."
            )
            # ISSUE(https://github.com/reboot-dev/mono/issues/4501): don't exit
            # with `sys.exit(1)` here; it causes an unexplained stack trace.
            # Simply return the error code instead and do a `sys.exit()` in the
            # caller, when the `asyncio.run()` is done.
            return 1

        if revision.status == Status.DOWNING or revision.status == Status.DOWN:
            terminal.fail(
                "🛑 failed:\n"
                "  The application is being `down`ed. Please wait until that "
                "operation completes."
            )

        # A revision that we `Up()`ed will never be in the `DOWNING` or `DOWN`
        # state. Those only appear for revisions created by calling `Down()`.
        raise ValueError(
            f"Application reached an unexpected status: '{revision.status}'. "
            "Please report this bug to the maintainers."
        )

    # Should be unreachable, but need for the type checking.
    return 1


async def _docker_build_and_push(
    dockerfile: Path,
    tag: str,
    registry_endpoint: str,
    registry_username: str,
    registry_password: str,
    docker_build_args: Optional[list[str]] = None,
) -> str:
    """
    Builds and pushes an image with the given `tag` from the `dockerfile`.

    Returns the digest of the pushed image.
    """
    assert dockerfile.is_absolute()
    if not dockerfile.exists() or not dockerfile.is_file():
        terminal.fail(f"🛑 Could not find Dockerfile '{dockerfile}'")

    dockerfile_pretty = str(dockerfile)
    try:
        dockerfile_pretty = str(dockerfile.relative_to(Path.cwd()))
        if not dockerfile_pretty.startswith("."):
            dockerfile_pretty = f"./{dockerfile_pretty}"
    except ValueError:
        # This means the Dockerfile is not in the current working directory.
        # That's OK, we'll simply use the absolute path.
        pass

    await run_command(
        command=[
            "docker",
            "buildx",
            "build",
            # Reboot Cloud runs on AMD64, so its images must be built for that
            # platform.
            "--platform",
            "linux/amd64",
            "--file",
            str(dockerfile),
            "--tag",
            tag,
        ] + [f"--build-arg={arg}" for arg in docker_build_args or []] + [
            ".",
        ],
        cwd=str(dockerfile.parent),
        icon="🐳",
        command_name="build",
        explanation=f"building container from '{dockerfile_pretty}'",
        capture_output=False,
    )

    try:
        # The push step we do with config from a temporary directory, which
        # allows us to use a one-time Docker `config.json`. That avoids
        # permanently storing the user's credentials in their normal
        # `~/.docker/config.json`.
        with tempfile.TemporaryDirectory() as tempdir:
            # Create a temporary Docker configuration file.
            docker_config = Path(tempdir) / "config.json"
            docker_config.write_text(
                json.dumps(
                    {
                        "auths":
                            {
                                registry_endpoint:
                                    {
                                        "auth":
                                            base64.b64encode(
                                                f"{registry_username}:{registry_password}"
                                                .encode()
                                            ).decode(),
                                    }
                            }
                    }
                )
            )

            # Push the image with the temporary Docker configuration.
            await run_command(
                command=[
                    "docker",
                    "--config",
                    str(tempdir),
                    "push",
                    tag,
                ],
                icon="🚛",
                command_name="push",
                explanation="pushing container",
                capture_output=False,
            )

        # Obtain the image digest.
        digest = (
            await run_command(
                command=[
                    "docker",
                    "inspect",
                    "--format",
                    "{{index .RepoDigests 0}}",
                    tag,
                ],
                icon="👀",
                command_name="inspect",
                explanation="inspecting container",
                capture_output=True,
                only_show_if_verbose=True,
            )
        ).rsplit("@", 1)[-1]

        return digest

    finally:
        # Remove the tag from the local Docker daemon so that it doesn't pollute the
        # user's list of images.
        await run_command(
            command=[
                "docker",
                "image",
                "remove",
                tag,
            ],
            icon="🧹",
            command_name="cleanup",
            explanation="cleaning up",
            capture_output=False,
            only_show_if_verbose=True,
        )
