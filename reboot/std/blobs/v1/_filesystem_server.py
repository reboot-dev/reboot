"""The filesystem blob data-plane server.

Implements the `BlobDataPlane` gRPC service backed by the local
filesystem, plus the HTTP byte endpoint its minted URLs point at. It
runs in two ways: `rbt dev run` and `rbt serve run` spawn it as a
standalone program (via `main`) whenever `REBOOT_BLOB_DATA_PLANE_URL`
is not already set, and the `reboot.aio.tests.Reboot` test harness
runs it in-process (via `FilesystemDataPlane.start`), so that blob
storage works out of the box in every local run mode.

Its URLs are application-relative proxy paths: its `Configuration`
asks the application to forward the blob path namespace to it, so the
application reverse-proxies byte `PUT`/`GET` here rather than exposing
this server on its own port (see `_proxy.py`).
"""

import argparse
import asyncio
import grpc
import os
import uvicorn  # type: ignore[import]
from rbt.std.blobs.v1.data_plane_pb2 import (
    HTTP_METHOD_GET,
    HTTP_METHOD_PUT,
    ConfigurationResponse,
    DataPlaneBeginUploadResponse,
    DataPlaneCompleteUploadResponse,
    DataPlaneDeleteResponse,
    DataPlaneGetDownloadUrlResponse,
    DataPlanePartUploadInstruction,
    DataPlaneUploadInstructionsResponse,
    ForwardedPath,
)
from rbt.std.blobs.v1.data_plane_pb2_grpc import (
    BlobDataPlaneServicer,
    add_BlobDataPlaneServicer_to_server,
)
from reboot.std.blobs.v1._http import build_http_app
from reboot.std.blobs.v1._store import (
    DEFAULT_PART_SIZE_BYTES,
    HTTP_PATH_PREFIX,
    BlobStoreError,
    FilesystemBlobStore,
    UploadedPart,
)
from typing import Optional
from uuid import uuid4

# The filesystem server binds loopback only: it has no authentication
# (its URLs are HMAC-signed, but the gRPC control surface is not), so
# it must never be reachable off the host. The application reaches it
# over localhost and proxies client byte traffic to it.
LOOPBACK_HOST = "127.0.0.1"


class FilesystemDataPlaneServicer(BlobDataPlaneServicer):
    """Implements `BlobDataPlane` over a `FilesystemBlobStore`."""

    def __init__(
        self,
        store: FilesystemBlobStore,
        http_port: int,
    ):
        self._store = store
        self._http_port = http_port

    async def Configuration(self, request, context):
        # This server's URLs are application-relative under
        # `HTTP_PATH_PREFIX`; ask the application to forward that
        # namespace to the HTTP byte endpoint.
        return ConfigurationResponse(
            part_size=self._store.part_size,
            forwarded_paths=[
                ForwardedPath(
                    method=HTTP_METHOD_GET,
                    path_prefix=HTTP_PATH_PREFIX + "/",
                ),
                ForwardedPath(
                    method=HTTP_METHOD_PUT,
                    path_prefix=HTTP_PATH_PREFIX + "/",
                ),
            ],
            http_port=self._http_port,
        )

    async def BeginUpload(self, request, context):
        upload_id = await self._store.begin_upload(
            request.blob_id,
            request.content_type,
        )
        return DataPlaneBeginUploadResponse(upload_id=upload_id)

    async def UploadInstructions(self, request, context):
        instructions = [
            DataPlanePartUploadInstruction(
                part_number=part_number,
                url=self._store.part_put_url(
                    request.blob_id,
                    request.upload_id,
                    part_number,
                ),
            ) for part_number in request.part_numbers
        ]
        return DataPlaneUploadInstructionsResponse(instructions=instructions)

    async def CompleteUpload(self, request, context):
        try:
            etag = await self._store.complete(
                request.blob_id,
                request.upload_id,
                request.content_type,
                [
                    UploadedPart(
                        number=part.number, etag=part.etag, size=part.size
                    ) for part in request.parts
                ],
                max_size=(
                    request.max_size if request.HasField("max_size") else None
                ),
            )
            return DataPlaneCompleteUploadResponse(etag=etag)
        except BlobStoreError as error:
            # A permanent failure: report it so the control plane can
            # surface it and let the client re-upload. Transient
            # failures raise other exceptions, which become gRPC errors
            # so the control-plane workflow retries.
            return DataPlaneCompleteUploadResponse(error=str(error))

    async def GetDownloadUrl(self, request, context):
        url = self._store.download_url(
            request.blob_id,
            request.ttl_seconds if request.HasField("ttl_seconds") else None,
        )
        return DataPlaneGetDownloadUrlResponse(url=url)

    async def Delete(self, request, context):
        await self._store.delete(request.blob_id)
        return DataPlaneDeleteResponse()


