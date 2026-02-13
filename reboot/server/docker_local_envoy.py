import asyncio
import json
import logging
import os
import rebootdev.aio.signals as signals
import rebootdev.aio.tracing
import signal
import socket
import subprocess
import tempfile
import threading
import traceback
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from log.log import get_logger
from pathlib import Path
from reboot.routing.envoy_config import ServerInfo
from reboot.server.local_envoy import LocalEnvoy
from rebootdev.aio.types import ApplicationId
from rebootdev.settings import (
    DEFAULT_INSECURE_PORT,
    DEFAULT_SECURE_PORT,
    DEFAULT_TRUSTED_PORT,
    ENVOY_PROXY_IMAGE,
    ENVVAR_LOCAL_ENVOY_DEBUG,
    EVERY_LOCAL_NETWORK_ADDRESS,
    REBOOT_DISCORD_URL,
    REBOOT_GITHUB_ISSUES_URL,
)
from typing import Optional

logger = get_logger(__name__)
logger.setLevel(logging.WARNING)

DOCKERIZED_ENVOY_DIR = '/etc/envoy'
# The number of Envoy log lines we'll keep in memory for debugging purposes.
MAX_LOG_LINES = 100

# We open an admin port for Envoy to facilitate debugging. We pick 9901 since
# it's a typical choice (AWS uses it) that's similar to the ports Reboot
# already uses.
ENVOY_ADMIN_PORT = 9901


async def _cancel_task(task: asyncio.Task) -> None:
    if task.done():
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


