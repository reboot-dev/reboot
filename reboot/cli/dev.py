import aiofiles.os
import argparse
import asyncio
import functools
import grpc
import os
import random
import rebootdev.aio.tracing
import shutil
import signal
import sys
import termios
import tty
from colorama import Fore
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from enum import Enum
from grpc_health.v1 import health_pb2, health_pb2_grpc
from opentelemetry.sdk.environment_variables import (
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    OTEL_EXPORTER_OTLP_TRACES_INSECURE,
)
from pathlib import Path
# We import the whole `terminal` module (as opposed to the methods it contains)
# to allow us to mock these methods out in tests.
from reboot.cli import terminal
from reboot.cli.cloud import add_cloud_options
from reboot.cli.directories import (
    add_working_directory_options,
    dot_rbt_dev_directory,
    use_working_directory,
)
from reboot.cli.generate import generate_direct
from reboot.cli.monkeys import monkeys, no_chaos_monkeys
# We won't mock the classes in `rc`, so it's safe to import those directly.
from reboot.cli.rc import (
    ArgumentParser,
    ArgumentParserFactory,
    BaseTransformer,
    SubcommandParser,
    TransformerError,
)
from reboot.cli.subprocesses import Subprocesses
from reboot.cli.transpile import auto_transpile, ensure_can_auto_transpile
from reboot.cli.watch import FileWatcher, file_watcher
from reboot.controller.plan_makers import validate_num_servers
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.contexts import EffectValidation
from rebootdev.aio.exceptions import InputError
from rebootdev.settings import (
    DEFAULT_SECURE_PORT,
    DOCS_BASE_URL,
    ENVOY_PROXY_IMAGE,
    ENVVAR_LOCAL_ENVOY_MODE,
    ENVVAR_LOCAL_ENVOY_TLS_CERTIFICATE_PATH,
    ENVVAR_LOCAL_ENVOY_TLS_KEY_PATH,
    ENVVAR_LOCAL_ENVOY_USE_TLS,
    ENVVAR_RBT_CLOUD_API_KEY,
    ENVVAR_RBT_CLOUD_URL,
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_EFFECT_VALIDATION,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_NODEJS,
    ENVVAR_RBT_SECRETS_DIRECTORY,
    ENVVAR_RBT_SERVERS,
    ENVVAR_RBT_STATE_DIRECTORY,
    ENVVAR_REBOOT_LOCAL_ENVOY,
    ENVVAR_REBOOT_LOCAL_ENVOY_PORT,
    ENVVAR_REBOOT_USE_TTY,
    RBT_APPLICATION_EXIT_CODE_BACKWARDS_INCOMPATIBILITY,
)
from rebootdev.ssl.localhost import LOCALHOST_CRT_DATA
from typing import Any, Awaitable, Callable, Optional, TextIO, TypeVar

TLS_CERTIFICATE_BEGINNING = "-----BEGIN CERTIFICATE-----"
TLS_PRIVATE_KEY_BEGINNING = "-----BEGIN PRIVATE KEY-----"


class OnBackwardsIncompatibility(Enum):
    ASK = 1
    EXPUNGE = 2
    FAIL = 3


class Tracing(Enum):
    NONE = 0
    JAEGER = 1


class EnvTransformer(BaseTransformer):

    def transform(self, value: str):
        if '=' not in value:
            raise TransformerError(
                f"Invalid flag '--env={value}': must be in the form "
                "'--env=KEY=VALUE'"
            )
        return value.split('=', 1)


def add_application_options(subcommand: SubcommandParser) -> None:
    """Helper that adds options used to run Reboot applications."""
    subcommand.add_argument(
        "--env",
        type=str,
        repeatable=True,
        transformer=EnvTransformer(),
        help=
        "sets any specified environment variables before running the application; "
        "'ENV' should be of the form 'KEY=VALUE'",
    )

    subcommand.add_argument(
        '--python',
        type=bool,
        default=False,
        help="whether or not to launch the application by "
        "passing it as an argument to 'python'",
    )

    subcommand.add_argument(
        '--nodejs',
        type=bool,
        default=False,
        help="whether or not to launch the application by "
        "passing it as an argument to 'node'",
    )

    subcommand.add_argument(
        "--secrets-directory",
        type=Path,
        default=None,
        help=(
            "a directory to use to override the default source (environment variables) of Secrets; "
            "in the Reboot Cloud, Secrets are written using `rbt cloud secret write`; "
            f"see {DOCS_BASE_URL}/develop/secrets for more information."
        ),
    )

    subcommand.add_argument(
        '--application',
        type=str,  # TODO: consider argparse.FileType('e')
        help='path to application to execute',
        required=True,
        non_empty_string=True,
    )


def register_dev(parser: ArgumentParser):
    _register_dev_run(parser)
    _register_dev_expunge(parser)


