"""A Silo server of the application's own, for keeping blob bytes
where there is no S3 to keep them in: under `rbt dev run` and in
tests.

Silo, Pigsty's maintained fork of the MinIO server, is an
S3-compatible server in a single binary. Like Envoy, it is found
rather than shipped: named by `REBOOT_STD_BLOB_SILO_PATH`, or on the
`PATH` as `silo`, or run from its Docker image when Docker is
available. It keeps its objects under the application's state
directory, so that blobs survive a restart along with the rest of the
application's state and are reclaimed with it, and it listens on
loopback only.
"""

import aiohttp
import asyncio
import os
import re
import secrets
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from reboot.aio import signals
from reboot.server.nanny import nanny_command
from typing import Optional

# The Silo binary to run, for when it is not on the `PATH` under its
# own name, e.g. one fetched by Bazel for a test.
ENVVAR_STD_BLOB_SILO_PATH = "REBOOT_STD_BLOB_SILO_PATH"

# The Docker image to run Silo from when no binary is at hand, pinned
# to a release as the binary Bazel fetches is.
SILO_IMAGE = "docker.io/pgsty/silo:RELEASE.2026-10-26T00-00-00Z"

# What Silo reports as its region, and so what requests to it must be
# signed for; Silo has only the one.
SILO_REGION = "us-east-1"

# The root user Silo is started as. Its password is generated once
# per data directory and kept beside the data, so that a restart presents
# Silo with the credentials it already knows.
SILO_ROOT_USER = "reboot"
_ROOT_PASSWORD_FILENAME = "root-password"
_DATA_DIRECTORY_NAME = "data"

# How long Silo keeps a multipart upload that is never completed
# before dropping it, in the hours-only form its `MINIO_API_*`
# durations take: a week, as the bucket Reboot Cloud provides does,
# so that an upload that outlives its welcome does so the same way
# everywhere. Silo's own default is a day.
SILO_STALE_UPLOADS_EXPIRY = "168h"

# How long Silo gets to report the port it listens on and answer its
# health check after being started, before it is given up on.
_START_TIMEOUT_SECONDS = 60

# How many times Silo is started over when it exits before reporting
# its port: it is asked to pick a free port itself, which it does by
# binding port 0, reading the number back and closing the socket, so
# another process can take the port before it binds it again.
_START_ATTEMPTS = 3

# What Silo prints once it listens, with the port it picked:
# `API: http://127.0.0.1:41263`.
_API_ENDPOINT = re.compile(rb"API:\s*https?://127\.0\.0\.1:(\d+)")

# The escape sequences Silo styles its output with when it takes its
# output for a terminal, which can land anywhere in a line, so they
# are stripped before the line is matched.
_ANSI_ESCAPE = re.compile(rb"\x1b\[[0-9;]*[A-Za-z]")


class SiloUnavailable(RuntimeError):
    """Raised when there is no way to run Silo on this machine."""


def _which_silo() -> Optional[str]:
    """The Silo binary to run, or `None` when there is none."""
    path = os.environ.get(ENVVAR_STD_BLOB_SILO_PATH)
    if path:
        return path
    return shutil.which("silo")


def _docker_available() -> bool:
    return shutil.which("docker") is not None


