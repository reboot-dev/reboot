import aiofiles
import grpc
import json
import sys
from google.protobuf import json_format
from pathlib import Path
from rbt.v1alpha1.admin import export_import_pb2_grpc
from rbt.v1alpha1.admin.export_import_pb2 import (
    ExportImportItem,
    ExportRequest,
    ListServersRequest,
)
from reboot.aio.concurrently import concurrently
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.aio.types import ServerId
from typing import AsyncIterator


def _with_admin_auth_metadata(token: str) -> tuple[tuple[str, str]]:
    """Syntactic sugar for creating a metadata tuple with a bearer token."""
    assert token and len(token) > 0, "admin token must not be empty"
    return ((AUTHORIZATION_HEADER, f'Bearer {token}'),)


class _MultilineProgress:
    """Maintains one fixed terminal line per label, updated in place.

    On construction, prints one line per label to reserve vertical
    space. `update()` uses ANSI cursor movement to overwrite the
    correct line without scrolling. `finalize()` prints a trailing
    newline so subsequent output starts cleanly.
    """

    def __init__(self, labels: list[str]) -> None:
        self._labels_count = len(labels)
        for label in labels:
            print(f"  {label}")

    def update(self, index: int, message: str) -> None:
        if self._labels_count == 0:
            return
        lines_up = self._labels_count - index
        sys.stdout.write(f"\033[{lines_up}A\r{message}\033[{lines_up}B")
        sys.stdout.flush()

    def finalize(self) -> None:
        if self._labels_count > 0:
            print()


async def _export(
    export_import: export_import_pb2_grpc.ExportImportStub,
    server_id: ServerId,
    dest_path: Path,
    *,
    admin_token: str,
    progress: _MultilineProgress,
    progress_index: int,
) -> None:
    while True:
        try:
            async with aiofiles.open(dest_path, 'w') as output:
                # We buffer items in `write_buffer` and flush in
                # batches to reduce the number of `aiofiles`
                # event loop calls.
                write_buffer: list[str] = []
                total_exported = 0

                async def _maybe_write_batch(item_json: str) -> None:
                    nonlocal total_exported
                    write_buffer.append(item_json)
                    # The maximum size of item is the maximum size of a
                    # Protobuf message, which is 4 MiB by default.
                    # So a batch of 100 items should be at most ~400 MiB
                    # in the worst case, however in practice we expect it
                    # to be much smaller.
                    if len(write_buffer) >= 100:
                        total_exported += len(write_buffer)
                        await output.write('\n'.join(write_buffer) + '\n')
                        write_buffer.clear()
                        progress.update(
                            progress_index,
                            f"  {server_id}: {total_exported} items"
                            f" exported...",
                        )

                async for item in export_import.Export(
                    ExportRequest(server_id=server_id),
                    metadata=_with_admin_auth_metadata(admin_token),
                ):
                    await _maybe_write_batch(
                        # NOTE: We use `MessageToDict` followed by
                        # `json.dumps` because protobuf's JSON
                        # encoding always inserts newlines, even
                        # when `indent=0`.
                        json.dumps(
                            json_format.MessageToDict(
                                item,
                                preserving_proto_field_name=True,
                            )
                        )
                    )

                # Flush any remaining items in the buffer.
                if write_buffer:
                    total_exported += len(write_buffer)
                    await output.write('\n'.join(write_buffer) + '\n')
                progress.update(
                    progress_index,
                    f"  {server_id}: {total_exported} items exported.",
                )
            return
        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.NOT_FOUND:
                # We were sent to the incorrect server: try again until
                # we get the right one.
                continue
            raise


async def do_export(
    export_import: export_import_pb2_grpc.ExportImportStub,
    dest_directory: Path,
    *,
    admin_token: str,
) -> None:
    """Export one JSON-lines file per server to the given directory."""
    dest_directory.mkdir(parents=True, exist_ok=True)

    response = await export_import.ListServers(
        ListServersRequest(),
        metadata=_with_admin_auth_metadata(admin_token),
    )
    server_ids = list(response.server_ids)
    progress = _MultilineProgress(server_ids)
    await concurrently(
        _export(
            export_import,
            server_id,
            dest_directory / f"{server_id}.json",
            admin_token=admin_token,
            progress=progress,
            progress_index=i,
        ) for i, server_id in enumerate(server_ids)
    )
    progress.finalize()


async def _import(
    export_import: export_import_pb2_grpc.ExportImportStub,
    src_path: Path,
    *,
    admin_token: str,
    progress: _MultilineProgress,
    progress_index: int,
) -> None:

    total_imported = 0

    async def import_stream() -> AsyncIterator[ExportImportItem]:
        nonlocal total_imported
        async with aiofiles.open(src_path, 'r') as infile:
            line_number = 0
            async for line in infile:
                line_number += 1
                try:
                    yield json_format.Parse(
                        line,
                        ExportImportItem(),
                    )
                    total_imported = line_number
                    if line_number % 100 == 0:
                        progress.update(
                            progress_index,
                            f"  {src_path.name}: {line_number} items"
                            f" sent...",
                        )
                except BaseException as e:
                    # This exception will NOT bubble up nicely, because
                    # gRPC swallows exceptions in its RPC streaming
                    # request generators - users will see a
                    # `CancelledError` instead. So print some debug
                    # information now.
                    print(
                        f"IMPORT ERROR: failed to parse line"
                        f" {line_number} in '{src_path}': {e}",
                        file=sys.stderr,
                    )
                    raise

    await export_import.Import(
        import_stream(),
        metadata=_with_admin_auth_metadata(admin_token),
    )
    progress.update(
        progress_index,
        f"  {src_path.name}: {total_imported} items imported.",
    )


async def do_import(
    export_import: export_import_pb2_grpc.ExportImportStub,
    src_directory: Path,
    *,
    admin_token: str,
) -> None:
    """Import all JSON-lines files in the given directory to the server."""
    # TODO: Make a best effort to direct items at the "correct"
    # nodes using a placement client.
    paths = list(src_directory.iterdir())
    progress = _MultilineProgress([path.name for path in paths])
    await concurrently(
        _import(
            export_import,
            path,
            admin_token=admin_token,
            progress=progress,
            progress_index=i,
        ) for i, path in enumerate(paths)
    )
    progress.finalize()
