"""Spawning the filesystem blob data plane for local runs.

`rbt dev run` and `rbt serve run` start the open-source filesystem blob
data-plane server (`reboot.std.blobs.v1._filesystem_server`) as a
background subprocess whenever `REBOOT_BLOB_DATA_PLANE_URL` is not
already set, and point the application at it on localhost. In Reboot
Cloud the variable is set by provisioning (to the app's facilitator),
so nothing is spawned. The server is started unconditionally when the
variable is unset — it is cheap and idle unless the application
actually uses blobs.

The server chooses its own ports and writes them to a "ready file"
once both its gRPC and HTTP endpoints are listening; we wait for that
file before pointing the application at it. That both avoids the
port-allocation race of picking a port in the parent and guarantees
the data plane is fully serving before the application can reach it.
"""

import asyncio
import os
import shutil
import sys
import tempfile
from reboot.cli.common.subprocesses import Subprocesses
from reboot.std.blobs.v1._data_plane import ENVVAR_BLOB_DATA_PLANE_URL
from typing import Optional

# The filesystem data plane binds loopback only (its gRPC control
# surface is unauthenticated); the application reaches it here.
_LOOPBACK_HOST = "127.0.0.1"

# Where blob bytes live, under the application's state directory (so
# `rbt dev expunge`, which removes the state directory, removes blobs
# too).
BLOBS_SUBDIRECTORY = "blobs"

# How long to wait for the spawned server to report its ports before
# giving up.
_READY_TIMEOUT_SECONDS = 30
_READY_POLL_INTERVAL_SECONDS = 0.1


async def _run_and_await_ready(
    subprocesses: Subprocesses,
    argv: list[str],
    env: dict[str, str],
    ready_file: str,
    ready: asyncio.Future[tuple[int, int]],
) -> None:
    """Runs the data-plane server until cancelled, resolving `ready`
    with its `(grpc_port, http_port)` once the server writes them."""
    async with subprocesses.exec(*argv, env=env) as process:
        waited = 0.0
        while not ready.done():
            if process.returncode is not None:
                ready.set_exception(
                    RuntimeError(
                        "The filesystem blob data-plane server exited "
                        f"before becoming ready (code {process.returncode})."
                    )
                )
                break
            ports = _read_ready_file(ready_file)
            if ports is not None:
                ready.set_result(ports)
                break
            if waited >= _READY_TIMEOUT_SECONDS:
                ready.set_exception(
                    RuntimeError(
                        "Timed out waiting for the filesystem blob "
                        "data-plane server to become ready."
                    )
                )
                break
            await asyncio.sleep(_READY_POLL_INTERVAL_SECONDS)
            waited += _READY_POLL_INTERVAL_SECONDS
        await process.wait()


def _read_ready_file(path: str) -> Optional[tuple[int, int]]:
    try:
        with open(path) as f:
            content = f.read().split()
    except FileNotFoundError:
        return None
    if len(content) != 2:
        return None
    return int(content[0]), int(content[1])


async def start_filesystem_data_plane(
    env: dict[str, str],
    blobs_directory: str,
    subprocesses: Subprocesses,
    background_command_tasks: list[asyncio.Task],
) -> None:
    """Unless a data plane is already configured in `env`, spawns the
    filesystem server as a background task, waits until it is fully
    listening, and points `env[REBOOT_BLOB_DATA_PLANE_URL]` at it. The
    server runs with `env` — which must already carry
    `REBOOT_CRYPTO_ROOT_KEYS`, from which the server derives its
    URL-signing key — and is cleaned up when its task is cancelled."""
    if env.get(ENVVAR_BLOB_DATA_PLANE_URL):
        return

    # The ready file lives in a fresh private directory (a bare
    # `mktemp` name in a shared `/tmp` would be squattable).
    ready_directory = tempfile.mkdtemp(prefix="reboot-blob-data-plane-")
    ready_file = os.path.join(ready_directory, "ready")
    argv = [
        sys.executable,
        "-m",
        "reboot.std.blobs.v1._filesystem_server",
        "--directory",
        blobs_directory,
        "--ready-file",
        ready_file,
    ]

    loop = asyncio.get_event_loop()
    ready: asyncio.Future[tuple[int, int]] = loop.create_future()
    task = asyncio.create_task(
        _run_and_await_ready(subprocesses, argv, env, ready_file, ready),
        name="run_filesystem_data_plane(...)",
    )
    background_command_tasks.append(task)
    try:
        grpc_port, _ = await ready
    except BaseException:
        # Reap the never-ready server immediately: its task would
        # otherwise run until the caller's cleanup — which under
        # `rbt serve run` only happens once the application exits.
        task.cancel()
        try:
            await task
        except BaseException:
            pass
        raise
    finally:
        shutil.rmtree(ready_directory, ignore_errors=True)
    env[ENVVAR_BLOB_DATA_PLANE_URL] = f"{_LOOPBACK_HOST}:{grpc_port}"
