import aiofiles.os
import asyncio
import math
import os
import shutil
import sys
from pathlib import Path
from reboot.cli import terminal
from reboot.cli.detect_cores import detect_cores
from reboot.cli.dev import (
    _check_common_args,
    _set_tls_env_or_fail,
    add_application_options,
    check_docker_status,
    try_and_become_child_subreaper_on_linux,
)
from reboot.cli.directories import (
    add_working_directory_options,
    use_working_directory,
)
from reboot.cli.rc import (
    ArgumentParser,
    ArgumentParserFactory,
    StoreOnceIncludingEnvvarsActionBase,
)
from reboot.cli.subprocesses import Subprocesses
from reboot.cli.transpile import auto_transpile
from reboot.controller.plan_makers import validate_num_servers
from reboot.controller.settings import (
    ENVVAR_PORT,
    ENVVAR_RBT_PORT,
    USER_CONTAINER_GRPC_PORT,
)
from rebootdev.aio.exceptions import InputError
from rebootdev.run_environments import on_cloud
from rebootdev.settings import (
    ENVOY_VERSION,
    ENVVAR_LOCAL_ENVOY_MODE,
    ENVVAR_LOCAL_ENVOY_USE_TLS,
    ENVVAR_RBT_EFFECT_VALIDATION,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_NODEJS,
    ENVVAR_RBT_SECRETS_DIRECTORY,
    ENVVAR_RBT_SERVE,
    ENVVAR_RBT_SERVERS,
    ENVVAR_RBT_STATE_DIRECTORY,
    ENVVAR_REBOOT_LOCAL_ENVOY,
    ENVVAR_REBOOT_LOCAL_ENVOY_PORT,
    REBOOT_STATE_DIRECTORY,
)
from typing import Optional


class StoreOnceRebootCloudSpecificFlags(StoreOnceIncludingEnvvarsActionBase):
    """Helper action that ensures that only one instance of a flag that is
    not meant to be repeated is present.

    Reboot Cloud sets some default values for certain flags itself, and there
    is no way to override them. This action checks that the user does not
    specify these flags when running on Reboot Cloud.
    """

    REBOOT_CLOUD_DEFAULT_VALUES_BY_FLAG = {
        'state_directory': REBOOT_STATE_DIRECTORY,
        'port': str(USER_CONTAINER_GRPC_PORT),
    }

    ENVIRONMENT_VARIABLES_BY_FLAG = {
        'state_directory': [ENVVAR_RBT_STATE_DIRECTORY],
        'port': [ENVVAR_PORT, ENVVAR_RBT_PORT],
    }

    CLOUD_ENVIRONMENT_VARIABLES = [ENVVAR_RBT_STATE_DIRECTORY, ENVVAR_PORT]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        if self._is_duplicate(namespace):
            parser.error(self._error())
        else:
            if on_cloud():
                # Check that the flag matches the default value on the Reboot
                # Cloud.
                env_var = self.ENVIRONMENT_VARIABLES_BY_FLAG[self.dest][0]
                error = self._check_cloud_env(env_var)
                if error is not None:
                    parser.error(error)

            self._mark_seen_and_store(namespace, values)

    def _error(self) -> str:
        if on_cloud():
            return self._cloud_flag_specified_error()
        else:
            return self._local_error()

    def _local_error(self) -> str:
        return (
            super()._error() + self._envvar_error_str(
                self.ENVIRONMENT_VARIABLES_BY_FLAG[self.dest]
            )
        )

    def _cloud_flag_specified_error(self) -> str:
        return (
            f"the flag '--{self.dest.replace('_', '-')}' is forbidden while "
            "using Reboot Cloud. The value is set to '"
            f"{self.REBOOT_CLOUD_DEFAULT_VALUES_BY_FLAG[self.dest]}' by "
            "default"
        )

    def _check_cloud_env(self, env_var: str) -> Optional[str]:
        """Check if the environment variable is set to the default value in the
        Reboot Cloud environment."""

        value = os.environ.get(env_var, None)
        if value is None:
            return f"Missing required environment variable: '{env_var}'"

        if value != self.REBOOT_CLOUD_DEFAULT_VALUES_BY_FLAG[self.dest]:
            return (
                f"Environment variable '{env_var}' is set to non-default value "
                f"'{value}'; this setting is unnecessary and unsupported on "
                f"Reboot Cloud. Unset '{env_var}' to run your application."
            )
        return None


