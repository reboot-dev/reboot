"""The filesystem blob store: bytes storage for the open-source blob
data plane.

A blob's *bytes* live here; all its metadata lives in the `Blob` state
machine (the control plane), which talks to the data plane only over
the `BlobDataPlane` gRPC interface (see `data_plane.proto` — that
interface, not this module, is the contract a data plane implements).
The store mimics S3's multipart-upload semantics (numbered parts,
per-part MD5 ETags, ETag-validating completion) so that clients drive
one protocol regardless of which data plane serves them.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import shutil
import time
from dataclasses import dataclass
from reboot.crypto import root_keys
from typing import Optional
from uuid import uuid4

# The part size clients should use. Every part except the last must be
# exactly this size. Must be at least 5 MiB (the S3 minimum part size,
# mirrored here so that filesystem- and S3-backed data planes are
# interchangeable).
DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024

# The maximum number of parts in one blob, following S3.
MAX_PARTS = 10000

# Default (and maximum) validity of minted upload/download URLs.
DEFAULT_URL_TTL_SECONDS = 15 * 60
MAX_URL_TTL_SECONDS = 7 * 24 * 60 * 60

# The URL path prefix under which blob bytes are `PUT` and `GET`: the
# filesystem data-plane server serves it, and the application's proxy
# routes (see `_proxy.py`) forward it.
HTTP_PATH_PREFIX = "/__/reboot/blob"

# HKDF `info` (domain separator) for the filesystem store's URL-signing
# key.
_SIGNING_INFO = b"reboot.std.blobs.url-signing"


class BlobStoreError(Exception):
    """A permanent storage failure (e.g. a part ETag mismatch at
    completion time), reported to the control plane as a
    `CompleteUpload` `error` so the client can re-upload. Transient
    failures (e.g. network errors) are raised as their original
    exception types instead, becoming gRPC errors that the control
    plane's workflow retries."""


@dataclass(frozen=True)
class UploadedPart:
    """One part of an upload, as reported by the client."""
    number: int
    etag: str
    size: int


def _encode_blob_id(blob_id: str) -> str:
    """Encodes a blob id into a string safe for use as both a directory
    name and a URL path segment."""
    return base64.urlsafe_b64encode(blob_id.encode()).decode()