def _register_dev_run(parser: ArgumentParser):
    add_working_directory_options(parser.subcommand('dev run'))

    add_application_options(parser.subcommand('dev run'))

    parser.subcommand('dev run').add_argument(
        '--name',
        type=str,
        help=(
            "name of application; state will be persisted using this name in "
            "the `.rbt` state directory"
        ),
        non_empty_string=True,
    )

    parser.subcommand('dev run').add_argument(
        '--background-command',
        type=str,
        repeatable=True,
        help=
        'command(s) to execute in the background (multiple instances of this '
        'flag are supported)',
    )

    parser.subcommand('dev run').add_argument(
        '--servers',
        type=int,
        help='the number of "servers" (serving processes) to spawn.',
        # The goal in this case is to minimize the performance impact in
        # `dev`, while still having multiple servers to help shake out
        # distribution bugs.
        default=2,
    )

    parser.subcommand('dev run').add_argument(
        '--port',
        type=int,
        help='port on which the Reboot app will serve traffic; defaults to '
        f'{DEFAULT_LOCAL_ENVOY_PORT}',
    )

    parser.subcommand('dev run').add_argument(
        '--watch',
        type=str,
        repeatable=True,
        help=
        'path to watch; multiple instances are allowed; globbing is supported',
    )

    parser.subcommand('dev run').add_argument(
        '--chaos',
        type=bool,
        default=True,
        help='whether or not to randomly induce failures',
    )

    parser.subcommand('dev run').add_argument(
        '--effect-validation',
        type=str,
        default="quiet",
        choices=[value.name.lower() for value in EffectValidation],
        help=(
            'whether to validate effects in development mode; see '
            f'{DOCS_BASE_URL}/develop/side_effects '
            'for more information.'
        ),
        non_empty_string=True,
    )

    parser.subcommand('dev run').add_argument(
        '--on-backwards-incompatibility',
        type=str,
        default="ask",
        choices=[value.name.lower() for value in OnBackwardsIncompatibility],
        help=(
            'what to do when a backwards incompatible schema change '
            'is encountered in an application; see '
            f'{DOCS_BASE_URL}/develop/overview#persisting-state-during-development '
            'for more information.'
        ),
    )

    parser.subcommand('dev run').add_argument(
        "--generate-watch",
        type=bool,
        default=True,
        help="also run `rbt generate --watch` in the background if true, taking "
        "'generate' arguments from the '.rbtrc' file, which must be present",
    )

    parser.subcommand('dev run').add_argument(
        '--transpile',
        type=str,
        help="command to run _before_ trying to run the application to compile "
        "TypeScript files, e.g., 'npx tsc'",
        default=None,
        non_empty_string=True,
    )

    parser.subcommand('dev run').add_argument(
        "--use-localhost-direct",
        type=bool,
        default=False,
        help=argparse.SUPPRESS,
    )

    parser.subcommand('dev run').add_argument(
        "--terminate-after-health-check",
        type=bool,
        help=argparse.SUPPRESS,
    )

    parser.subcommand('dev run').add_argument(
        '--tls-certificate',
        type=str,
        help="path to TLS certificate to use",
    )

    parser.subcommand('dev run').add_argument(
        '--tls-key',
        type=str,
        help="path to TLS key to use",
    )

    # When performing health-checks, 'rbt' CLI becomes a gRPC client to the
    # application, which requires a root certificate to verify the application's
    # certificate. This is only necessary when using TLS.
    # TODO: https://github.com/reboot-dev/mono/issues/4130
    parser.subcommand('dev run').add_argument(
        '--tls-root-certificate',
        type=str,
        help="path to TLS root certificate to use",
    )

    # The `dev` command does not require an API key, since not everyone will
    # have access to secrets on day one.
    add_cloud_options(parser.subcommand('dev run'), api_key_required=False)

    parser.subcommand('dev run').add_argument(
        '--tracing',
        type=str,
        default=Tracing.NONE.name.lower(),
        choices=[option.name.lower() for option in Tracing],
        help="if set, enables tracing for the application",
    )


def _register_dev_expunge(parser: ArgumentParser):
    parser.subcommand('dev expunge').add_argument(
        '--name',
        type=str,
        help=(
            "name of the application to expunge; will remove this "
            "application's state from the `.rbt` state directory"
        ),
        required=True,
        non_empty_string=True,
    )

    parser.subcommand('dev expunge').add_argument(
        '--yes',
        type=bool,
        default=False,
        help="skip the confirmation prompt",
    )


EnumT = TypeVar('EnumT', bound=Enum)


def enum_value(
    args,
    flag_name: str,
    t: type[EnumT],
) -> EnumT:
    flag_value = getattr(args, flag_name)
    try:
        # TODO: In Python 3.12, can use `choice in Enum`.
        return t[flag_value.upper()]
    except KeyError:
        options = ', '.join(e.name.lower() for e in t)
        terminal.fail(
            f"Unexpected value for {flag_name}: `{flag_value}`. "
            f"Legal values are: {options}"
        )


async def _run_background_command(
    background_command: str,
    *,
    verbose: bool,
    print_as: Optional[str] = None,
    subprocesses: Subprocesses,
):
    # TODO: Align this with the global `terminal.is_verbose` boolean. We always
    # want error output in case of failure, but we might only want streamed output
    # if `is_verbose`.
    if verbose:
        terminal.info(
            f"Running background command '{print_as or background_command}'"
        )

    async with subprocesses.shell(background_command) as process:
        await process.wait()

        if process.returncode != 0:
            terminal.fail(
                f"Failed to run background command '{background_command}', "
                f"exited with status {process.returncode}"
            )
        elif verbose:
            terminal.warn(
                f"Background command '{background_command}' exited without errors"
            )


@rebootdev.aio.tracing.asynccontextmanager_span(set_status_on_exception=False)
async def _run(
    application,
    *,
    env: dict[str, str],
    launcher: str,
    subprocesses: Subprocesses,
    application_started_event: asyncio.Event,
):
    """Helper for running the application with an optional launcher."""
    args = [launcher, application]

    async with subprocesses.exec(*args, env=env) as process:
        application_started_event.set()
        yield process

    # As control is returned back to us, it means the application is no longer
    # running. We clear the event in preparation for the next run.
    application_started_event.clear()


def try_and_become_child_subreaper_on_linux():
    if sys.platform == 'linux':
        # The 'pyprctl' module is available on Linux only.
        import pyprctl
        try:
            pyprctl.set_child_subreaper(True)
        except:
            terminal.warn(
                "Failed to become child subreaper, we'll do our "
                "best to ensure all created processes are terminated"
            )
            pass