class SiloServer:
    """One Silo process (or container), serving the objects under a
    directory on loopback.

    Idempotent: `start()` on a running server does nothing, so that
    the same server serves an application that is brought up more
    than once in one process, as a test may do."""

    def __init__(self, directory: Path):
        # Everything of Silo's that is to last: its objects under
        # `data/` and its root password.
        self._directory = directory
        self._port: Optional[int] = None
        # The binary's log, a temporary file of this start's own, like
        # Envoy's: not rotated, not removed, and small, since Silo is
        # quiet after its startup banner.
        self._log_path: Optional[Path] = None
        self._root_password: Optional[str] = None
        self._process: Optional[asyncio.subprocess.Process] = None
        self._nanny_process: Optional[asyncio.subprocess.Process] = None
        self._container_id: Optional[str] = None

    @property
    def port(self) -> int:
        assert self._port is not None, "Silo has not been started"
        return self._port

    @property
    def endpoint(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def access_key_id(self) -> str:
        return SILO_ROOT_USER

    @property
    def secret_access_key(self) -> str:
        assert self._root_password is not None, "Silo has not been started"
        return self._root_password

    def _ensure_root_password(self) -> str:
        path = self._directory / _ROOT_PASSWORD_FILENAME
        try:
            password = path.read_text().strip()
            if password:
                return password
        except FileNotFoundError:
            pass
        password = secrets.token_urlsafe(24)
        # Owner-readable only, like a key file: it is the whole of
        # what stands between this machine's other users and the
        # objects.
        descriptor = os.open(
            path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600
        )
        with os.fdopen(descriptor, "w") as file:
            file.write(password)
        return password

    async def start(self) -> None:
        if self._port is not None:
            return

        self._directory.mkdir(parents=True, exist_ok=True)
        data_directory = self._directory / _DATA_DIRECTORY_NAME
        data_directory.mkdir(exist_ok=True)
        self._root_password = self._ensure_root_password()

        # Silo keeps the `MINIO_*` variable names of the MinIO it was
        # forked from.
        environment = {
            "MINIO_ROOT_USER": SILO_ROOT_USER,
            "MINIO_ROOT_PASSWORD": self._root_password,
            "MINIO_REGION": SILO_REGION,
            "MINIO_API_STALE_UPLOADS_EXPIRY": SILO_STALE_UPLOADS_EXPIRY,
            # The web console is of no use here, and would take a port
            # of its own.
            "MINIO_BROWSER": "off",
        }

        binary = _which_silo()
        if binary is None and not _docker_available():
            raise SiloUnavailable(
                "Blobs need an S3-compatible bucket to keep their bytes in. "
                "None is configured (`REBOOT_STD_BLOB_S3_ENDPOINT` is unset), "
                "and Silo, which Reboot runs for you locally, is "
                "neither on the `PATH` as `silo` nor named by "
                f"`{ENVVAR_STD_BLOB_SILO_PATH}`, and Docker, which it could "
                "be run from, is not installed. Install Silo (see "
                "https://github.com/pgsty/silo/releases) or Docker."
            )

        try:
            if binary is not None:
                self._port = await self._start_binary(
                    binary, data_directory, environment
                )
            else:
                self._port = await self._start_container(
                    data_directory, environment
                )

            # Wait for Silo to answer its liveness check, one of the
            # `/minio/*` routes it keeps from the MinIO it was forked
            # from. A Silo that exits meanwhile, binary or container,
            # is noticed when the deadline runs out.
            deadline = time.monotonic() + _START_TIMEOUT_SECONDS
            url = f"{self.endpoint}/minio/health/live"
            async with aiohttp.ClientSession() as session:
                while True:
                    try:
                        async with session.get(url) as response:
                            if response.status == 200:
                                break
                    except aiohttp.ClientError:
                        pass
                    if time.monotonic() >= deadline:
                        raise SiloUnavailable(
                            "Silo did not become healthy within "
                            f"{_START_TIMEOUT_SECONDS} seconds; "
                            f"{self._where_its_log_is()}"
                        )
                    await asyncio.sleep(0.1)
        except BaseException:
            await self.stop()
            raise

    async def _start_binary(
        self,
        binary: str,
        data_directory: Path,
        environment: dict[str, str],
    ) -> int:
        """Starts the Silo binary on a port of its choosing and returns
        that port, read from the log it writes. Silo is started over,
        up to `_START_ATTEMPTS` times, should it exit before reporting
        a port: a port it picked but lost to another process before
        binding it is the usual cause. Raises `SiloUnavailable` once
        it has exited before reporting one that many times, or when
        it has not reported one within `_START_TIMEOUT_SECONDS`."""
        for _ in range(_START_ATTEMPTS):
            # Silo writes its log to a file rather than a pipe, so
            # that nothing need keep reading its output once the port
            # has been found in it, and the log stays for a developer
            # to read.
            log = tempfile.NamedTemporaryFile(
                prefix="silo-",
                suffix=".log",
                delete=False,
            )
            self._log_path = Path(log.name)

            # There is a race between when we've successfully started
            # Silo and when we get the nanny started where Silo may
            # get orphaned if our process gets terminated or our
            # coroutine is cancelled.
            #
            # We minimize the likelihood of an orphaned Silo here by
            # registering a cleanup handler to be executed when a
            # SIGTERM or SIGQUIT signal is raised that will terminate
            # Silo (if it was started).
            def stop_on_sigterm_sigquit_exception():
                if (
                    self._process is not None and
                    self._process.returncode is None
                ):
                    # NOTE: deliberately not using `asyncio` in here
                    # as this may be run within an interrupt handler.
                    try:
                        os.kill(self._process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass

            with signals.cleanup_on_signal(
                [signal.SIGTERM, signal.SIGQUIT],
                handler=stop_on_sigterm_sigquit_exception,
            ):
                try:
                    try:
                        self._process = await asyncio.create_subprocess_exec(
                            binary,
                            "server",
                            str(data_directory),
                            "--address",
                            "127.0.0.1:0",
                            stdin=asyncio.subprocess.DEVNULL,
                            stdout=log,
                            stderr=asyncio.subprocess.STDOUT,
                            env={
                                **os.environ,
                                **environment
                            },
                        )
                    finally:
                        log.close()

                    # The nanny terminates Silo once this process is
                    # gone however it went, including a `SIGKILL` no
                    # cleanup code can observe: it holds the read end
                    # of a pipe whose only write end is ours.
                    self._nanny_process = await asyncio.create_subprocess_exec(
                        *nanny_command(self._process.pid),
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                except:
                    stop_on_sigterm_sigquit_exception()
                    raise
            # The port Silo reports listening on, from what it has
            # written to its log.
            deadline = time.monotonic() + _START_TIMEOUT_SECONDS
            while self._process.returncode is None:
                match = _API_ENDPOINT.search(
                    _ANSI_ESCAPE.sub(b"", self._log_path.read_bytes())
                )
                if match is not None:
                    return int(match.group(1))
                if time.monotonic() >= deadline:
                    raise SiloUnavailable(
                        "Silo did not report the port it listens on within "
                        f"{_START_TIMEOUT_SECONDS} seconds; its log is at "
                        f"{self._log_path}"
                    )
                await asyncio.sleep(0.1)

            # Silo exited before reporting its port.
            status = self._process.returncode
            await self.stop()

        raise SiloUnavailable(
            f"Silo exited before listening, {_START_ATTEMPTS} times over, "
            f"the last with status {status}; its log is at {self._log_path}"
        )

    async def _start_container(
        self,
        data_directory: Path,
        environment: dict[str, str],
    ) -> int:
        """Starts Silo from its Docker image on a loopback port Docker
        picks, with its nanny in the container, and returns that
        port."""
        command = [
            "docker",
            "run",
            "--detach",
            # Published on loopback only, like the binary listens, on a
            # port Docker picks: it binds the port itself, so there is
            # no picking it first and losing it before it is bound.
            "-p",
            "127.0.0.1::9000",
            "-v",
            f"{data_directory}:/data",
            # As this user, so that the objects it writes into the
            # state directory are this user's to read and remove.
            "--user",
            f"{os.getuid()}:{os.getgid()}",
        ]
        for name, value in environment.items():
            command += ["-e", f"{name}={value}"]
        command += [SILO_IMAGE, "server", "/data"]

        # There is a race between when we've successfully started the
        # Silo container and when we get the nanny started where a
        # container may get orphaned if our process gets terminated or
        # our coroutine is cancelled.
        #
        # We minimize the likelihood of an orphaned container here by
        # registering a cleanup handler to be executed when a SIGTERM
        # or SIGQUIT signal is raised that will stop the container (if
        # it was started).
        def stop_on_sigterm_sigquit_exception():
            if self._container_id is not None:
                # NOTE: deliberately not using `asyncio` in here as
                # this may be run within an interrupt handler.
                subprocess.run(
                    ["docker", "stop", self._container_id],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

        with signals.cleanup_on_signal(
            [signal.SIGTERM, signal.SIGQUIT],
            handler=stop_on_sigterm_sigquit_exception,
        ):
            try:
                process = await asyncio.create_subprocess_exec(
                    *command,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()
                if process.returncode != 0:
                    raise SiloUnavailable(
                        "Failed to run Silo from its Docker image "
                        f"`{SILO_IMAGE}`: {stderr.decode(errors='replace')}"
                    )
                self._container_id = stdout.decode().strip()

                # The nanny, run in the container, where Silo is PID 1,
                # terminates it once this process is gone however it
                # went, including a `SIGKILL` no cleanup code can
                # observe: it holds the read end of a pipe whose only
                # write end is ours. The image has the shell it needs.
                self._nanny_process = await asyncio.create_subprocess_exec(
                    "docker",
                    "exec",
                    "--interactive",
                    self._container_id,
                    *nanny_command(1),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
            except:
                stop_on_sigterm_sigquit_exception()
                raise

        process = await asyncio.create_subprocess_exec(
            "docker",
            "port",
            self._container_id,
            "9000/tcp",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        match = re.search(rb"127\.0\.0\.1:(\d+)", stdout)
        if process.returncode != 0 or match is None:
            raise SiloUnavailable(
                "Failed to learn the port Silo's Docker container is "
                f"published on: {stderr.decode(errors='replace')}"
            )
        return int(match.group(1))

    def _where_its_log_is(self) -> str:
        if self._container_id is not None:
            return f"see `docker logs {self._container_id}`"
        return f"its log is at {self._log_path}"

    async def stop(self) -> None:
        # Silo first, binary or container, and its nanny only once
        # Silo is gone: the nanny outlives what it watches.
        if self._process is not None:
            process = self._process
            self._process = None
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
        if self._container_id is not None:
            await self._docker("stop", self._container_id)
        if self._nanny_process is not None:
            nanny = self._nanny_process
            self._nanny_process = None
            try:
                nanny.kill()
            except ProcessLookupError:
                pass
            await nanny.wait()
        if self._container_id is not None:
            container_id = self._container_id
            self._container_id = None
            await self._docker("rm", container_id)
        self._port = None

    @staticmethod
    async def _docker(verb: str, container_id: str) -> None:
        process = await asyncio.create_subprocess_exec(
            "docker",
            verb,
            container_id,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.wait()