class DockerLocalEnvoy(LocalEnvoy):

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
        local_envoy_nanny_path = self._envoy_nanny_path()

        # Not using 'aiofiles' here because we're not in an async context yet.
        if not os.path.isfile(local_envoy_nanny_path):
            raise FileNotFoundError(
                "Expecting 'local_envoy_nanny' executable at path "
                f"'{local_envoy_nanny_path}'"
            )

        self._published_public_port = public_port
        self._published_trusted_port = 0
        self._container_id: Optional[str] = None
        self._debug_mode = debug_mode

        # Generate envoy config and write it to temporary files that get
        # cleaned up on .stop(). We copy all files without their metadata
        # to ensure that they are readable by the envoy user.
        self._tmp_envoy_dir = tempfile.TemporaryDirectory()

        # These are the directories that Envoy will observe these files in.
        self._use_tls = use_tls

        # The ports on which Envoy will receive traffic. Since we're
        # starting a new Docker container, the published port visible to
        # the user may be different.
        self._public_port = DEFAULT_SECURE_PORT if self._use_tls else DEFAULT_INSECURE_PORT
        self._trusted_port = DEFAULT_TRUSTED_PORT

        super().__init__(
            # The admin port is available from anywhere when debugging.
            # Otherwise, limit it to the container itself.
            admin_listen_host='0.0.0.0' if self._debug_mode else '127.0.0.1',
            # Since this Envoy will have the Docker container all to itself, we
            # can pick a static port for the admin interface.
            admin_port=ENVOY_ADMIN_PORT,
            # The xDS server will run outside the Docker container, so it must
            # accept connections from the Docker container.
            xds_listen_host='0.0.0.0',
            xds_connect_host='host.docker.internal',
            # The trusted port will be accessed by the application
            # running outside the Docker container, so it must accept
            # traffic from outside its container. The port forwarding
            # logic in `docker run` will ensure that traffic to the
            # trusted port can only come from the host.
            trusted_host='0.0.0.0',
            # The Envoy will have the container all to itself, so we can
            # pick a static port for its trusted port as seen internal
            # to the container.
            trusted_port=self._trusted_port,
            public_port=self._public_port,
            observed_dir=Path(DOCKERIZED_ENVOY_DIR),
            application_id=application_id,
            file_descriptor_set=file_descriptor_set,
            use_tls=self._use_tls,
        )

        self._envoy_config_observed_path = self._write_envoy_dir(
            output_dir=Path(self._tmp_envoy_dir.name),
            certificate=certificate,
            key=key,
        )

        self._using_localhost_direct = self._use_tls and certificate is None

        # Indicator of whether or not we are stopping. Used at the
        # least by the nanny server thread to avoid spamming stderr
        # with exceptions when the server socket gets closed.
        self._stopping = False

        # Open a server socket that listens for connections from the
        # 'local_envoy_nanny' so that in the event our process is
        # killed abruptly the nanny will get an EOF (or error) and
        # send a SIGTERM to envoy which should stop the container.
        self._nanny_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._nanny_socket.bind((EVERY_LOCAL_NETWORK_ADDRESS, 0))

        # A background task that follows the logs of the Envoy container,
        # possibly forwarding them to the `self._unprocessed_log_lines`, and
        # handles container termination by (if needed) dumping some logs.
        self._follow_logs_and_handle_termination_task: Optional[asyncio.Task
                                                               ] = None

        # A list of the latest log lines from the Envoy container.
        self._latest_log_lines: list[str] = []

        # A queue containing log lines of the Envoy container, used to find the
        # Envoy admin endpoint in those logs. Once set to `None` it means we're
        # no longer interested in the logs for that purpose.
        self._unprocessed_log_lines: Optional[asyncio.Queue[str]
                                             ] = asyncio.Queue()

    def _envoy_nanny_path(self):
        return os.path.join(os.path.dirname(__file__), 'local_envoy_nanny')

    async def set_servers(self, servers: list[ServerInfo]):
        # When callers say "localhost", they mean "on the same host". But
        # unbeknownst to them, Docker containers don't have access to the host
        # by using "localhost", they have to use "host.docker.internal".
        for server in servers:
            if (
                server.address.host == 'localhost' or
                # The '0.0.0.0' address is also interpreted as
                # "localhost" when used as a target.
                server.address.host == EVERY_LOCAL_NETWORK_ADDRESS
            ):
                server.address.host = 'host.docker.internal'

        await super().set_servers(servers)

    @property
    def public_port(self) -> int:
        """
        Returns the public port of the Envoy proxy.
        """
        if self._published_public_port == 0:
            raise ValueError(
                'DockerLocalEnvoy.start() must be called before you can get the port'
            )
        return self._published_public_port

    @property
    def trusted_port(self) -> int:
        """
        Returns the trusted port of the Envoy proxy.
        """
        if self._published_trusted_port == 0:
            raise ValueError(
                'DockerLocalEnvoy.start() must be called before you can get the port'
            )
        return self._published_trusted_port

    @rebootdev.aio.tracing.function_span()
    async def _start(self) -> None:
        """Starts Envoy in a container on an unused port. The port started on
        is retrieved and saved.
        """

        # There is a race between when we've successfully started the
        # Envoy container and when we get the nanny started where a
        # container may get orphaned if our process gets terminated or
        # our coroutine is cancelled.
        #
        # We minimize the likelihood of an orphaned container here by
        # registering a cleanup handler to be executed when a SIGINT
        # or SIGTERM signal is raised that will stop the container (if
        # it was started).
        def stop_on_sigterm_sigquit_exception():
            if self._container_id is not None:
                # NOTE: deliberately not using `asyncio` in here as
                # this may be run within an interrupt handler.
                subprocess.run(
                    ['docker', 'stop', self._container_id],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

        with signals.cleanup_on_raise(
            [signal.SIGTERM, signal.SIGQUIT],
            handler=stop_on_sigterm_sigquit_exception,
        ):
            try:
                # Shell out to docker to start envoy and return a container id.
                await self._docker_run_envoy()

                # Now 'docker exec' the local envoy nanny inside the
                # container we just started with envoy.
                await self._exec_local_envoy_nanny()
            except:
                stop_on_sigterm_sigquit_exception()
                raise

    async def _stop(self):
        """Stop the Envoy container and cleans up temp files.
        """
        self._stopping = True
        if (
            self._container_id is None or
            self._follow_logs_and_handle_termination_task is None
        ):
            raise RuntimeError('.start() must be called before .stop()')

        try:
            docker_stop = await asyncio.create_subprocess_exec(
                'docker',
                'stop',
                self._container_id,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await docker_stop.wait()
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f'LocalEnvoy .stop() failed with: {str(e)}; '
                'this likely means that .start() was unsuccessful'
            ) from e
        finally:
            # Now that Envoy has been told to stop (or has already
            # stopped), we can wait for it to terminate. That will also
            # print logs if Envoy terminated with an error.
            await self._follow_logs_and_handle_termination_task

            # Remove the container now that we've captured its exit code
            # and logs. In debug mode, we skip removal to allow manual
            # inspection.
            if not self._debug_mode:
                docker_rm = await asyncio.create_subprocess_exec(
                    'docker',
                    'rm',
                    self._container_id,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    # It isn't expected for this command to fail; if it
                    # does, print the error to help us debug.
                    stderr=None,
                )
                await docker_rm.wait()
                if docker_rm.returncode != 0:
                    # Log but don't fail - container is somehow already
                    # gone, but even though that's unexpected it still
                    # leaves us in the state we want to be in.
                    logger.warning(
                        "Failed to remove Envoy container "
                        f"{self._container_id}. It may have already been "
                        "removed."
                    )

            self._tmp_envoy_dir.cleanup()
            self._nanny_socket.close()

    @rebootdev.aio.tracing.function_span()
    async def _docker_run_envoy(self) -> None:
        """Checks that Docker is installed and starts up Envoy in a container.
        """
        try:
            await DockerLocalEnvoy._async_check_output('docker', '--version')
        except Exception as e:
            raise RuntimeError(
                'Docker likely not installed; install docker to use LocalEnvoy: '
                f'`docker --version` failed with {str(e)}'
            )

        if self._published_public_port != 0:
            # We're coming up on a specific port. That means there's a chance we
            # could clash with an old, orphaned Envoy - if there's still one
            # around. Check if we have an orphaned Envoy from a previous run and
            # stop it first.
            #
            # This may stop an envoy that is running because a user has an `rbt
            # dev` (or `rbt serve`, etc) running, e.g., in a different terminal.
            orphaned_container_ids_lines = await DockerLocalEnvoy._async_check_output(
                'docker',
                'ps',
                '--filter',
                f'label=REBOOT_LOCAL_ENVOY_PORT={self._published_public_port}',
                '--format="{{.ID}}"',
            )

            orphaned_container_ids = [
                line.strip('"')
                for line in orphaned_container_ids_lines.split('\n')
            ]
            for orphaned_container_id in orphaned_container_ids:
                if orphaned_container_id == '':
                    continue

                docker_stop = await asyncio.create_subprocess_exec(
                    'docker',
                    'stop',
                    orphaned_container_id,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )

                try:
                    # Just wait for the process to exit; we don't care about the
                    # `returncode` and the container might also have terminated
                    # on it's own before we called stop!
                    await docker_stop.wait()
                finally:
                    # In the event we were cancelled or an exception was raised
                    # make sure the process has been terminated so we don't
                    # leave around any orphans (the exact thing this code is
                    # trying to clean up from!)
                    if docker_stop.returncode is None:
                        try:
                            docker_stop.terminate()
                            # Wait for the process to terminate, but don't wait
                            # too long.
                            try:
                                await asyncio.wait_for(
                                    docker_stop.wait(), timeout=5.0
                                )
                            except asyncio.TimeoutError:
                                # The process still hasn't gracefully
                                # terminated. Kill the process. There's no way
                                # to ignore that signal, so we can safely do a
                                # non-timeout-based `await` for it to finish.
                                logger.warning(
                                    "Killing orphaned Envoy container with id '"
                                    f"{orphaned_container_id}' failed, orphaned "
                                    "container may still be running"
                                )
                                docker_stop.kill()
                                await docker_stop.wait()
                        except ProcessLookupError:
                            # The process already exited. That's fine.
                            pass

        # NOTE: we pass each necessary file individually than a single
        # directory that includes all of the files because symlinks in
        # directories are not accessible from within a Docker container
        # and at least at the time of writing this comment Bazel
        # sometimes uses symlinks for files.

        local_envoy_run_command = [
            'docker',
            'run',
            '--label',
            f'REBOOT_LOCAL_ENVOY_PORT={self._published_public_port}',
            '--detach',
        ]

        # We don't use '--rm' because it creates a race condition:
        # the container may be removed before we can query its exit
        # code via 'docker wait'. Instead, we manually remove the
        # container in _stop() after we've captured the exit code.
        # In debug mode, we skip removal entirely to allow inspection.
        if self._debug_mode:
            print(
                '\n'
                '\n'
                '\n'
                f'{ENVVAR_LOCAL_ENVOY_DEBUG} is "true" and thus you are '
                'responsible for removing any Envoy containers! '
                '(Consider using `docker container prune`)'
                '\n'
                '\n'
                '\n'
            )

        local_envoy_run_command += [
            '-p'
            # IMPORTANT: the "127.0.0.1" prefix ensures that traffic to
            # the trusted port can only come from the (trusted) host
            # machine.
            f'127.0.0.1:{self._published_trusted_port}:{self._trusted_port}',
        ]

        if self._published_public_port != 0:
            local_envoy_run_command += [
                '-p'
                f'{self._published_public_port}:{self._public_port}',
            ]
        else:
            local_envoy_run_command += [
                # If user didn't specify a port, we'll let Docker pick a
                # random port and we'll ask Docker later. But to be able to
                # access the port from the host machine, we need to publish
                # all exposed ports, so we use '--expose' and '--publish-all'.
                # We will then ask Docker for the port that was mapped to
                # 'internal_port'.
                '--expose',
                f'{self._public_port}',
                '--publish-all',
            ]

        if self._debug_mode:
            # Make the admin port available outside the container. Use a
            # Docker-picked port so that even when there's multiple Envoys
            # running side-by-side they don't clash.
            local_envoy_run_command += [
                '--publish-all',
                '--expose',
                f'{ENVOY_ADMIN_PORT}',
            ]

        local_envoy_run_command += [
            '--add-host=host.docker.internal:host-gateway',
            f'--volume={self._tmp_envoy_dir.name}:{DOCKERIZED_ENVOY_DIR}:ro',
            f'--volume={self._envoy_nanny_path()}:/local_envoy_nanny:ro',
            # Envoy must have its configuration directory as its working dir to
            # let our Lua code find the libraries that we've copied into that
            # directory.
            f'--workdir={DOCKERIZED_ENVOY_DIR}',
            # NOTE: invariant here that the default entry point of the
            # container will run envoy at PID 1 because that is what
            # the 'local_envoy_nanny' will send a SIGTERM to in the
            # event of orphaning.
            ENVOY_PROXY_IMAGE,
            '-c',
            str(self._envoy_config_observed_path),
            # We need to disable hot restarts in order to run multiple
            # proxies at the same time otherwise they will clash
            # trying to create a domain socket. See
            # https://www.envoyproxy.io/docs/envoy/latest/operations/cli#cmdoption-base-id
            # for more details.
            '--disable-hot-restart',
        ]

        if self._debug_mode:
            local_envoy_run_command += [
                '--log-level',
                'debug',
            ]
            logger.info("will run:\n  " + ' '.join(local_envoy_run_command))

        # TODO(riley): even if we get back a container_id, it doesn't mean
        # everything is good. Envoy may have crashed. Poll this process for
        # a non-0 exit code so we can notify the user that
        # there is likely an issue with their proto descriptor.
        container_id = await DockerLocalEnvoy._async_check_output(
            *local_envoy_run_command
        )
        self._container_id = container_id.strip()

        # Start a task that will handle logging in case of (unexpected) Envoy
        # termination.
        self._follow_logs_and_handle_termination_task = asyncio.create_task(
            self._follow_logs_and_handle_termination()
        )

        if self._published_public_port == 0:
            self._published_public_port = await self._get_forwarded_local_port_from_docker(
                self._container_id,
                self._public_port,
            )

        self._published_trusted_port = await self._get_forwarded_local_port_from_docker(
            self._container_id,
            self._trusted_port,
        )

        assert self._published_public_port != 0
        assert self._published_trusted_port != 0

    @staticmethod
    async def _async_check_output(*args, **kwargs) -> str:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **kwargs,
        )

        stdout_data, _ = await process.communicate()
        return stdout_data.decode()

    @rebootdev.aio.tracing.function_span()
    async def _get_forwarded_local_port_from_docker(
        self,
        container_id: str,
        container_port: int,
    ):
        """If Docker dynamically mapped the local port to the container 'envoy'
        port, we need to know that port and we ask Docker via 'docker inspect'.
        """
        while True:
            json_inspect: str = await DockerLocalEnvoy._async_check_output(
                'docker',
                'inspect',
                container_id,
                '--format',
                "'{{json .NetworkSettings.Ports}}'",
            )
            # Cut the leading and trailing single quotes.
            json_inspect = json_inspect.strip()[1:-1].strip()
            if len(json_inspect) == 0 or json_inspect == "{}":
                # Docker hasn't yet populated the port mapping; wait a
                # bit and retry.
                await asyncio.sleep(0.1)
                continue
            try:
                ports_parsed = json.loads(json_inspect)
                if len(ports_parsed) == 0:
                    raise RuntimeError(
                        "Failed to inspect Envoy Docker container" + (
                            "; try setting the env var "
                            f"'{ENVVAR_LOCAL_ENVOY_DEBUG}=true' to help debug"
                            if not self._debug_mode else ""
                        ) + f"\nGot inspect result:\n'''\n{json_inspect}\n'''"
                    )

                return ports_parsed[f'{container_port}/tcp'][0]['HostPort']
            except json.decoder.JSONDecodeError:
                logger.error(
                    "Failed to parse docker inspect output: "
                    f"'{json_inspect}'"
                )
                raise

    @rebootdev.aio.tracing.function_span()
    async def _exec_local_envoy_nanny(self):
        # Start listening for the 'local_envoy_nanny' to connect. We
        # use a daemon thread which ignores any errors after we've
        # stopped so that we don't spam stderr with an exception.
        self._nanny_socket.listen(1)

        def accept():
            clients: list[socket.socket] = []
            try:
                while True:
                    client, address = self._nanny_socket.accept()
                    clients.append(client)
            except Exception as e:
                if not self._stopping:
                    raise RuntimeError(
                        'Failed to accept on "nanny socket; '
                        '*** ENVOY MAY BECOME AN ORPHANED CONTAINER ***'
                    ) from e

        threading.Thread(target=accept, daemon=True).start()

        _, port = self._nanny_socket.getsockname()

        # Run the nanny which will connect back to our server socket!
        #
        # We do this by forking of a process that starts `local_envoy_nanny` in
        # the docker container of the envoy we just started.
        # We then create an `asyncio` task that watches the local_envoy_nanny
        # process and waits for it to terminate. Should it terminate early with
        # a non-zero exit code we'll raise an error and stop the container.
        local_envoy_nanny_launcher = await asyncio.create_subprocess_exec(
            'docker',
            'exec',
            f'{self._container_id}',
            '/local_envoy_nanny',
            'host.docker.internal',
            f'{port}',
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async def local_envoy_nanny_launcher_watchdog():
            status_code = await local_envoy_nanny_launcher.wait()

            if status_code != 0 and self._stopping:
                # 'local_envoy_nanny_launcher.wait()' will block until
                # the process exits. If we're 'docker stop'-ing the
                # container, the nanny will get killed and thus exit
                # with a non-zero status code; there's no need to stop
                # the container again in that case. We also don't want
                # to report an error since we're stopping deliberately.
                return

            log = logger.warning if status_code != 0 else logger.debug

            if not self._stopping:
                log(
                    'Local envoy nanny exited with status code %d', status_code
                )

            if status_code != 0:
                stdout_data, _ = await local_envoy_nanny_launcher.communicate()

                output = stdout_data.decode() if stdout_data.decode(
                ) != '' else '<empty>'

                if not self._stopping:
                    log('Output from local_envoy_nanny: %s', output)

                error = RuntimeError(
                    f"Failed to run 'local_envoy_nanny': {output}; "
                    '*** ENVOY MAY BECOME AN ORPHANED CONTAINER ***'
                )

                try:
                    # Try and stop the container so we don't have orphans
                    # since our nanny won't be there for them!
                    await self.stop()
                except Exception as e:
                    raise error from e
                else:
                    raise error

        # Launch watchdog task in the background.
        # ISSUE(https://github.com/reboot-dev/mono/issues/2312): it would be
        # could if we could propagate the exception from the watchdog task to
        # the main task. Storing a handle to the task and having a
        # synchronization point such as a `wait()` method would be a way to
        # achieve this.
        #
        # NOTE: we're holding on to this task so that it doesn't get
        # destroyed while pending.
        self._local_envoy_nanny_launcher_watchdog_task = asyncio.create_task(
            local_envoy_nanny_launcher_watchdog(),
            name=f'local_envoy_nanny_launcher_watchdog() in {__name__}',
        )

    async def _follow_logs_and_handle_termination(self) -> None:
        """Waits for the Envoy container to terminate and its logs to be
        collected. Will print the logs if Envoy terminated unsuccessfully.
        """
        # Start a task that waits for the Envoy container to terminate.
        # This must be done while Envoy is still running.
        wait_for_termination_task = asyncio.create_task(
            self._wait_for_termination(),
            name=f'self._wait_for_termination() in {__name__}',
        )

        # Start a task that follows the logs of the Envoy container.
        follow_logs_task = asyncio.create_task(
            self._follow_logs(),
            name=f'self._follow_logs() in {__name__}',
        )

        # Wait for both of these tasks to complete; that indicates that Envoy
        # has terminated, and that we have all of the logs.
        try:
            envoy_returncode, _ = await asyncio.gather(
                wait_for_termination_task, follow_logs_task
            )
        except asyncio.CancelledError:
            # We're being cancelled. That might mean that Envoy is still
            # running, but we're no longer interested in its logs. Our `finally`
            # block will cancel the tasks if they're still running; there's
            # nothing else we need to do.
            raise
        except Exception as e:
            # Something went wrong while waiting for the tasks to complete.
            # If Envoy crashes that should NOT cause these tasks to crash;
            # rather there is some internal error that causes us to not be able
            # to follow Envoy's logs or wait for it to terminate.
            logger.error(
                "Failed to track Envoy's health. Please report this "
                "bug to the maintainers.\n"
                "\n"
                f"{traceback.format_exc()}"
            )
            # Re-raise the error. We're in undefined-behavior territory with
            # this internal error, so it's safest just to crash. That also
            # greatly increases the odds that tests will notice this issue.
            raise e
        finally:
            # If any of the tasks are still running at this point, cancel them.
            await _cancel_task(wait_for_termination_task)
            await _cancel_task(follow_logs_task)

        # Envoy terminated and the logs have been collected. We print the logs
        # if Envoy terminated unsuccessfully.
        if envoy_returncode != 0:
            logger.error(
                f"Envoy terminated with exit code {envoy_returncode} (an error)\n"
                "\n"
                "Did you stop Envoy manually or did you attempt to run another "
                "application using the same Envoy port and it just killed this one?\n"
                + (
                    "\n"
                    f"----- ENVOY LOGS (last {MAX_LOG_LINES} lines) -----\n"
                    "\n"
                    # The log lines all end with a newline, so we don't need
                    # to add another one.
                    f"{''.join(self._latest_log_lines)}"
                    "\n"
                    "----- END ENVOY LOGS -----\n"
                    if not self._debug_mode else ""
                ) + (
                    "\n"
                    "\n"
                    "To get more detailed logs from Reboot's Envoy container, "
                    f"set the `{ENVVAR_LOCAL_ENVOY_DEBUG}` environment "
                    "variable to `true`."
                    "\n"
                    "If you believe this crash is an issue within Reboot, please "
                    "report it to the maintainers in one of these places:\n"
                    f"* GitHub: {REBOOT_GITHUB_ISSUES_URL}\n"
                    f"* Discord: {REBOOT_DISCORD_URL}"
                    "\n" if not self._debug_mode else ""
                )
            )

    async def _wait_for_termination(self) -> int:
        """Waits for the Envoy container to exit.

        This must be called while Envoy is still running.
        """
        assert self._container_id is not None
        wait_process = await asyncio.create_subprocess_exec(
            'docker',
            'wait',
            self._container_id,
            stdin=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.STDOUT,
            stdout=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await wait_process.communicate()
            if wait_process.returncode != 0:
                # This indicates that our 'docker wait' command failed; it
                # doesn't say anything about the status of the Envoy container.
                logger.error(
                    "Failed to wait for Envoy termination\n"
                    "\n"
                    "'docker wait' output:\n"
                    "\n"
                    f"{stdout.decode()}"
                )
                raise RuntimeError(
                    f'Unable to get exit code for container {self._container_id}'
                )
            # A successful 'docker wait' process has a return code of 0, and
            # prints Envoy's return code (0 or non-0) to its stdout.
            envoy_returncode = int(stdout.decode())
            return envoy_returncode

        finally:
            # We're done waiting for termination. Terminate the `wait` process
            # if it is still running.
            if wait_process.returncode is None:
                try:
                    wait_process.terminate()
                    # Wait for the process to terminate, but don't wait too long.
                    try:
                        await asyncio.wait_for(
                            wait_process.wait(), timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        # The process still hasn't gracefully terminated. Kill the
                        # process. There's no way to ignore that signal, so we can
                        # safely do a non-timeout-based `await` for it to finish.
                        wait_process.kill()
                        await wait_process.wait()
                except ProcessLookupError:
                    # The process already exited. That's fine.
                    pass

    async def _follow_logs(self) -> None:
        """Runs a process that follows the logs of the given Docker container,
        storing the latest log lines in `self._unprocessed_log_lines`, and also
        "tee"ing them to `self._unprocessed_log_lines` if relevant.
        """
        assert self._container_id is not None

        # Start tailing Envoy's logs.
        process = await asyncio.create_subprocess_exec(
            'docker',
            'logs',
            '-f',
            self._container_id,
            stdin=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.STDOUT,
            stdout=asyncio.subprocess.PIPE,
        )

        try:
            # process.stdout should not be None since we set it to PIPE.
            assert process.stdout is not None

            async def read_stdout():
                # process.stdout will also not suddenly become None.
                assert process.stdout is not None

                # Read the log in 64k chunks. Any log lines bigger than
                # that will get discarded; they'd hog memory, and are
                # unreadable by humans anyway. In particular this
                # applies to log lines printed at 'debug' level that
                # contain the full content of our Lua filters, including
                # all of the sharding data we put into those.
                CHUNK_SIZE = 64 * 1024
                omitted_line_count = 0
                buffer = b''

                while not process.stdout.at_eof():
                    # Read a chunk.
                    chunk = await process.stdout.read(CHUNK_SIZE)
                    if not chunk:
                        # EOF reached.
                        if omitted_line_count > 0:
                            yield (
                                f"[{omitted_line_count} lines were omitted "
                                "because they were too long]\n".encode()
                            )
                        break

                    # Prepend any buffered data from the previous iteration.
                    data = buffer + chunk
                    buffer = b''

                    # Process all complete lines in this data.
                    while True:
                        newline_index = data.find(b'\n')
                        if newline_index == -1:
                            # No newline found in current data.
                            if len(data) >= CHUNK_SIZE:
                                # This line is too long (bigger than a
                                # whole chunk). Enter "discarding" mode
                                # and keep reading until we find a
                                # newline.
                                if omitted_line_count == 0:
                                    omitted_line_count = 1
                                data = b''
                            else:
                                # Incomplete line; save it for next iteration.
                                buffer = data
                            break

                        # Found a newline.
                        line = data[:newline_index + 1]

                        if omitted_line_count > 0:
                            # We were discarding a long line, and this newline
                            # marks the end of it. Discard this line too, report
                            # the omitted count, and start fresh.
                            yield (
                                f"[{omitted_line_count} lines were omitted "
                                "because they were too long]\n".encode()
                            )
                            omitted_line_count = 0
                        elif len(line) <= CHUNK_SIZE:
                            # This is a fresh line that fits in a chunk;
                            # yield it.
                            yield line
                        else:
                            # This line is too long. We'll discard it and enter
                            # "discarding" mode (omitted_line_count > 0).
                            omitted_line_count = 1

                        # Continue processing remaining data.
                        data = data[newline_index + 1:]

            async for line in read_stdout():
                decoded_line = line.decode()

                if self._debug_mode:
                    print(decoded_line)

                # We always accumulate the latest log line into `latest_logs`,
                # truncating it if it goes above the maximum number of lines
                # we want to keep around.
                self._latest_log_lines.append(decoded_line)

                if len(self._latest_log_lines) > MAX_LOG_LINES:
                    self._latest_log_lines.pop(0)

                # We also "tee" the log line into the
                # `self._unprocessed_log_lines` queue if still necessary
                # (determined by whether or not it is `None`).
                if self._unprocessed_log_lines is not None:
                    self._unprocessed_log_lines.put_nowait(decoded_line)

        finally:
            # We've either reached EOF or an exception (possibly due to
            # cancellation) has been raised. In any case, ensure the
            # log-following process has been terminated.
            try:
                process.terminate()
                # Wait for the process to terminate, but don't wait too long.
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    # The process still hasn't gracefully terminated. Kill the
                    # process. There's no way to ignore that signal, so we can
                    # safely do a non-timeout-based `await` for it to finish.
                    process.kill()
                    await process.wait()
            except ProcessLookupError:
                # The process already exited. That's fine.
                pass