async def check_docker_status(subprocesses: Subprocesses):
    """Checks if Docker is running and can use the Envoy proxy image. Downloads
    that image if necessary."""
    async with subprocesses.exec(
        'docker',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            terminal.fail(
                f"Could not use Docker:\n"
                "\n"
                f"{stdout.decode() if stdout is not None else '<no output>'}"
            )

    # The '-q' flag returns only the image ID, so if stdout is empty
    # then the image is not downloaded.
    async with subprocesses.exec(
        'docker',
        'images',
        '-q',
        ENVOY_PROXY_IMAGE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        stdout, _ = await process.communicate()

        if process.returncode != 0:
            terminal.fail(
                f"Could not use Docker; 'docker images -q {ENVOY_PROXY_IMAGE}' failed with output:\n"
                "\n"
                f"{stdout.decode() if stdout is not None else '<no output>'}"
            )
        elif stdout is None or stdout == b'':
            # Empty output means the image is not downloaded because
            # 'docker' didn't find a match for the image name.
            terminal.info(
                f"Pulling Envoy proxy image '{ENVOY_PROXY_IMAGE}'..."
            )
            async with subprocesses.exec(
                'docker',
                'pull',
                ENVOY_PROXY_IMAGE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            ) as process:
                stdout, _ = await process.communicate()
                if process.returncode != 0:
                    terminal.fail(
                        f"Could not use Docker; 'docker pull {ENVOY_PROXY_IMAGE}' failed with output:\n"
                        "\n"
                        f"{stdout.decode() if stdout is not None else '<no output>'}"
                    )


async def _check_local_envoy_status(
    *,
    port: int,
    terminate_after_health_check: bool,
    application_started_event: asyncio.Event,
    use_localhost_direct: bool,
    tls_certificate: Optional[str],
    root_certificate: Optional[str],
    tracing: Tracing,
) -> None:
    """Checks if the application is up and running.
    Optionally exits as soon as the health check has passed.
    """
    # Wait until application is running with starting health check.
    await application_started_event.wait()

    # If we've been asked to use `localhost.direct` we use the 'dev'
    # subdomain as a workaround on a gRPC bug that produces log
    # message error about not matching the entry (*.localhost.direct)
    # in the certificate. See
    # https://github.com/reboot-dev/mono/issues/2305
    #
    # We also want to print out 'dev.localhost.direct' so that our
    # users copy that to also avoid getting the log message error from
    # their gRPC or Reboot calls.
    address = (
        f'dev.localhost.direct:{port}'
        if use_localhost_direct else f'127.0.0.1:{port}'
    )

    if tls_certificate is not None:
        assert not use_localhost_direct
        assert root_certificate is not None

        cert_data = b''

        async with aiofiles.open(tls_certificate, 'rb') as f:
            cert_data = await f.read()

        cert = x509.load_pem_x509_certificate(cert_data, default_backend())

        try:
            san_extension = cert.extensions.get_extension_for_class(
                x509.SubjectAlternativeName
            )
            san_list = san_extension.value.get_values_for_type(x509.DNSName)
        except x509.ExtensionNotFound:
            terminal.fail(
                "TLS certificate does not contain a Subject Alternative Name extension"
            )

        if 'localhost' not in san_list:
            terminal.warn(
                "The TLS certificate does not include 'localhost' in the "
                "Subject Alternative Name (SAN) extension. However, "
                "'rbt dev run' launches the backend on 'localhost'. Ensure "
                "your '/etc/hosts' file contains a mapping that directs "
                f"'{san_list[0]}' to 127.0.0.1.\n"
                "The first domain listed in the certificate "
                f"('{san_list[0]}') will be used as the address for the "
                "health check."
            )
            address = f"{san_list[0]}:{port}"
        else:
            # We can use 'localhost' as the address for the health check, which
            # is great since it doesn't require any `/etc/hosts` entries or
            # similar.
            address = f'localhost:{port}'

    protocol = "https" if use_localhost_direct or tls_certificate else "http"

    backoff = Backoff(
        initial_backoff_seconds=0.01,
        max_backoff_seconds=1,
        backoff_multiplier=1.01,
    )

    def create_channel(
        address: str,
        use_localhost_direct: bool,
        root_certificate: Optional[bytes],
    ):
        if use_localhost_direct:
            return grpc.aio.secure_channel(
                address,
                grpc.ssl_channel_credentials(
                    root_certificates=LOCALHOST_CRT_DATA,
                ),
            )
        elif root_certificate is not None:
            return grpc.aio.secure_channel(
                address,
                grpc.ssl_channel_credentials(
                    root_certificates=root_certificate,
                ),
            )
        else:
            return grpc.aio.insecure_channel(address)

    was_application_serving = False

    binary_root_certificate = None

    if root_certificate is not None:
        async with aiofiles.open(root_certificate, 'rb') as f:
            binary_root_certificate = await f.read()

    while True:
        try:
            async with create_channel(
                address,
                use_localhost_direct,
                binary_root_certificate,
            ) as channel:
                response = await health_pb2_grpc.HealthStub(channel).Check(
                    health_pb2.HealthCheckRequest()
                )

                is_application_serving = (
                    response.status == health_pb2.HealthCheckResponse.SERVING
                )

        except grpc.aio.AioRpcError:
            is_application_serving = False

        if is_application_serving:
            backoff.clear()

        if (
            is_application_serving != was_application_serving and
            application_started_event.is_set()
        ):
            was_application_serving = is_application_serving

            if is_application_serving:
                terminal.info("Application is serving traffic ...\n")
                terminal.info(
                    f"  Your API is available at the URL {protocol}://{address}\n"
                    "\n"
                    f"  You can inspect your state at {protocol}://{address}/__/inspect\n",
                    color=Fore.WHITE,
                )
                if tracing == Tracing.JAEGER:
                    # TODO: dynamic port. See comment in `_run_jaeger()`.
                    terminal.info(
                        "  You can see traces on the Jaeger dashboard at "
                        "http://localhost:16686\n",
                        color=Fore.WHITE,
                    )
                if terminate_after_health_check:
                    # TODO: `initializer`s run asynchronously, but can cause the application
                    # to fail to start up, even after the health check has passed. We sleep a
                    # fixed amount of time after the healthcheck to try to catch those cases.
                    await asyncio.sleep(10)
                    return
            else:
                terminal.warn("Application stopped serving traffic\n")

        if is_application_serving:
            # Once an application is known to be serving traffic, we can take it
            # a little easier on the health checks. That saves us from spamming
            # Envoy logs, if nothing else.
            await asyncio.sleep(1)
        else:
            await backoff()


JAEGER_VERSION = "2.0.0"


async def _run_jaeger():
    # TODO: we currently specify a LOT of fixed ports for Jaeger, as per
    #       their docs. That means only a single `rbt dev run` with
    #       `--tracing=jaeger` can run at the same time. We should figure
    #       out what each of these ports mean, and how to make each of
    #       them dynamic.

    process = await asyncio.create_subprocess_exec(
        'docker',
        'run',
        '--rm',
        '-p',
        '16686:16686',
        '-p',
        '4317:4317',
        '-p',
        '4318:4318',
        f'jaegertracing/jaeger:{JAEGER_VERSION}',
        '--set',
        'receivers.otlp.protocols.http.endpoint=0.0.0.0:4318',
        '--set',
        'receivers.otlp.protocols.grpc.endpoint=0.0.0.0:4317',
        # Suppress all output from Jaeger; its logs are not
        # developer-facing.
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await process.wait()
    except asyncio.CancelledError:
        # If the task is cancelled, we should also terminate the Jaeger
        # process.
        assert process.returncode is None, "Jaeger exited unexpectedly"
        process.terminate()
        await process.wait()


async def _cancel_all(tasks: list[asyncio.Task]) -> None:
    if not tasks:
        return

    for task in tasks:
        task.cancel()

    await asyncio.wait(tasks, return_when=asyncio.ALL_COMPLETED)


async def _wait_for_first_completed(
    arg0: asyncio.Task[Any], *args: asyncio.Task[Any] | None
) -> set[asyncio.Task[Any]]:
    """Return the first of the given tasks to complete."""
    completed, _ = await asyncio.wait(
        [arg0, *(arg for arg in args if arg is not None)],
        return_when=asyncio.FIRST_COMPLETED
    )
    return completed


def generate_parser_if_generate_watch(
    dev_args,
    dev_parser: ArgumentParser,
    parser_factory: ArgumentParserFactory,
) -> Optional[ArgumentParser]:
    """Check whether we can run `rbt generate --watch` without further
    user-specified arguments. That depends on whether the user has
    specified the necessary arguments in an `.rbtrc`.

    If so, returns the `rbt generate` ArgumentParser to use.
    """
    if not dev_args.generate_watch:
        return None
    if dev_parser.dot_rc is None:
        terminal.fail(
            "The '--generate-watch' flag was specified (or set by default), but "
            "no '.rbtrc' file was found. Add an '.rbtrc' file containing "
            "the necessary arguments to run 'rbt generate' to use 'rbt dev "
            "run --generate-watch', or pass '--no-generate-watch'."
        )

    return parser_factory(['rbt', 'generate'])


ResultT = TypeVar('ResultT')


async def _read_until(
    file_handle: TextIO,
    f: Callable[[str, asyncio.Future[ResultT]], None],
) -> ResultT:
    """Reads the given file handle and passes it 1 character at a time to the given function.

    When the function is done reading, it should set the result of the future to complete.
    """
    fd = file_handle.fileno()
    loop = asyncio.get_running_loop()

    def read(future: asyncio.Future[ResultT]):
        value = file_handle.read(1)
        if not value:
            # The input is closed, and will never be readable. Remove our reader
            # rather than continuing to poll it.
            loop.remove_reader(fd)
        f(value, future)

    future: asyncio.Future[ResultT] = asyncio.Future()

    # Add an async file descriptor reader to our running event
    # loop so that we know when a key has been pressed.
    loop.add_reader(fd, read, future)
    try:
        return await future
    finally:
        loop.remove_reader(fd)


async def induce_chaos() -> Optional[int]:
    """Helper that allows inducing chaos via pressing keys 0-9."""

    def read(value: str, future: asyncio.Future[Optional[int]]):
        if value == '0':
            # No delay, restart app immediately.
            future.set_result(None)
        elif value in ['1', '2', '3', '4', '5', '6', '7', '8', '9']:
            # Delay restarting app by the 2 raised to the power of the
            # key pressed, e.g., if '3' was pressed we'll wait 8
            # seconds, if '4' is pressed we'll wait 16 seconds, if '9'
            # was pressed we'll wait 512 seconds (almost 10 minutes).
            future.set_result(2**int(value))

    return await _read_until(sys.stdin, read)


DEFAULT_LOCAL_ENVOY_PORT: int = DEFAULT_SECURE_PORT


def _check_common_args(args):
    if args.python and args.nodejs:
        terminal.fail(
            "Only one of '--python' or '--nodejs' should be specified."
        )
    elif not args.python and not args.nodejs:
        terminal.fail("One of '--python' or '--nodejs' must be specified.")


async def _check_file_first_line_equals(file_path, expected_first_line):
    async with aiofiles.open(file_path) as f:
        first_file_line = await f.readline()
        first_file_line = first_file_line.strip('\n')
        if first_file_line != expected_first_line:
            return False

    return True


async def _set_tls_env_or_fail(args):
    if not await aiofiles.os.path.isfile(args.tls_certificate):
        terminal.fail(
            f"Expecting file at --tls-certificate='{args.tls_certificate}"
        )

    if not await _check_file_first_line_equals(
        args.tls_certificate, TLS_CERTIFICATE_BEGINNING
    ):
        terminal.fail(
            f"The file at --tls-certificate='{args.tls_certificate}' does not "
            "seem to contain a TLS certificate"
        )

    if not await aiofiles.os.path.isfile(args.tls_key):
        terminal.fail(f"Expecting file at --tls-key='{args.tls_key}")

    if not await _check_file_first_line_equals(
        args.tls_key,
        TLS_PRIVATE_KEY_BEGINNING,
    ):
        terminal.fail(
            f"The file at --tls-key='{args.tls_key}' does not seem to "
            "contain a TLS key"
        )

    os.environ[ENVVAR_LOCAL_ENVOY_USE_TLS] = 'True'
    # We don't check the certificate and key for being None, because in
    # that case LocalEnvoy will use localhost.direct certificate.
    os.environ[ENVVAR_LOCAL_ENVOY_TLS_CERTIFICATE_PATH] = args.tls_certificate
    os.environ[ENVVAR_LOCAL_ENVOY_TLS_KEY_PATH] = args.tls_key


async def await_maybe_expunge(
    args,
    parser: ArgumentParser,
    *,
    stdin: TextIO = sys.stdin,
) -> None:
    """Helper that allows waiting for `x` to be pressed to trigger an expunge."""

    message = (
        'Backwards incompatibility encountered '
        '(see `--on-backwards-incompatibility` for more info)'
    )

    on_backwards_incompatibility = enum_value(
        args,
        'on_backwards_incompatibility',
        OnBackwardsIncompatibility,
    )
    if on_backwards_incompatibility == OnBackwardsIncompatibility.FAIL:
        terminal.warn(
            '\n'
            f'{message} ... waiting for modification'
            '\n',
        )
        never: asyncio.Future[None] = asyncio.Future()
        return await never
    elif on_backwards_incompatibility == OnBackwardsIncompatibility.ASK:
        terminal.warn(
            '\n'
            f'{message} ... waiting for modification, or hit `x` to expunge'
            '\n',
        )

        def read(value: str, future: asyncio.Future[None]):
            if value == 'x':
                future.set_result(None)

        # Wait for expunge to maybe be requested.
        await _read_until(stdin, read)
    else:
        assert on_backwards_incompatibility == OnBackwardsIncompatibility.EXPUNGE

    # Expunge was requested: execute it.
    await _expunge(args, parser, confirm=False)


def _handle_application_exit(
    args,
    parser: ArgumentParser,
    *,
    application_exit_code: int,
) -> Optional[asyncio.Task]:
    """Handles the case where a user's application has exited.

    In the case where an application exited due to backwards incompatibility,
    returns a task that will wait for a user to decide to expunge.
    """
    message = (
        'Application exited unexpectedly '
        f'(with exit status {application_exit_code})'
    )
    if args.terminate_after_health_check:
        terminal.fail(message)
    if application_exit_code == RBT_APPLICATION_EXIT_CODE_BACKWARDS_INCOMPATIBILITY:
        return asyncio.create_task(
            await_maybe_expunge(args, parser),
            name=f'await_maybe_expunge() in {__name__}',
        )
    terminal.warn(
        '\n'
        f'{message} ... waiting for modification'
        '\n',
    )
    return None


@rebootdev.aio.tracing.function_span()
async def dev_run(
    args,
    *,
    parser: ArgumentParser,
    parser_factory: ArgumentParserFactory,
) -> int:
    """Implementation of the 'dev run' subcommand."""

    _check_common_args(args)

    # We don't expect developers to have Envoy installed
    # on their own machines, so we pull and run it as a
    # Docker container, unless specified otherwise via the
    # `ENVVAR_LOCAL_ENVOY_MODE` env variable, which
    # we at least use to run nodejs examples on macOS
    # GitHub runners since they don't have Docker.
    local_envoy_mode = os.environ.get(ENVVAR_LOCAL_ENVOY_MODE, 'docker')
    os.environ[ENVVAR_LOCAL_ENVOY_MODE] = local_envoy_mode

    if args.use_localhost_direct and (
        args.tls_certificate or args.tls_key or args.tls_root_certificate
    ):
        terminal.fail(
            "Cannot use '--use-localhost-direct' with '--tls-certificate', "
            "'--tls-key' or '--tls-root-certificate'."
        )

    tls_args = [args.tls_certificate, args.tls_key, args.tls_root_certificate]

    if any(tls_args) and not all(tls_args):
        terminal.fail(
            "All of '--tls-certificate', '--tls-key' "
            "and '--tls-root-certificate' must be specified."
        )

    if args.use_localhost_direct:
        # We ask for TLS without specifying a specific certificate,
        # which means Envoy will use the one for `localhost.direct`.
        os.environ[ENVVAR_LOCAL_ENVOY_USE_TLS] = 'True'
    elif args.tls_certificate:
        await _set_tls_env_or_fail(args)

        if not await aiofiles.os.path.isfile(args.tls_root_certificate):
            terminal.fail(
                f"Expecting file at --tls-root-certificate='{args.tls_root_certificate}"
            )

        if not await _check_file_first_line_equals(
            args.tls_root_certificate, TLS_CERTIFICATE_BEGINNING
        ):
            terminal.fail(
                f"The file at --tls-root-certificate='{args.tls_root_certificate}' does not "
                "seem to contain a TLS certificate"
            )
    else:
        os.environ[ENVVAR_LOCAL_ENVOY_USE_TLS] = 'False'

    tracing = Tracing.NONE
    try:
        tracing = Tracing[args.tracing.upper()]
    except KeyError:
        terminal.fail(
            f"Unexpected value for '--tracing': `{args.tracing}`. "
            f"Legal values are: {[option.name.lower() for option in Tracing]}"
        )

    with file_watcher() as watcher:
        if parser.dot_rc is not None:
            while True:
                async with watcher.watch(
                    [parser.dot_rc]
                ) as rc_file_event_task:
                    return_code = await _dev_run(
                        args,
                        parser=parser,
                        parser_factory=parser_factory,
                        rc_file_event_task=rc_file_event_task,
                        watcher=watcher,
                        tracing=tracing,
                    )
                if return_code is not None:
                    return return_code

                terminal.info(
                    '\n'
                    f'{parser.dot_rc_filename} modified; restarting ... '
                    '\n'
                )
                args, _ = parser.parse_args()
        else:
            return_code = await _dev_run(
                args,
                parser=parser,
                parser_factory=parser_factory,
                rc_file_event_task=None,
                watcher=watcher,
                tracing=tracing,
            )
            assert return_code is not None, "Should not have requested re-running: no `rc_file_event_task` was set."
            return return_code


@rebootdev.aio.tracing.function_span()
async def _dev_run(
    args,
    *,
    parser: ArgumentParser,
    parser_factory: ArgumentParserFactory,
    rc_file_event_task: Optional[asyncio.Task],
    watcher: FileWatcher,
    tracing: Tracing,
) -> Optional[int]:
    """Changes the working directory, and executes other preparation that needs
    cleanup when the dev loop exits.

    Has the same return semantics as `__dev_run`.
    """

    # Determine the working directory and move into it.
    with use_working_directory(args, parser, verbose=True):

        # If on Linux try and become a child subreaper so that we can
        # properly clean up all processes descendant from us!
        try_and_become_child_subreaper_on_linux()

        # Prepare to run background tasks and to potentially adjust terminal
        # settings, both of which need cleanup on exit.
        background_command_tasks: list[asyncio.Task] = []

        # In some environments, e.g., CI, we don't have a tty, nor do
        # we need one as we're not expecting to read from stdin.
        # 'sys.stdin.isatty()' returns True even if it is called from a
        # '.sh' script, which blocks the execution of
        # 'rbt dev run --terminate-after-health-check'.
        use_tty = sys.stdin.isatty(
        ) and args.terminate_after_health_check is not True

        force_use_tty = os.environ.get(ENVVAR_REBOOT_USE_TTY, None)

        if force_use_tty is not None:
            use_tty = force_use_tty.lower() == 'true'

        # Save the old tty settings so we can set them back to that
        # when exiting.
        sys_stdin_fd = sys.stdin.fileno()
        old_tty_settings = termios.tcgetattr(sys_stdin_fd) if use_tty else None

        try:
            if use_tty:
                # We need to become our own process group that
                # controls the terminal so that any parent process
                # that might have spawned us, e.g. `npx`, won't give
                # control of the terminal back to its parent, e.g., a
                # shell, if it exits before us.
                #
                # A bit more context: in some versions of `node` (for
                # example, 24.5.0) when a user does a `Ctrl-C` to an
                # `npx rbt dev run` we will lose control of the
                # terminal and can't reset the terminal settings. This
                # is likely due to a bug where `npx` is not waiting
                # for its child process and is exiting early causing
                # its parent (the shell) to regain control of the
                # terminal.
                os.setpgrp()
                handler = signal.signal(signal.SIGTTOU, signal.SIG_IGN)
                tty_fd = os.open("/dev/tty", os.O_RDWR)
                os.tcsetpgrp(tty_fd, os.getpgrp())
                signal.signal(signal.SIGTTOU, handler)

                # Now we can set the tty to not echo key strokes back
                # to the terminal and also remove buffering so we can
                # read a single key stroke at a time (yes,
                # `tty.setcbreak()` does all that!)
                tty.setcbreak(sys_stdin_fd)

            # Then execute the dev loop.
            return await __dev_run(
                args,
                parser=parser,
                parser_factory=parser_factory,
                rc_file_event_task=rc_file_event_task,
                background_command_tasks=background_command_tasks,
                watcher=watcher,
                tracing=tracing,
            )
        finally:
            await _cancel_all(background_command_tasks)

            if old_tty_settings is not None:
                # Reset the terminal to old settings, i.e., make key
                # strokes be echoed, etc.
                termios.tcsetattr(
                    sys_stdin_fd, termios.TCSADRAIN, old_tty_settings
                )


@rebootdev.aio.tracing.function_span()
async def __dev_run(
    args,
    *,
    parser: ArgumentParser,
    parser_factory: ArgumentParserFactory,
    rc_file_event_task: Optional[asyncio.Task],
    background_command_tasks: list[asyncio.Task],
    watcher: FileWatcher,
    tracing: Tracing,
) -> Optional[int]:
    """Runs until:
      * the given `rc_file_event_task` triggers (returns None)
      * the health check passes, and `--terminate-on-health-check` is set (returns 0)
      * an exception is raised
    """
    # Use `Subprocesses` to manage all of our subprocesses for us.
    subprocesses = Subprocesses()

    application = os.path.abspath(args.application)
    application_started_event = asyncio.Event()

    # Run background tasks.
    for background_command in args.background_command or []:
        background_command_tasks.append(
            asyncio.create_task(
                _run_background_command(
                    background_command,
                    verbose=True,
                    subprocesses=subprocesses,
                ),
                name=f'_run_background_command(...) in {__name__}',
            )
        )
    if tracing == Tracing.JAEGER:
        background_command_tasks.append(
            asyncio.create_task(
                _run_jaeger(),
                name=f'_run_jaeger() in {__name__}',
            )
        )

    # Boolean indicating whether or not user would like us to do
    # transpilation for them automatically.
    auto_transpilation = Path(application).suffix == '.ts'

    # If `--generate-watch` is enabled, prepare to invoke 'generate' as part of our loop.
    proto_globs = []
    needs_proto_compile = False
    generate_python_directory: Optional[str] = None
    # Add each proto directory to the PYTHONPATH, since users might define
    # their schemas in Pydantic models in those directories.
    generate_proto_directories: Optional[list[str]] = None
    proto_compile: Optional[Callable[[], Awaitable[int]]] = None

    generate_parser: Optional[ArgumentParser
                             ] = generate_parser_if_generate_watch(
                                 args,
                                 parser,
                                 parser_factory,
                             )

    if generate_parser is not None:
        try:
            generate_args, generate_argv_after_dash_dash = generate_parser.parse_args(
            )
        except SystemExit:
            # Trying to catch 'sys.exit()' from top level 'generate' parser.
            terminal.fail(
                "Failed to run 'rbt generate' as part of 'rbt dev run' with "
                "'--generate-watch' flag set.\n"
                "Edit the '.rbtrc' file to set the necessary arguments to run "
                "'rbt generate', or pass '--no-generate-watch'."
            )

        if args.transpile is not None:
            if 'react' not in generate_args or 'nodejs' not in generate_args:
                terminal.fail(
                    "You must pass either '--react' or '--nodejs' to 'rbt generate' to use '--transpile'."
                )
            if auto_transpilation:
                terminal.fail(
                    "You can not pass '--transpile' when passing a '.ts' file to '--application' as that implies you want us to do the transpilation for you."
                )

        if auto_transpilation:
            ensure_can_auto_transpile()

        generate_proto_directories = generate_args.proto_directories
        generate_python_directory = generate_args.python
        proto_globs = [
            # Watch for Proto files changes.
            f"{proto_directory}/**/*.proto"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Watch for Zod API files changes.
            f"{proto_directory}/**/*.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Watch for Pydantic API files changes.
            f"{proto_directory}/**/*.py"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-es` generated files.
            f"!{proto_directory}/**/*_pb.d.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-es` generated files.
            f"!{proto_directory}/**/*_pb.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-reboot_nodejs` generated files.
            f"!{proto_directory}/**/*_rbt.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-reboot_react` generated files.
            f"!{proto_directory}/**/*_rbt_react.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-reboot_web` generated files.
            f"!{proto_directory}/**/*_rbt_web.ts"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-reboot_python` generated files.
            f"!{proto_directory}/**/*_rbt.py"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-python` generated files.
            f"!{proto_directory}/**/*_pb2.py"
            for proto_directory in generate_args.proto_directories
        ] + [
            # Exclude `protoc-gen-grpc-python` generated files.
            f"!{proto_directory}/**/*_pb2_grpc.py"
            for proto_directory in generate_args.proto_directories
        ]
        needs_proto_compile = True
        proto_compile = functools.partial(
            generate_direct,
            generate_args,
            generate_argv_after_dash_dash,
            generate_parser,
            subprocesses,
        )

    # Set all the environment variables that
    # 'rebootdev.aio.Application' will be looking for.
    #
    # We make a copy of the environment so that we don't change
    # our environment variables which might cause an issue.
    env = os.environ.copy()

    env[ENVVAR_RBT_DEV] = 'true'

    if args.name is not None:
        env[ENVVAR_RBT_NAME] = args.name
        # Use a state directory specific to the application name. For some
        # applications there may be multiple servers, each with their own
        # subdirectory.
        env[ENVVAR_RBT_STATE_DIRECTORY] = str(
            dot_rbt_dev_directory(args, parser) / args.name
        )

    if args.secrets_directory is not None:
        env[ENVVAR_RBT_SECRETS_DIRECTORY] = args.secrets_directory

    health_check_task: Optional[asyncio.Task] = None

    if os.environ[ENVVAR_LOCAL_ENVOY_MODE] == 'docker':
        # Check if Docker is running and can access the Envoy proxy image. Fail
        # otherwise.
        await check_docker_status(subprocesses)
    env[ENVVAR_REBOOT_LOCAL_ENVOY] = 'true'

    health_check_task = asyncio.create_task(
        _check_local_envoy_status(
            port=args.port or DEFAULT_LOCAL_ENVOY_PORT,
            terminate_after_health_check=args.terminate_after_health_check or
            False,
            application_started_event=application_started_event,
            use_localhost_direct=args.use_localhost_direct,
            tls_certificate=args.tls_certificate,
            root_certificate=args.tls_root_certificate,
            tracing=tracing,
        ),
        name=f'_check_local_envoy_status(...) in {__name__}',
    )
    background_command_tasks.append(health_check_task)

    env[ENVVAR_REBOOT_LOCAL_ENVOY_PORT] = str(
        args.port or DEFAULT_LOCAL_ENVOY_PORT
    )

    try:
        validate_num_servers(args.servers, "servers")
    except InputError as e:
        terminal.fail(f"Invalid `--servers` value: {e}")
    env[ENVVAR_RBT_SERVERS] = str(args.servers)

    if args.nodejs:
        env[ENVVAR_RBT_NODEJS] = 'true'

        # Also pass the `--enable-source-maps` option to `node` so
        # that we get better debugging experience with stacks.
        if "NODE_OPTIONS" in env:
            env["NODE_OPTIONS"] += " --enable-source-maps"
        else:
            env["NODE_OPTIONS"] = "--enable-source-maps"

        # Also set env to 'development' unless it's already been set
        # as this will make sure that (a) Node.js will consume a
        # `.env.development` and (b) it will do module resolution the
        # same way that we do via `esbuild` since we set `conditions:
        # ["development"]` (see reboot/nodejs/rbt-esbuild.ts).
        if "NODE_ENV" not in env:
            env["NODE_ENV"] = "development"

    env[ENVVAR_RBT_EFFECT_VALIDATION] = enum_value(
        args,
        'effect_validation',
        EffectValidation,
    ).name

    if args.api_key is not None:
        env[ENVVAR_RBT_CLOUD_API_KEY] = args.api_key
    env[ENVVAR_RBT_CLOUD_URL] = args.cloud_url

    if tracing == Tracing.JAEGER:
        # TODO: dynamic port. See comment in `_run_jaeger()`.
        env[OTEL_EXPORTER_OTLP_TRACES_ENDPOINT] = "localhost:4317"
        env[OTEL_EXPORTER_OTLP_TRACES_INSECURE] = "true"

    # Also include all environment variables from '--env='.
    for (key, value) in args.env or []:
        env[key] = value

    # If 'PYTHONPATH' is not explicitly set, we'll set it to the
    # specified generated code directory.
    if 'PYTHONPATH' not in env and generate_python_directory is not None:
        pythonpath = generate_python_directory
        for proto_directory in generate_proto_directories or []:
            pythonpath = pythonpath + os.pathsep + proto_directory
        env['PYTHONPATH'] = pythonpath

    if not args.chaos:
        # When running with '--terminate-after-health-check', we
        # would love to be consistent in the output we produce to be able to
        # test it.
        no_chaos_monkey = no_chaos_monkeys[
            0] if args.terminate_after_health_check else random.choice(
                no_chaos_monkeys
            )
        terminal.warn(
            '\n' + no_chaos_monkey + '\n'
            'You Have Disabled Chaos Monkey! (see --chaos)\n'
            '\n'
            'Only You (And Chaos Monkey) Can Prevent Bugs!'
            '\n'
        )

    # Bool used to steer the printing. i.e., are we starting or restarting
    # the application?
    first_start = True

    # Optional delay, used for inducing chaos with a delay.
    delay: Optional[int] = None

    # Variables used for auto transpiling and bundling TypeScript if
    # given a `.ts` file.
    ts_input_paths: list[str] = []
    bundle: Optional[Path] = None

    while True:
        if delay is not None:
            await asyncio.sleep(delay)
            delay = None

        # Determine the appropriate verb.
        start_verb = "Starting" if first_start else "Restarting"
        if args.name is None:
            terminal.warn(
                f'{start_verb} an ANONYMOUS application; to reuse state '
                'across application restarts use --name'
                '\n'
            )
        else:
            terminal.info(
                f'{start_verb} application with name "{args.name}"...'
                '\n'
            )
        first_start = False

        async with watcher.watch(proto_globs) as protos_event_task:

            if needs_proto_compile:
                assert proto_compile is not None
                if await proto_compile() != 0:
                    # Failed to compile: wait for a relevant input to have changed.
                    terminal.warn(
                        '\n'
                        'Protoc compilation failed '
                        '... waiting for modification'
                        '\n'
                    )
                    completed = await _wait_for_first_completed(
                        protos_event_task,
                        rc_file_event_task,
                    )
                    if rc_file_event_task in completed:
                        return None
                    terminal.info(
                        '\n'
                        'Application modified; restarting ... '
                        '\n'
                    )
                    continue

                # Else, successfully compiled.
                needs_proto_compile = False

            # NOTE: we don't want to watch `application` yet as it
            # might be getting generated if we're using `transpile`.
            async with watcher.watch(args.watch or []) as watch_event_task:

                # Transpile TypeScript if requested.
                if args.transpile is not None:
                    terminal.info(
                        f'Transpiling TypeScript with `{args.transpile}` ...'
                        '\n',
                    )
                    async with subprocesses.shell(
                        f'{args.transpile}'
                    ) as process:
                        await process.wait()
                        if process.returncode != 0:
                            terminal.warn(
                                f'`{args.transpile}` failed with exit status {process.returncode} '
                                '... waiting for modification'
                                '\n'
                            )
                            completed = await _wait_for_first_completed(
                                watch_event_task,
                                protos_event_task,
                                rc_file_event_task,
                            )
                            if rc_file_event_task in completed:
                                return None
                            if protos_event_task in completed:
                                needs_proto_compile = True
                            terminal.info(
                                '\n'
                                'Application modified; restarting ... '
                                '\n'
                            )
                            continue

                if auto_transpilation:
                    bundle = await auto_transpile(
                        subprocesses,
                        application,
                        args.name or "anonymous",
                        ts_input_paths,
                    )

                    if bundle is None:
                        if len(ts_input_paths) == 0:
                            # Exit because we don't know what to watch
                            # for modification!
                            terminal.fail(
                                '\n'
                                'Transpilation failed, please fix the errors above and re-run `rbt dev`'
                            )

                        # Wait for file modification.
                        #
                        # TODO: are there corner cases here where,
                        # e.g., a new file in a new directory is the
                        # only file with a transpilation error but
                        # since it wasn't part of the previous
                        # `ts_input_paths` we won't watch it and thus
                        # wait forever? Is `watcher.watch()`
                        # sophisticated enough to look for all sub
                        # directories or do we need to explicitly add
                        # '**' style globs in this case (and only this
                        # case to reduce load on the OS) to make sure
                        # we see all modifications?
                        terminal.warn(
                            '\n'
                            'Transpilation failed ... waiting for modification\n'
                            '\n'
                        )

                        # Watch all previously watched files for
                        # changes as we don't know which file
                        # might have add the transpilation issue.
                        async with watcher.watch(
                            ts_input_paths
                        ) as application_event_task:
                            completed = await _wait_for_first_completed(
                                application_event_task,
                                watch_event_task,
                                protos_event_task,
                                rc_file_event_task,
                            )

                            if application_event_task in completed:
                                return None
                            if rc_file_event_task in completed:
                                return None
                            if protos_event_task in completed:
                                needs_proto_compile = True

                            terminal.info(
                                '\n'
                                'Application modified; restarting ... '
                                '\n'
                            )
                            continue

                def have_rc_file_or_protos_or_watch_event():
                    """Helper for checking if we have an event that may warrant returning
                    or continuing the outer loop."""
                    return (
                        rc_file_event_task is not None and
                        rc_file_event_task.done()
                    ) or (
                        protos_event_task is not None and
                        protos_event_task.done()
                    ) or (
                        watch_event_task is not None and
                        watch_event_task.done()
                    )

                # It's possible that the application may get deleted
                # and then (re)created by a build system so rather
                # than fail if we can't find it we'll retry but print
                # out a warning every ~5 seconds (which corresponds
                # to ~10 retries since we sleep for 0.5 seconds
                # between each retry).
                retries = 0
                while (
                    not await aiofiles.os.path.isfile(application) and
                    not have_rc_file_or_protos_or_watch_event()
                ):
                    if retries != 0 and retries % 10 == 0:
                        terminal.warn(
                            f"Missing application at '{application}' "
                            "(is it being rebuilt?)"
                        )
                    retries += 1
                    await asyncio.sleep(0.5)

                # While waiting for a missing application it's
                # possible an event fired that might be responsible
                # for creating the application, e.g., running `tsc`.
                if (
                    rc_file_event_task is not None and
                    rc_file_event_task.done()
                ):
                    return None
                elif (
                    protos_event_task is not None and protos_event_task.done()
                ):
                    needs_proto_compile = True
                    continue
                elif (
                    watch_event_task is not None and watch_event_task.done()
                ):
                    continue

                if not await aiofiles.os.path.isfile(application):
                    terminal.fail(f"Missing application at '{application}'")

                launcher: Optional[str] = None
                if args.python:
                    launcher = sys.executable
                else:
                    launcher = 'node'

                assert not auto_transpilation or bundle is not None

                # TODO(benh): catch just failure to create the subprocess
                # so that we can either try again or just listen for a
                # modified event and then try again.
                async with watcher.watch(
                    [application] if not auto_transpilation else ts_input_paths
                ) as application_event_task, _run(
                    application if not auto_transpilation else str(bundle),
                    env=env,
                    launcher=launcher,
                    subprocesses=subprocesses,
                    application_started_event=application_started_event,
                ) as process:
                    process_wait_task = asyncio.create_task(
                        process.wait(),
                        name=f'process.wait() in {__name__}',
                    )

                    induce_chaos_task = asyncio.create_task(
                        induce_chaos(),
                        name=f'induce_chaos() in {__name__}',
                    )

                    chaos_task: Optional[asyncio.Task] = None
                    if args.chaos:
                        chaos_task = asyncio.create_task(
                            asyncio.sleep(600),
                            name=f'asyncio.sleep(600) in {__name__}',
                        )

                    completed = await _wait_for_first_completed(
                        application_event_task,
                        watch_event_task,
                        protos_event_task,
                        process_wait_task,
                        induce_chaos_task,
                        health_check_task,
                        chaos_task,
                        rc_file_event_task,
                    )

                    # Cancel tasks regardless of what completed
                    # first as we won't ever wait on them.
                    induce_chaos_task.cancel()
                    if chaos_task:
                        chaos_task.cancel()

                    expunge_task: Optional[asyncio.Task] = None
                    if rc_file_event_task in completed:
                        return None
                    elif process_wait_task in completed:
                        expunge_task = _handle_application_exit(
                            args,
                            parser,
                            application_exit_code=process_wait_task.result(),
                        )
                        # NOTE: we'll wait for a file system event or expunge
                        # below to signal a modification!
                    elif (
                        (induce_chaos_task in completed) or
                        (args.chaos and chaos_task in completed)
                    ):
                        terminal.warn(
                            '\n'
                            'Chaos Monkey Is Restarting Your Application'
                            '\n' + random.choice(monkeys) + '\n'
                            '... disable via --no-chaos if you must'
                            '\n'
                            '\n'
                        )
                        if induce_chaos_task in completed:
                            delay = await induce_chaos_task
                        continue
                    elif health_check_task in completed:
                        # The health check passed, and we were asked to exit
                        # after a health check (otherwise the health check task
                        # continues to run more health checks).
                        return 0

                    # Wait for a watch task to fire.
                    # TODO: If:
                    # 1. user changes a file they asked us to watch,
                    #    causing this wait to return
                    # 2. proto files then additionally change before we
                    #    re-enter the proto watch above
                    # ... then we would miss that event.
                    # See https://github.com/reboot-dev/mono/issues/2940
                    completed = await _wait_for_first_completed(
                        application_event_task,
                        watch_event_task,
                        protos_event_task,
                        rc_file_event_task,
                        expunge_task,
                    )

                    # Cancel tasks regardless of what completed
                    # first as we won't ever wait on them.
                    if expunge_task:
                        expunge_task.cancel()

                    if rc_file_event_task in completed:
                        return None
                    if protos_event_task in completed:
                        needs_proto_compile = True

                    if expunge_task not in completed:
                        terminal.info(
                            '\n'
                            'Application modified; restarting ... '
                            '\n'
                        )


async def _expunge(
    args,
    parser: ArgumentParser,
    *,
    confirm: bool,
) -> None:

    def ask_for_confirmation(question: str) -> bool:
        yes_answers = ['y', 'yes']
        terminal.info(question)
        answer = input()
        return answer.lower() in yes_answers

    dot_rbt_dev = dot_rbt_dev_directory(args, parser)
    if confirm and args.yes is False:
        terminal.info(f"About to expunge '{args.name}' from '{dot_rbt_dev}'")
        if not ask_for_confirmation(
            "Do you want to continue? [y/n] (Tip: Use the --yes flag to skip this prompt):"
        ):
            terminal.fail("Expunge cancelled")

    application_directory = dot_rbt_dev / args.name
    if not application_directory.exists():
        terminal.warn(
            f"Could not find application with name '{args.name}' (looked in "
            f"'{application_directory}'); did not expunge"
        )
        return
    await asyncio.to_thread(shutil.rmtree, application_directory)
    terminal.info(f"Application '{args.name}' has been expunged.\n")


async def dev_expunge(
    args: argparse.Namespace,
    parser: ArgumentParser,
) -> None:
    """
    Delete the sidecar state directory for the application with the given name.
    """

    await _expunge(args, parser, confirm=True)