class FilesystemDataPlane:
    """A running filesystem blob data plane: the `BlobDataPlane` gRPC
    service plus the HTTP byte endpoint its minted URLs point at, both
    bound to loopback. Construct via `start()`."""

    def __init__(
        self,
        *,
        grpc_server: grpc.aio.Server,
        grpc_port: int,
        http_server,
        http_task: asyncio.Task,
        http_port: int,
    ):
        self._grpc_server = grpc_server
        self._grpc_port = grpc_port
        self._http_server = http_server
        self._http_task = http_task
        self._http_port = http_port

    @classmethod
    async def start(
        cls,
        *,
        directory: str,
        part_size: int = DEFAULT_PART_SIZE_BYTES,
        grpc_port: int = 0,
        http_port: int = 0,
    ) -> "FilesystemDataPlane":
        """Starts serving, with bytes stored under `directory`. Ports
        default to 0 (an ephemeral port chosen by the OS). The HTTP
        byte endpoint is brought up before the gRPC surface, so that by
        the time `Configuration` is reachable the `http_port` it
        reports is already serving."""
        store = FilesystemBlobStore(directory, part_size=part_size)

        http_server = uvicorn.Server(
            uvicorn.Config(
                build_http_app(store),
                host=LOOPBACK_HOST,
                port=http_port,
                log_level="warning",
            )
        )
        http_task = asyncio.create_task(http_server.serve())
        while not http_server.started:
            if http_task.done():
                # Startup failed (e.g. the requested port is in use);
                # surface the underlying error.
                http_task.result()
                raise RuntimeError(
                    "The blob data plane's HTTP server exited during "
                    "startup"
                )
            await asyncio.sleep(0.01)
        actual_http_port = http_server.servers[0].sockets[0].getsockname()[1]

        # From here on the HTTP server is live; shut it down if the
        # gRPC surface fails to come up, so a failed `start` leaves
        # nothing running.
        try:
            grpc_server = grpc.aio.server()
            add_BlobDataPlaneServicer_to_server(
                FilesystemDataPlaneServicer(store, actual_http_port),
                grpc_server,
            )
            actual_grpc_port = grpc_server.add_insecure_port(
                f"{LOOPBACK_HOST}:{grpc_port}"
            )
            if actual_grpc_port == 0:
                raise RuntimeError(
                    "The blob data plane's gRPC server could not bind "
                    f"port {grpc_port}"
                )
            await grpc_server.start()
        except BaseException:
            http_server.should_exit = True
            await http_task
            raise

        return cls(
            grpc_server=grpc_server,
            grpc_port=actual_grpc_port,
            http_server=http_server,
            http_task=http_task,
            http_port=actual_http_port,
        )

    @property
    def grpc_port(self) -> int:
        return self._grpc_port

    @property
    def http_port(self) -> int:
        return self._http_port

    @property
    def url(self) -> str:
        """The gRPC address to put in `REBOOT_BLOB_DATA_PLANE_URL`."""
        return f"{LOOPBACK_HOST}:{self._grpc_port}"

    async def stop(self) -> None:
        await self._grpc_server.stop(grace=None)
        self._http_server.should_exit = True
        await self._http_task

    async def wait(self) -> None:
        """Blocks until the servers terminate (they don't, absent
        `stop()`; this is how the standalone program serves forever)."""
        await asyncio.gather(
            self._grpc_server.wait_for_termination(),
            self._http_task,
        )


def _write_ready_file(path: str, grpc_port: int, http_port: int) -> None:
    """Atomically writes the two chosen ports so the spawning process
    learns them only once both servers are listening."""
    temp_path = f"{path}.{uuid4().hex}.tmp"
    with open(temp_path, "w") as f:
        f.write(f"{grpc_port}\n{http_port}\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_path, path)


async def serve(
    directory: str,
    grpc_port: int = 0,
    http_port: int = 0,
    part_size: int = DEFAULT_PART_SIZE_BYTES,
    ready_file: Optional[str] = None,
) -> None:
    """Runs the data plane until terminated. When `ready_file` is
    given, the actually-bound ports are written to it once both
    endpoints are listening, for the spawning process to read."""
    data_plane = await FilesystemDataPlane.start(
        directory=directory,
        part_size=part_size,
        grpc_port=grpc_port,
        http_port=http_port,
    )
    if ready_file is not None:
        _write_ready_file(
            ready_file,
            data_plane.grpc_port,
            data_plane.http_port,
        )
    await data_plane.wait()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Filesystem blob data-plane server."
    )
    parser.add_argument("--directory", required=True)
    parser.add_argument("--grpc-port", type=int, default=0)
    parser.add_argument("--http-port", type=int, default=0)
    parser.add_argument(
        "--part-size",
        type=int,
        default=DEFAULT_PART_SIZE_BYTES,
    )
    parser.add_argument("--ready-file", default=None)
    args = parser.parse_args()
    asyncio.run(
        serve(
            args.directory,
            args.grpc_port,
            args.http_port,
            part_size=args.part_size,
            ready_file=args.ready_file,
        )
    )


if __name__ == "__main__":
    main()
