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

import asyncio
import hashlib
import hmac
import os
import re
import time
from reboot.std.blob.v1._content_type import download_headers
from reboot.std.blob.v1._store import (
    HTTP_PATH_PREFIX,
    MAX_PARTS,
    FilesystemBlobStore,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route
from typing import Optional
from uuid import uuid4

_STREAM_CHUNK_SIZE = 1024 * 1024

# Path parameters are also filesystem path components; restrict them
# to the alphabets the store actually produces (URL-safe base64 blob
# IDs, hex upload IDs) as defense in depth against traversal — even
# though a forged path could never carry a valid signature.
_ENCODED_BLOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+={0,2}$")
_UPLOAD_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")

# Enough digits for any epoch second this will ever mint, and
# far below the length `int()` refuses.
_MAX_EXPIRATION_DIGITS = 20


class _PartTooLarge(Exception):
    pass


def _signature_matches(expected: str, actual: str) -> bool:
    # Compared as bytes: `compare_digest` refuses `str` arguments
    # that are not ASCII, and `actual` is a query parameter, so a
    # request can otherwise choose to raise here.
    return hmac.compare_digest(
        expected.encode("utf-8"),
        actual.encode("utf-8"),
    )


def _unexpired_expiration(request: Request) -> Optional[int]:
    """The `exp` a signed URL carries, or `None` if it has passed or
    is not one this endpoint ever mints.

    The single place `exp` is parsed. It is attacker-chosen and is
    read before anything has been verified, so every way `int()`
    can refuse a string has to be excluded before calling it:
    `isdigit()` alone admits characters like superscript two, and
    both it and `isascii()` admit digit strings longer than
    `sys.get_int_max_str_digits()`, which `int()` refuses in order
    to bound its own quadratic parse."""
    expiration = request.query_params.get("exp", "0")
    if (
        not expiration.isascii() or not expiration.isdigit() or
        len(expiration) > _MAX_EXPIRATION_DIGITS
    ):
        return None
    parsed = int(expiration)
    if parsed < time.time():
        return None
    return parsed


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
            return Response(status_code=400, content="Invalid blob ID")
        expiration = _unexpired_expiration(request)
        if expiration is None:
            return Response(status_code=403, content="URL expired")
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

        # Write somewhere else and publish with a rename, rather than
        # writing `path` in place: completion reads the part files to
        # validate them, and a part being rewritten underneath it
        # would leave a committed blob whose bytes no longer match the
        # ETag it recorded. A rename is atomic, so completion sees
        # either the whole old part or the whole new one.
        temporary = f"{path}.{uuid4().hex}.partial"
        digest = hashlib.md5()
        size = 0
        try:
            with open(temporary, "wb") as f:
                async for chunk in request.stream():
                    if size + len(chunk) > store.part_size:
                        raise _PartTooLarge()
                    digest.update(chunk)
                    size += len(chunk)
                    f.write(chunk)
                f.flush()
                os.fsync(f.fileno())
        except _PartTooLarge:
            os.unlink(temporary)
            return Response(
                status_code=413,
                content=(
                    "Part exceeds the maximum part size of "
                    f"{store.part_size} bytes"
                ),
            )
        except BaseException:
            # Never leave a partial file behind to be mistaken for a
            # part.
            if os.path.exists(temporary):
                os.unlink(temporary)
            raise

        # Publish under the blob's lock, and re-read the metadata
        # inside it: completion may have run while these bytes were
        # being uploaded, and a part must not appear after the blob it
        # belongs to has been committed.
        async with store.lock_for(blob):
            meta = store.read_meta(blob)
            if meta is not None and meta.get("committed", False):
                os.unlink(temporary)
                return Response(
                    status_code=409, content="Blob already committed"
                )
            os.replace(temporary, path)

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
            return Response(status_code=400, content="Invalid blob ID")
        expiration = _unexpired_expiration(request)
        if expiration is None:
            return Response(status_code=403, content="URL expired")
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
                # Read off the event loop: this generator is driven by
                # it, and a part is megabytes, so reading inline would
                # stall every other request this worker is serving.
                file = await asyncio.to_thread(open, path, "rb")
                try:
                    while chunk := await asyncio.to_thread(
                        file.read,
                        _STREAM_CHUNK_SIZE,
                    ):
                        yield chunk
                finally:
                    await asyncio.to_thread(file.close)

        media_type, safety_headers = download_headers(meta["content_type"])
        return StreamingResponse(
            stream(),
            media_type=media_type,
            headers={
                "Content-Length": str(total_size),
                "ETag": f'"{meta["etag"]}"',
                "Accept-Ranges": "none",
                **safety_headers,
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
