"""The byte endpoints of the filesystem blob data plane.

Serves `PUT` (part upload) and `GET` (download) under
`/__/reboot/blob/`, on the application's own HTTP server: the data
plane lives inside the application, so the bytes arrive on the same
origin as everything else with no hop in between.

Every URL carries an expiring HMAC signature minted by the data plane,
and that signature is the caller's whole capability -- these routes are
reachable by anyone. It is therefore checked before anything else
happens, in particular before any of the request's own input reaches
`StoredBlob`. That ordering is what makes it safe for these routes to
hold an app-internal context (see the DANGER note on
`reboot.aio.http`): by the time one is used, the request has proven it
holds a URL this data plane minted for exactly this blob, session and
part.
"""

import base64
import hmac
import re
import time
from rbt.std.blob.v1.filesystem_rbt import StoredBlob, StoredPart
from reboot.aio.external import ExternalContext
from reboot.aio.http import PythonWebFramework
from reboot.std.blob.v1._content_type import download_headers
from reboot.std.blob.v1._store import (
    BLOB_PATH,
    MAX_PARTS,
    PART_PATH,
    FilesystemBlobStore,
    PartTooLarge,
)
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from typing import Optional

# Path parameters are also filesystem path components; restrict them
# to the alphabets the store actually produces (URL-safe base64 blob
# IDs, hex upload IDs) as defense in depth against traversal — even
# though a forged path could never carry a valid signature. Matched
# with `fullmatch`: `$` would also accept a trailing newline, which is
# less than the "only this alphabet" these are here to promise.
_ENCODED_BLOB_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]+={0,2}")
_UPLOAD_ID_PATTERN = re.compile(r"[0-9a-f]{32}")

# Enough digits for any epoch second this will ever mint, and
# far below the length `int()` refuses.
_MAX_EXPIRATION_DIGITS = 20


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


def _verified_context(request: Request) -> ExternalContext:
    """An app-internal context, which is what reaches `StoredBlob`.

    Taken here rather than granted to the route, because a route is
    granted one on the strength of its path: an application that
    happens to serve its own handler at one of these paths -- under
    another method, or through an earlier mount -- would be handed the
    same privilege without having checked anything. Called only below
    a verified signature, so what takes this has proven it holds a URL
    this data plane minted."""
    return request.state.reboot_app_internal_context(request)


def _blob_id(encoded_blob_id: str) -> str:
    """The blob ID a URL's encoded path segment names."""
    return base64.urlsafe_b64decode(encoded_blob_id.encode()).decode()


def _make_put_part(store: FilesystemBlobStore):

    async def put_part(request: Request):
        blob = request.query_params.get("blob", "")
        upload = request.query_params.get("upload", "")
        try:
            part_number = int(request.query_params.get("part", ""))
        except ValueError:
            return Response(status_code=400, content="Invalid part number")

        if part_number < 1 or part_number > MAX_PARTS:
            return Response(status_code=400, content="Invalid part number")
        if (
            not _ENCODED_BLOB_ID_PATTERN.fullmatch(blob) or
            not _UPLOAD_ID_PATTERN.fullmatch(upload)
        ):
            return Response(status_code=400, content="Invalid blob ID")
        expiration = _unexpired_expiration(request)
        if expiration is None:
            return Response(status_code=403, content="URL expired")
        expected = store.signature_for_put(
            blob, upload, part_number, expiration
        )
        if not _signature_matches(
            expected, request.query_params.get("sig", "")
        ):
            return Response(status_code=403, content="Invalid signature")

        # Everything below acts for a caller that has proven it holds a
        # URL this data plane minted.
        if not await store.upload_directory_exists(blob, upload):
            return Response(status_code=404, content="No such upload")

        try:
            staged = await store.stage_part(
                blob,
                upload,
                part_number,
                request.stream(),
            )
        except PartTooLarge:
            return Response(
                status_code=413,
                content=(
                    "Part exceeds the maximum part size of "
                    f"{store.part_size} bytes"
                ),
            )

        # The bytes are on disk under a name of their own; whether
        # the object is made of them is this call's to decide, and it
        # decides for every server that might be serving this blob.
        # Refused bytes go, which is safe because the file's name
        # belongs to this write alone: no manifest can point at it
        # unless this very call's claim succeeded. Anything that
        # outlives an interrupted request is reclaimed at commit, and
        # with the blob's directory on `Delete`.
        published = await StoredBlob.ref(
            _blob_id(blob)
        ).always().publish_part(
            _verified_context(request),
            upload_id=upload,
            part=StoredPart(
                number=staged.part.number,
                size=staged.part.size,
                etag=staged.part.etag,
                storage_id=staged.part.storage_id,
            ),
        )
        if not published.published:
            await store.discard_part(staged)
            return Response(status_code=409, content="Blob already committed")

        if published.HasField("superseded_storage_id"):
            # This part had been uploaded before. Nothing is made of
            # those bytes now, and the manifest that could still name
            # them is refused at commit, so they go rather than
            # accumulating a file per attempt.
            await store.discard_storage_id(
                blob, upload, part_number, published.superseded_storage_id
            )

        # Match S3: the ETag response header is the part's MD5, quoted.
        return Response(
            status_code=200,
            headers={"ETag": f'"{staged.part.etag}"'},
        )

    return put_part


def _make_get_blob(store: FilesystemBlobStore):

    async def get_blob(request: Request):
        blob = request.query_params.get("blob", "")
        if not _ENCODED_BLOB_ID_PATTERN.fullmatch(blob):
            return Response(status_code=400, content="Invalid blob ID")
        expiration = _unexpired_expiration(request)
        if expiration is None:
            return Response(status_code=403, content="URL expired")
        expected = store.signature_for_get(blob, expiration)
        if not _signature_matches(
            expected, request.query_params.get("sig", "")
        ):
            return Response(status_code=403, content="Invalid signature")

        metadata = await StoredBlob.ref(_blob_id(blob)).metadata(
            _verified_context(request)
        )
        stored = metadata.blob if metadata.HasField("blob") else None
        if stored is None or not stored.committed:
            return Response(status_code=404, content="No such blob")

        upload_id = stored.upload_id
        parts = sorted(stored.parts, key=lambda part: part.number)
        total_size = sum(part.size for part in parts)

        async def stream():
            for part in parts:
                async for chunk in store.read_part(
                    blob, upload_id, part.number, part.storage_id
                ):
                    yield chunk

        media_type, safety_headers = download_headers(stored.content_type)
        return StreamingResponse(
            stream(),
            media_type=media_type,
            headers={
                "Content-Length": str(total_size),
                "ETag": f'"{stored.etag}"',
                "Accept-Ranges": "none",
                **safety_headers,
            },
        )

    return get_blob


def mount_byte_routes(
    http: PythonWebFramework.HTTP,
    store: FilesystemBlobStore,
) -> None:
    """Registers the data plane's byte endpoints on the application's
    own HTTP server.

    Registered like any other route, with no privilege of their own:
    what reaches `StoredBlob` is a context each handler takes for
    itself once a signature has verified, which is the only point at
    which it has established anything about its caller."""
    http.put(PART_PATH)(_make_put_part(store))
    http.get(BLOB_PATH)(_make_get_blob(store))
