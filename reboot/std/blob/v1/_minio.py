"""A MinIO server of the application's own, for keeping blob bytes
where there is no S3 to keep them in: under `rbt dev run` and in
tests.

MinIO is an S3-compatible server in a single binary. Like
Envoy, it is found rather than shipped: named by `REBOOT_STD_BLOB_MINIO_PATH`,
or on the `PATH` as `minio`, or run from its Docker image when Docker
is available. It keeps its objects under the application's state
directory, so that blobs survive a restart along with the rest of the
application's state and are reclaimed with it, and it listens on
loopback only.
"""

import aiohttp
import asyncio
import os
import secrets
import shutil
import socket
import time
from pathlib import Path
from reboot.server.envoy_nanny import envoy_nanny_command
from typing import Optional

# The MinIO binary to run, for when it is not on the `PATH` under its
# own name, e.g. one fetched by Bazel for a test.
ENVVAR_STD_BLOB_MINIO_PATH = "REBOOT_STD_BLOB_MINIO_PATH"

# The Docker image to run MinIO from when no binary is at hand.
MINIO_IMAGE = "quay.io/minio/minio:latest"

# What MinIO reports as its region, and so what requests to it must be
# signed for; MinIO has only the one.
MINIO_REGION = "us-east-1"

# The root user MinIO is started as. Its password is minted once per
# data directory and kept beside the data, so that a restart presents
# MinIO with the credentials it already knows.
MINIO_ROOT_USER = "reboot"
_ROOT_PASSWORD_FILENAME = "root-password"
_DATA_DIRECTORY_NAME = "data"
_LOG_FILENAME = "minio.log"

# How long MinIO gets to answer its health check after being started,
# before it is given up on.
_START_TIMEOUT_SECONDS = 60


class MinioUnavailable(RuntimeError):
    """Raised when there is no way to run MinIO on this machine."""


def _free_port() -> int:
    """A port nothing is listening on right now, for MinIO to take."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def find_minio() -> Optional[str]:
    """The MinIO binary to run, or `None` when there is none."""
    path = os.environ.get(ENVVAR_STD_BLOB_MINIO_PATH)
    if path:
        return path
    return shutil.which("minio")


def _docker_available() -> bool:
    return shutil.which("docker") is not None


class MinioServer:
    """One MinIO process (or container), serving the objects under a
    directory on loopback.

    Idempotent: `start()` on a running server does nothing, so that
    the same server serves an application that is brought up more
    than once in one process, as a test may do."""

    def __init__(self, directory: Path):
        # Everything of MinIO's: its objects under `data/`, its root
        # password and its log.
        self._directory = directory
        self._port: Optional[int] = None
        self._root_password: Optional[str] = None
        self._process: Optional[asyncio.subprocess.Process] = None
        self._nanny_process: Optional[asyncio.subprocess.Process] = None
        self._container_id: Optional[str] = None

    @property
    def port(self) -> int:
        assert self._port is not None, "MinIO has not been started"
        return self._port

    @property
    def endpoint(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    @property
    def access_key_id(self) -> str:
        return MINIO_ROOT_USER

    @property
    def secret_access_key(self) -> str:
        assert self._root_password is not None, "MinIO has not been started"
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
        port = _free_port()

        environment = {
            "MINIO_ROOT_USER": MINIO_ROOT_USER,
            "MINIO_ROOT_PASSWORD": self._root_password,
            "MINIO_REGION": MINIO_REGION,
            # The web console is of no use here, and would take a port
            # of its own.
            "MINIO_BROWSER": "off",
        }

        binary = find_minio()
        if binary is not None:
            await self._start_binary(binary, data_directory, port, environment)
        elif _docker_available():
            await self._start_container(data_directory, port, environment)
        else:
            raise MinioUnavailable(
                "Blobs need an S3-compatible bucket to keep their bytes in. "
                "None is configured (`REBOOT_STD_BLOB_S3_ENDPOINT` is unset), "
                "and MinIO, which Reboot runs for you locally, is "
                "neither on the `PATH` as `minio` nor named by "
                f"`{ENVVAR_STD_BLOB_MINIO_PATH}`, and Docker, which it could "
                "be run from, is not installed. Install MinIO (see "
                "https://min.io/download) or Docker."
            )

        self._port = port
        try:
            await self._wait_until_healthy()
        except BaseException:
            await self.stop()
            raise

    async def _start_binary(
        self,
        binary: str,
        data_directory: Path,
        port: int,
        environment: dict[str, str],
    ) -> None:
        log = open(self._directory / _LOG_FILENAME, "ab")
        try:
            self._process = await asyncio.create_subprocess_exec(
                binary,
                "server",
                str(data_directory),
                "--address",
                f"127.0.0.1:{port}",
                stdin=asyncio.subprocess.DEVNULL,
                stdout=log,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, **environment},
            )
        finally:
            log.close()

        # The nanny terminates MinIO once this process is gone however
        # it went, including a `SIGKILL` no cleanup code can observe:
        # it holds the read end of a pipe whose only write end is ours.
        # Not Envoy-specific, its name notwithstanding: it is given a
        # PID and watches a pipe.
        self._nanny_process = await asyncio.create_subprocess_exec(
            *envoy_nanny_command(self._process.pid),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

    async def _start_container(
        self,
        data_directory: Path,
        port: int,
        environment: dict[str, str],
    ) -> None:
        command = [
            "docker",
            "run",
            "--detach",
            # Published on loopback only, like the binary listens.
            "-p",
            f"127.0.0.1:{port}:9000",
            "-v",
            f"{data_directory}:/data",
            # As this user, so that the objects it writes into the
            # state directory are this user's to read and remove.
            "--user",
            f"{os.getuid()}:{os.getgid()}",
        ]
        for name, value in environment.items():
            command += ["-e", f"{name}={value}"]
        command += [MINIO_IMAGE, "server", "/data"]

        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise MinioUnavailable(
                "Failed to run MinIO from its Docker image "
                f"`{MINIO_IMAGE}`: {stderr.decode(errors='replace')}"
            )
        self._container_id = stdout.decode().strip()

    async def _wait_until_healthy(self) -> None:
        """Waits for MinIO to answer its liveness check, or raises
        with its log's tail if it exits or does not answer in time."""
        deadline = time.monotonic() + _START_TIMEOUT_SECONDS
        url = f"{self.endpoint}/minio/health/live"
        async with aiohttp.ClientSession() as session:
            while True:
                if (
                    self._process is not None and
                    self._process.returncode is not None
                ):
                    raise MinioUnavailable(
                        "MinIO exited with status "
                        f"{self._process.returncode} while starting; its "
                        f"log is at {self._directory / _LOG_FILENAME}"
                    )
                try:
                    async with session.get(url) as response:
                        if response.status == 200:
                            return
                except aiohttp.ClientError:
                    pass
                if time.monotonic() >= deadline:
                    raise MinioUnavailable(
                        "MinIO did not become healthy within "
                        f"{_START_TIMEOUT_SECONDS} seconds; its log is at "
                        f"{self._directory / _LOG_FILENAME}"
                    )
                await asyncio.sleep(0.1)

    async def stop(self) -> None:
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
            for verb in ("stop", "rm"):
                process = await asyncio.create_subprocess_exec(
                    "docker",
                    verb,
                    container_id,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await process.wait()
        self._port = None
