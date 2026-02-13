import asyncio
import json
import logging
import tempfile
import urllib.request
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from log.log import get_logger
from pathlib import Path
from reboot.server.local_envoy import LocalEnvoy
from rebootdev.aio.types import ApplicationId
from typing import Optional

logger = get_logger(__name__)
logger.setLevel(logging.WARNING)


class ExecutableLocalEnvoy(LocalEnvoy):

    def __init__(
        self,
        *,
        public_port: int,
        application_id: ApplicationId,
        file_descriptor_set: FileDescriptorSet,
        use_tls: bool,
        certificate: Optional[Path],
        key: Optional[Path],
        debug_mode: bool,
    ):
        self._requested_public_port = public_port
        self._public_port = 0
        self._trusted_port = 0
        self._admin_port = 0
        self._container_id: Optional[str] = None
        self._debug_mode = debug_mode
        if self._debug_mode:
            # TODO(rjh): it's not elegant that we're setting this for the whole
            #            module, although in practice it's not a big deal.
            logger.setLevel(logging.DEBUG)

        # Generate envoy config and write it to temporary files that get
        # cleaned up on .stop(). We copy all files without their metadata
        # to ensure that they are readable by the envoy user.
        self._tmp_envoy_dir = tempfile.TemporaryDirectory()

        # Envoy as a local executable observes the same filesystem that this
        # code does, so the output dir and observed dir are the same.
        self._envoy_dir_path = Path(self._tmp_envoy_dir.name)

        super().__init__(
            # The admin port is for debugging, so limit it to localhost.
            admin_listen_host='127.0.0.1',
            # Since there may be multiple Envoys running on this same host, we
            # must pick the admin port dynamically to avoid conflicts.
            admin_port=0,
            # Envoy will run on the same host as this code, so the xDS server
            # only needs to listen on localhost.
            xds_listen_host='127.0.0.1',
            xds_connect_host='127.0.0.1',
            trusted_host='127.0.0.1',
            trusted_port=0,  # Pick dynamically to avoid collisions.
            # The port we run Envoy on is the port the user has requested to
            # send traffic to.
            public_port=self._requested_public_port,
            application_id=application_id,
            file_descriptor_set=file_descriptor_set,
            use_tls=use_tls,
            observed_dir=Path(self._tmp_envoy_dir.name),
        )

        self._envoy_config_path = self._write_envoy_dir(
            # A local executable has the same view of the filesystem as this
            # code does, so the output dir and observed dir are the same.
            output_dir=Path(self._tmp_envoy_dir.name),
            certificate=certificate,
            key=key,
        )

        self._process: Optional[asyncio.subprocess.Process] = None

    @property
    def public_port(self) -> int:
        """
        Returns the public port of the Envoy proxy.
        """
        if self._public_port == 0:
            raise ValueError(
                'ExecutableLocalEnvoy.start() must be called before you can '
                'get the public port'
            )
        return self._public_port

    @property
    def trusted_port(self) -> int:
        """
        Returns the trusted port of the Envoy proxy.
        """
        if self._trusted_port == 0:
            raise ValueError(
                'ExecutableLocalEnvoy.start() must be called before you can '
                'get the trusted port'
            )
        return self._trusted_port

    async def _start(self):
        # We have Envoy write its logs to a file. This has two benefits:
        # 1. Unlike when writing to a stream like `stdout`, we can't
        #    forget to consume the output and have Envoy block trying to
        #    write to a full buffer.
        # 2. If we want to investigate issues with Envoy, we can look at
        #    the log file, whereas `stdout` isn't.
        #
        # The log file will be a temporary file, and we don't make any
        # special effort to rotate the log file or clean it up after
        # Envoy exits. This simplifies debugging, but means that we rely
        # on Envoy not writing too much log data. In practice Envoy's
        # log is essentially quiet after startup, unless manually set to
        # log at a higher log level.
        logfile = tempfile.NamedTemporaryFile(
            mode='w+b',
            prefix='envoy-',
            suffix='.log',
            delete=False,
        )
        self._logfile_path = Path(logfile.name)
        logger.debug(f"Envoy log file path: {self._logfile_path}")
        logfile.close()  # Close so Envoy can write to it.

        # Create a file for Envoy to write its admin address to.
        admin_address_file = tempfile.NamedTemporaryFile(
            mode='w+',
            prefix='envoy-admin-',
            suffix='.txt',
            delete=False,
        )
        self._admin_address_path = Path(admin_address_file.name)
        admin_address_file.close()

        command = [
            'envoy',
            '-c',
            str(self._envoy_config_path),
            '--log-path',
            str(self._logfile_path),
            # Write admin address to a file, so we can know which
            # dynamic port was picked.
            '--admin-address-path',
            str(self._admin_address_path),
            # We need to disable hot restarts in order to run multiple
            # proxies at the same time otherwise they will clash
            # trying to create a domain socket. See
            # https://www.envoyproxy.io/docs/envoy/latest/operations/cli#cmdoption-base-id
            # for more details.
            '--disable-hot-restart',
        ]

        if self._debug_mode:
            command.extend([
                '--log-level',
                'debug',
            ])

        logger.debug(f"Envoy command:\n```\n{' '.join(command)}\n```")
        logger.debug(
            f"Envoy config:\n```\n{self._envoy_config_path.read_text()}\n```"
        )

        self._process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.STDOUT,
            stdout=asyncio.subprocess.DEVNULL,
            # Envoy must have its configuration directory as its working dir to
            # let our Lua code find the libraries that we've copied into that
            # directory.
            cwd=self._tmp_envoy_dir.name,
        )

        # We must now determine the admin port that Envoy has come up on
        # (since it picked it dynamically). The `--admin-address-path`
        # parameter makes Envoy write its admin address to a file when
        # ready.
        logger.debug("Waiting for Envoy admin address file...")
        while True:
            # Check if process has exited.
            if self._process.returncode is not None:
                raise RuntimeError(
                    "Envoy process ended before admin address was found"
                )

            try:
                admin_address = self._admin_address_path.read_text().strip()
                if admin_address:
                    # Format is "host:port", e.g. "127.0.0.1:12345".
                    self._admin_port = int(admin_address.split(':')[-1])
                    logger.debug(f"Found admin port: {self._admin_port}")
                    break
            except (FileNotFoundError, ValueError):
                pass

            # File not yet written or empty, wait a bit.
            await asyncio.sleep(0.01)

        # By calling the admin endpoint's `/listeners` API we can
        # determine the picked ports for both the public and trusted
        # listeners.
        logger.debug("Admin address found. Querying for listeners...")

        def _fetch_listeners(url: str) -> dict:
            """Fetch listeners data from Envoy admin API.

            This is a blocking call, but we run it in a thread to avoid
            blocking the event loop. We use `urllib` instead of
            `aiohttp` because `aiohttp` has a bug where it fails to
            parse HTTP responses from Envoy's admin interface (see
            https://github.com/aio-libs/aiohttp/issues/7165); instead of
            tolerating the extra whitespace in the response, `aiohttp`
            raises an exception.
            """
            with urllib.request.urlopen(url) as response:
                return json.loads(response.read().decode())

        listeners_url = f"http://127.0.0.1:{self._admin_port}/listeners?format=json"
        while True:
            try:
                listeners_data = await asyncio.to_thread(
                    _fetch_listeners, listeners_url
                )
            except Exception as e:
                # We've observed cases where Envoy isn't ready to serve
                # this endpoint immediately after starting up, so we
                # retry until it works.
                logger.debug(
                    f"Listeners endpoint returned error {e}, will retry..."
                )
                await asyncio.sleep(0.1)
                continue

            # Parse the listener addresses to extract the ports.
            for listener_state in listeners_data.get("listener_statuses", []):
                listener_name = listener_state.get("name", "")
                local_address = listener_state.get("local_address", {})
                socket_address = local_address.get("socket_address", {})
                port = socket_address.get("port_value", 0)

                if listener_name == "public":
                    self._public_port = port
                    logger.debug(f"Found public port: {self._public_port}")
                elif listener_name == "trusted":
                    self._trusted_port = port
                    logger.debug(f"Found trusted port: {self._trusted_port}")

            # Check if we found both listeners.
            if self._public_port != 0 and self._trusted_port != 0:
                break

            # If not found yet, wait and try again.
            logger.debug("Listeners not ready yet, will retry...")
            await asyncio.sleep(0.1)

        logger.info(f"Envoy admin port: {self._admin_port}")
        logger.info(f"Envoy public port: {self._public_port}")
        logger.info(f"Envoy trusted port: {self._trusted_port}")

        async def _output_logs():
            """Tail the log file and output lines in debug mode."""
            with open(self._logfile_path, 'r') as log_file:
                while True:
                    assert self._process is not None

                    line = log_file.readline()
                    if line:
                        print(line, end='')
                    else:
                        # Check if process has exited.
                        if self._process.returncode is not None:
                            # Read any remaining lines before exiting.
                            for remaining_line in log_file:
                                print(remaining_line, end='')
                            break
                        # No new content yet, wait a bit.
                        await asyncio.sleep(0.1)

        if self._debug_mode:
            self._output_logs_task = asyncio.create_task(
                _output_logs(),
                name=f'_output_logs() in {__name__}',
            )

    async def _stop(self):
        assert self._process is not None
        try:
            self._process.terminate()
            # Wait for the process to terminate, but don't wait too long.
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                # The process still hasn't gracefully terminated. Kill the
                # process. There's no way to ignore that signal, so we can
                # safely do a non-timeout-based `await` for it to finish.
                self._process.kill()
                await self._process.wait()
        except ProcessLookupError:
            # The process already exited. That's fine.
            pass