async def _pick_envoy_mode(
    subprocesses: Subprocesses,
    env: dict[str, str],
) -> None:
    # Will we run Envoy inside a new Docker container, or can we run it as a
    # stand-alone program? Note that it's entirely possible that we are
    # already inside a Docker container, inside which we might run 'envoy'
    # as a stand-alone process.
    envoy_mode = 'docker' if shutil.which('envoy') is None else 'executable'
    env[ENVVAR_LOCAL_ENVOY_MODE] = envoy_mode

    if envoy_mode == 'docker':
        return await check_docker_status(subprocesses)

    async with subprocesses.exec(
        'envoy',
        '--version',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            terminal.fail(
                f"Could not use Envoy:\n"
                "\n"
                f"{stdout.decode() if stdout is not None else '<no output>'}"
            )

        # 'envoy --version' outputs something like:
        #  envoy  version:
        #  d79f6e8d453ee260e9094093b8dd31af0056e67b/1.30.2/Clean/RELEASE/BoringSSL
        if ENVOY_VERSION not in stdout.decode():
            terminal.fail(
                f"Expecting Envoy version '{ENVOY_VERSION}', but found "
                f"'{stdout.decode()}'. Are you using the right Reboot "
                "base image in Docker?"
            )


def register_serve(parser: ArgumentParser):
    add_working_directory_options(parser.subcommand('serve run'))

    add_application_options(parser.subcommand('serve run'))

    parser.subcommand('serve run').add_argument(
        '--state-directory',
        type=str,
        help='path to directory for durably storing application state',
        action=StoreOnceRebootCloudSpecificFlags,
        # Don't fail if this flag is absent when `rbt serve` is run in
        # the Reboot Cloud because not only is the state directory not
        # required in that case but if a user specifies it we fail
        # because it should not be set.
        required=not on_cloud(),
        environment_variables=[ENVVAR_RBT_STATE_DIRECTORY],
    )

    parser.subcommand('serve run').add_argument(
        '--servers',
        environment_variables=[ENVVAR_RBT_SERVERS],
        type=int,
        help=(
            'the number of "servers" (serving processes) to spawn; defaults '
            'to the number of cores available.'
        ),
    )

    parser.subcommand('serve run').add_argument(
        '--name',
        type=str,
        help="name of application, used to differentiate within "
        "'--state-directory'",
        required=True,
    )

    parser.subcommand('serve run').add_argument(
        '--port',
        type=int,
        help='port to listen on',
        required=True,
        action=StoreOnceRebootCloudSpecificFlags,
        environment_variables=[
            # Many platforms set a `PORT` environment variable to communicate
            # the desired public port, including Reboot Cloud, Fly.io,
            # Render.com, [...].
            ENVVAR_PORT,
            # All of our other flag-setting environment variables are prefixed
            # with "RBT_", so offer an "RBT_PORT" too for consistency. Note that
            # we will still check that this flag is set only once, including via
            # environment variables.
            ENVVAR_RBT_PORT,
        ],
    )

    parser.subcommand('serve run').add_argument(
        '--tls',
        type=str,
        choices=['own-certificate', 'external'],
        required=True,
        help="how your application will provide secure TLS connections; set "
        "'own-certificate' if you'd like to provide your own TLS certificate, "
        "or set 'external' if this `rbt serve` is deployed behind an external "
        "load balancer that already does TLS termination.",
    )

    parser.subcommand('serve run').add_argument(
        '--tls-certificate',
        type=str,
        help=
        "path to TLS certificate to use when setting '--tls=own-certificate'",
    )

    parser.subcommand('serve run').add_argument(
        '--tls-key',
        type=str,
        help="path to TLS key to use when setting '--tls=own-certificate'",
    )


def servers_from_cores() -> int:
    num_cores = detect_cores(flag_name='--servers')

    # The number of servers may only be powers of two, so
    # round down to the nearest power of two by taking the log2,
    # flooring, and then re-exponentiating.
    return 2**int(math.log2(num_cores))


async def serve_run(
    args,
    parser: ArgumentParser,
    parser_factory: ArgumentParserFactory,
) -> int:
    _check_common_args(args)

    # Determine the working directory and move into it.
    with use_working_directory(args, parser, verbose=True):

        # If on Linux try and become a child subreaper so that we can
        # properly clean up all processes descendant from us!
        try_and_become_child_subreaper_on_linux()

        # Use `Subprocesses` to manage all of our subprocesses for us.
        subprocesses = Subprocesses()

        application = os.path.abspath(args.application)

        # Set all the environment variables that
        # 'rebootdev.aio.Application' will be looking for.
        #
        # We make a copy of the environment so that we don't change
        # our environment variables which might cause an issue.
        env = os.environ.copy()

        env[ENVVAR_RBT_SERVE] = 'true'

        assert args.name is not None

        env[ENVVAR_RBT_NAME] = args.name

        if args.state_directory is not None:
            env[ENVVAR_RBT_STATE_DIRECTORY] = args.state_directory

        if args.secrets_directory is not None:
            env[ENVVAR_RBT_SECRETS_DIRECTORY] = args.secrets_directory

        # Pick the mode we'll run Envoy in: either as a stand-alone
        # program or inside a Docker container.
        await _pick_envoy_mode(subprocesses, env)

        env[ENVVAR_REBOOT_LOCAL_ENVOY] = 'true'

        env[ENVVAR_REBOOT_LOCAL_ENVOY_PORT] = str(args.port)

        servers = (
            args.servers if args.servers is not None else
            # NOTE: We call `servers_from_cores()` lazily so that a
            # user has the recourse of explicitly setting
            # `--servers` if it fails.
            servers_from_cores()
        )
        try:
            validate_num_servers(servers, "servers")
        except InputError as e:
            terminal.fail(f"Invalid `--servers` value: {e}")
        env[ENVVAR_RBT_SERVERS] = str(servers)

        # Check that the TLS configuration they gave us is valid and set the
        # `LocalEnvoy` environment variables.
        if args.tls == 'own-certificate':
            if not args.tls_key or not args.tls_certificate:
                terminal.fail(
                    "When setting '--tls=own-certificate', flags "
                    "'--tls-certificate' and '--tls-key' must also be set"
                )

            await _set_tls_env_or_fail(args)

        else:
            assert args.tls == 'external'
            if args.tls_key or args.tls_certificate:
                terminal.fail(
                    "When setting '--tls=external', flags '--tls-certificate' "
                    "and '--tls-key' cannot be set"
                )
            env[ENVVAR_LOCAL_ENVOY_USE_TLS] = "False"

        env[ENVVAR_RBT_EFFECT_VALIDATION] = 'DISABLED'

        # Also include all environment variables from '--env='.
        for (key, value) in args.env or []:
            env[key] = value

        # If 'PYTHONPATH' is not explicitly set, we'll set it to the
        # specified generated code directory. We want to get the directory from
        # 'rbt generate' flags, which user might have specified in '.rbtrc'.
        if 'PYTHONPATH' not in env and parser.dot_rc is not None:
            generate_parser = parser_factory(['rbt', 'generate'])
            generate_args, _ = generate_parser.parse_args()
            if generate_args.python is not None:
                env['PYTHONPATH'] = generate_args.python

        if not await aiofiles.os.path.isfile(application):
            terminal.fail(f"Missing application at '{application}'")

        auto_transpilation = Path(application).suffix == '.ts'

        bundle: Optional[Path] = None

        if auto_transpilation:
            bundle = await auto_transpile(
                subprocesses,
                application,
                args.name,
                [],
            )

            if bundle is None:
                terminal.fail(
                    '\n'
                    'Transpilation failed, please fix the errors above to run `rbt serve`'
                )

        assert not auto_transpilation or bundle is not None

        if args.nodejs:
            env[ENVVAR_RBT_NODEJS] = 'true'

            # Also pass the `--enable-source-maps` option to `node` so
            # that we get better debugging experience with stacks.
            if "NODE_OPTIONS" in env:
                env["NODE_OPTIONS"] += " --enable-source-maps"
            else:
                env["NODE_OPTIONS"] = "--enable-source-maps"

        launcher = sys.executable if args.python else 'node'

        args = [
            launcher,
            application if not auto_transpilation else str(bundle),
        ]

        async with subprocesses.exec(*args, env=env) as process:
            return await process.wait()
