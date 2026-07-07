"""The HTTP byte endpoint of the filesystem blob data-plane server.

Serves `PUT` (part upload) and `GET` (download) under
`/__/reboot/blob/`. The filesystem server (`_filesystem_server.py`)
runs this on localhost; the application's `Blob` library reverse-
proxies to it (see `_proxy.py`), so the bytes never leave a single
origin even though they live in a separate process.

These handlers are self-authorizing: every URL carries an expiring
HMAC signature minted by the data plane, so the handlers never call
back into Reboot state. They touch only the store's directory,
mirroring how a presigned S3 URL is served by S3 without consulting
the application.
"""

import hashlib
import hmac
import os
import re
import time
from reboot.std.blobs.v1._store import (
    HTTP_PATH_PREFIX,
    MAX_PARTS,
    FilesystemBlobStore,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route

_STREAM_CHUNK_SIZE = 1024 * 1024

# Path parameters are also filesystem path components; restrict them
# to the alphabets the store actually produces (URL-safe base64 blob
# ids, hex upload ids) as defense in depth against traversal — even
# though a forged path could never carry a valid signature.
_ENCODED_BLOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")
_UPLOAD_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class _PartTooLarge(Exception):
    pass


def _signature_matches(expected: str, actual: str) -> bool:
    return hmac.compare_digest(expected, actual)


def _expired(request: Request) -> bool:
    expiration = request.query_params.get("exp", "0")
    return not expiration.isdigit() or int(expiration) < time.time()


def _make_put_part(store: FilesystemBlobStore):

    async def put_part(request: Request) -> Response:
        blob = request.path_params["blob"]
        upload = request.path_params["upload"]
        try:
            part = int(request.path_params["part"])
        except ValueError:
            return Response(status_code=400, content="Invalid part number")

        if part < 1 or part > MAX_PARTS:
            return Response(status_code=400, content="Invalid part number")
        if (
            not _ENCODED_BLOB_ID_PATTERN.match(blob) or
            not _UPLOAD_ID_PATTERN.match(upload)
        ):
            return Response(status_code=400, content="Invalid blob id")
        if _expired(request):
            return Response(status_code=403, content="URL expired")
        expiration = int(request.query_params.get("exp", "0"))
        expected = store.signature_for_put(blob, upload, part, expiration)
        if not _signature_matches(
            expected, request.query_params.get("sig", "")
        ):
            return Response(status_code=403, content="Invalid signature")

        path = store.part_path(blob, upload, part)
        # The upload directory is created by `begin_upload`; a missing
        # directory means the blob was never created (or was deleted).
        if not os.path.isdir(os.path.dirname(path)):
            return Response(status_code=404, content="No such upload")

        # Refuse to mutate a committed blob's bytes: the part files
        # *are* the committed object's on-disk representation, so a
        # part-PUT URL minted just before commit must not still be
        # usable to tamper with the bytes afterwards.
        meta = store.read_meta(blob)
        if meta is not None and meta.get("committed", False):
            return Response(status_code=409, content="Blob already committed")

        digest = hashlib.md5()
        size = 0
        try:
            with open(path, "wb") as f:
                async for chunk in request.stream():
                    if size + len(chunk) > store.part_size:
                        raise _PartTooLarge()
                    digest.update(chunk)
                    size += len(chunk)
                    f.write(chunk)
                f.flush()
                os.fsync(f.fileno())
        except _PartTooLarge:
            os.unlink(path)
            return Response(
                status_code=413,
                content=(
                    "Part exceeds the maximum part size of "
                    f"{store.part_size} bytes"
                ),
            )

        # Match S3: the ETag response header is the part's MD5, quoted.
        return Response(
            status_code=200,
            headers={"ETag": f'"{digest.hexdigest()}"'},
        )

    return put_part


def _make_get_blob(store: FilesystemBlobStore):

    async def get_blob(request: Request) -> Response:
        blob = request.path_params["blob"]
        if not _ENCODED_BLOB_ID_PATTERN.match(blob):
            return Response(status_code=400, content="Invalid blob id")
        if _expired(request):
            return Response(status_code=403, content="URL expired")
        expiration = int(request.query_params.get("exp", "0"))
        expected = store.signature_for_get(blob, expiration)
        if not _signature_matches(
            expected, request.query_params.get("sig", "")
        ):
            return Response(status_code=403, content="Invalid signature")

        meta = store.read_meta(blob)
        if meta is None or not meta.get("committed", False):
            return Response(status_code=404, content="No such blob")

        upload_id = meta["upload_id"]
        parts = meta["parts"]
        total_size = sum(part["size"] for part in parts)

        async def stream():
            for part in sorted(parts, key=lambda part: part["number"]):
                path = store.part_path(blob, upload_id, part["number"])
                with open(path, "rb") as f:
                    while chunk := f.read(_STREAM_CHUNK_SIZE):
                        yield chunk

        return StreamingResponse(
            stream(),
            media_type=meta["content_type"],
            headers={
                "Content-Length": str(total_size),
                "ETag": f'"{meta["etag"]}"',
                "Accept-Ranges": "none",
            },
        )

    return get_blob


def build_http_app(store: FilesystemBlobStore) -> Starlette:
    """Builds the Starlette app serving `store`'s byte `PUT`/`GET`."""
    return Starlette(
        routes=[
            Route(
                HTTP_PATH_PREFIX + "/{blob}/{upload}/parts/{part}",
                _make_put_part(store),
                methods=["PUT"],
            ),
            Route(
                HTTP_PATH_PREFIX + "/{blob}",
                _make_get_blob(store),
                methods=["GET"],
            ),
        ],
    )