def _fsync_path(path: str) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class FilesystemBlobStore:
    """Stores blob bytes as part files on the local filesystem, served
    over HTTP by the filesystem data-plane server (see `_http.py`).

    Layout, under `directory`:

        {encoded_blob_id}/
          meta.json                  Content type; part manifest and
                                     composite ETag once committed.
          {upload_id}/
            part.{number:08d}        One file per uploaded part.

    Parts are written once under a random `upload_id` directory (so no
    temp-file-and-rename protocol is needed) and fsynced before the
    data plane returns their ETag. The part files remain the committed
    object's on-disk representation: downloads stream them in part
    order, so completion never rewrites bytes.
    """

    def __init__(
        self,
        directory: str,
        part_size: int = DEFAULT_PART_SIZE_BYTES,
    ):
        self._directory = directory
        self._part_size = part_size
        os.makedirs(directory, exist_ok=True)

    @property
    def directory(self) -> str:
        return self._directory

    @property
    def part_size(self) -> int:
        return self._part_size

    def _signing_key(self) -> bytes:
        """The URL-signing key, derived from the active version of the
        Reboot-managed cryptographic root keys (see
        `reboot.crypto.root_keys`) with a blob-specific domain
        separator. Rotating the root keys therefore invalidates
        outstanding URLs; that is acceptable because URLs are
        short-lived and clients can always mint fresh ones."""
        return root_keys.derive_key(
            info=_SIGNING_INFO,
            version=root_keys.active_version(),
        )

    def _sign(self, *parts: str) -> str:
        message = "\n".join(parts).encode()
        return hmac.new(self._signing_key(), message,
                        hashlib.sha256).hexdigest()

    def signature_for_put(
        self,
        encoded_blob_id: str,
        upload_id: str,
        part_number: int,
        expiration: int,
    ) -> str:
        return self._sign(
            "PUT", encoded_blob_id, upload_id, str(part_number),
            str(expiration)
        )

    def signature_for_get(
        self,
        encoded_blob_id: str,
        expiration: int,
    ) -> str:
        return self._sign("GET", encoded_blob_id, str(expiration))

    def blob_directory(self, encoded_blob_id: str) -> str:
        return os.path.join(self._directory, encoded_blob_id)

    def part_path(
        self,
        encoded_blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        return os.path.join(
            self.blob_directory(encoded_blob_id),
            upload_id,
            f"part.{part_number:08d}",
        )

    def _meta_path(self, encoded_blob_id: str) -> str:
        return os.path.join(self.blob_directory(encoded_blob_id), "meta.json")

    def read_meta(self, encoded_blob_id: str) -> Optional[dict]:
        try:
            with open(self._meta_path(encoded_blob_id), "r") as f:
                return json.load(f)
        except FileNotFoundError:
            return None

    def _write_meta(self, encoded_blob_id: str, meta: dict) -> None:
        # Write to a temp file and atomically rename, so a crash
        # mid-write can never leave a torn `meta.json` that a
        # concurrent `read_meta` would fail to parse.
        path = self._meta_path(encoded_blob_id)
        temp_path = f"{path}.{uuid4().hex}.tmp"
        with open(temp_path, "w") as f:
            json.dump(meta, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, path)
        _fsync_path(os.path.dirname(path))

    async def begin_upload(self, blob_id: str, content_type: str) -> str:
        encoded = _encode_blob_id(blob_id)

        def sync():
            # Idempotent by blob id: if an uncommitted session already
            # exists (a retried `BeginUpload`), reuse it rather than
            # orphaning it under a fresh upload id.
            existing = self.read_meta(encoded)
            if (
                existing is not None and
                not existing.get("committed", False) and
                "upload_id" in existing
            ):
                upload_id = existing["upload_id"]
                reuse = True
            else:
                upload_id = uuid4().hex
                reuse = False
            # Create the upload directory (and, with it, the blob
            # directory) before writing `meta.json` into the latter.
            os.makedirs(
                os.path.join(self.blob_directory(encoded), upload_id),
                exist_ok=True,
            )
            if not reuse:
                self._write_meta(
                    encoded,
                    {
                        "content_type": content_type,
                        "committed": False,
                        "upload_id": upload_id,
                    },
                )
            return upload_id

        return await asyncio.to_thread(sync)

    def part_put_url(
        self,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        encoded = _encode_blob_id(blob_id)
        expiration = int(time.time()) + DEFAULT_URL_TTL_SECONDS
        signature = self.signature_for_put(
            encoded, upload_id, part_number, expiration
        )
        return (
            f"{HTTP_PATH_PREFIX}/{encoded}/{upload_id}/parts/{part_number}"
            f"?exp={expiration}&sig={signature}"
        )

    async def complete(
        self,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: list[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str:

        def sync():
            encoded = _encode_blob_id(blob_id)
            digests = []
            manifest = []
            total_size = 0
            for part in sorted(parts, key=lambda part: part.number):
                path = self.part_path(encoded, upload_id, part.number)
                digest = hashlib.md5()
                size = 0
                try:
                    with open(path, "rb") as f:
                        while chunk := f.read(1024 * 1024):
                            digest.update(chunk)
                            size += len(chunk)
                except FileNotFoundError:
                    raise BlobStoreError(
                        f"part {part.number} was never uploaded"
                    )
                if digest.hexdigest() != part.etag.strip('"'):
                    raise BlobStoreError(
                        f"part {part.number} ETag mismatch: the uploaded "
                        "bytes do not match what was reported via "
                        "`PartUploaded`"
                    )
                if size != part.size:
                    raise BlobStoreError(
                        f"part {part.number} size mismatch: uploaded "
                        f"{size} bytes but {part.size} were reported via "
                        "`PartUploaded`"
                    )
                total_size += size
                digests.append(digest.digest())
                manifest.append({"number": part.number, "size": size})

            # Verify the *real* total against `max_size` (not the
            # already-checked reported sizes) as defense in depth.
            if max_size is not None and total_size > max_size:
                raise BlobStoreError(
                    f"uploaded {total_size} bytes exceeds the maximum of "
                    f"{max_size}"
                )

            # Composite ETag, S3-style: the MD5 of the concatenated
            # part MD5 digests, suffixed with the part count.
            etag = (
                hashlib.md5(b"".join(digests)).hexdigest() + f"-{len(digests)}"
            )
            self._write_meta(
                encoded,
                {
                    "content_type": content_type,
                    "committed": True,
                    "etag": etag,
                    "upload_id": upload_id,
                    "parts": manifest,
                },
            )
            return etag

        return await asyncio.to_thread(sync)

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
    ) -> str:
        encoded = _encode_blob_id(blob_id)
        ttl = min(
            ttl_seconds or DEFAULT_URL_TTL_SECONDS,
            MAX_URL_TTL_SECONDS,
        )
        expiration = int(time.time()) + ttl
        signature = self.signature_for_get(encoded, expiration)
        return f"{HTTP_PATH_PREFIX}/{encoded}?exp={expiration}&sig={signature}"

    async def delete(self, blob_id: str) -> None:
        encoded = _encode_blob_id(blob_id)

        def sync():
            shutil.rmtree(self.blob_directory(encoded), ignore_errors=True)

        await asyncio.to_thread(sync)
