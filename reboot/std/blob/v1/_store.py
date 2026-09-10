"""The filesystem blob store: bytes storage for the open-source blob
data plane.

A blob's *bytes* live here; all its metadata lives in state machines.
The `Blob` control plane (see `blob.proto`) holds what the application
knows about a blob, and `StoredBlob` (see `filesystem.proto`) holds
what this store knows about its parts. Nothing about an object is
recorded on disk beside the bytes, so any of a replica's servers can
serve an upload or a download for one blob while agreeing with the
others on nothing but the directory.

The store mimics S3's multipart-upload semantics (numbered parts,
per-part MD5 ETags, ETag-validating completion) so that clients drive
one protocol regardless of which data plane serves them.
"""

import aiofiles
import asyncio
import base64
import hashlib
import hmac
import os
import shutil
import time
from dataclasses import dataclass
from reboot.crypto import root_keys
from typing import AsyncIterator, Optional, Sequence
from uuid import uuid4

# The part size clients should use. Every part except the last must be
# exactly this size. Must be at least 5 MiB (the S3 minimum part size,
# mirrored here so that filesystem- and S3-backed data planes are
# interchangeable).
DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024

# The maximum number of parts in one blob, following S3.
MAX_PARTS = 10000

# Default validity of minted upload/download URLs.
DEFAULT_URL_TTL_SECONDS = 15 * 60

# The longest this store will sign a URL for. A signed URL is a bearer
# capability that cannot be revoked before it lapses, so the ceiling is
# this store's own policy; other stores set their own, bounded by
# whatever their signing scheme allows.
_MAX_URL_TTL_SECONDS = 7 * 24 * 60 * 60

# The paths under which blob bytes are `PUT` and `GET` on the
# application's own HTTP server (see `_http.py`). The blob, session
# and part travel in the query rather than the path; all of them are
# covered by the URL's signature either way.
PART_PATH = "/__/reboot/blob/part"
BLOB_PATH = "/__/reboot/blob"

# HKDF `info` (domain separator) for the filesystem store's URL-signing
# key.
_SIGNING_INFO = b"reboot.std.blob.url-signing"

_STREAM_CHUNK_SIZE = 1024 * 1024


class BlobStoreError(Exception):
    """A permanent storage failure (e.g. a part missing at completion
    time), reported to the control plane as a `CompleteUpload` `error`
    so the client can re-upload. Transient failures (e.g. network
    errors) are raised as their original exception types instead,
    becoming gRPC errors that the control plane's workflow retries."""


class PartTooLarge(Exception):
    """A part's bytes exceeded the store's part size."""


@dataclass(frozen=True)
class UploadedPart:
    """One part of an upload, as reported by the client."""
    number: int
    etag: str
    size: int


@dataclass(frozen=True)
class WrittenPart:
    """One part of an upload, as this store found its bytes to be."""
    number: int
    etag: str
    size: int
    storage_id: str


@dataclass(frozen=True)
class StagedPart:
    """A part whose bytes are on disk under their final name but not
    yet claimed by the object.

    That name is this write's alone, so publishing a part can never
    land on another's bytes and the manifest decides which of a part
    number's files the object is made of."""
    part: WrittenPart
    path: str


def _encode_blob_id(blob_id: str) -> str:
    """Encodes a blob ID into a string safe for use as both a directory
    name and a URL path segment."""
    return base64.urlsafe_b64encode(blob_id.encode()).decode()


def _unlink_if_present(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def _fsync_directory(path: str) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _publish(temporary: str, path: str) -> None:
    """Renames a part's bytes into place and makes the rename itself
    durable.

    Without the directory `fsync` the rename can still be in the page
    cache when the part is recorded as published, and a crash there
    leaves the manifest naming a file that does not exist -- which
    nothing downstream re-checks, since completion works from the
    digests rather than the bytes."""
    os.replace(temporary, path)
    _fsync_directory(os.path.dirname(path))


def composite_etag(etags: Sequence[str]) -> str:
    """An object's ETag, S3-style: the MD5 of its parts' concatenated
    MD5 digests, suffixed with the part count."""
    digests = b"".join(bytes.fromhex(etag) for etag in etags)
    return hashlib.md5(digests).hexdigest() + f"-{len(etags)}"


class FilesystemBlobStore:
    """Stores blob bytes as part files on the local filesystem, served
    over HTTP by the application (see `_http.py`).

    Layout, under `directory`:

        {encoded_blob_id}/
          {upload_id}/
            part.{number:08d}.{storage_id}   One file per write of a
                                             part; the manifest says
                                             which of them the object
                                             is made of.

    Parts are written under a random `upload_id` directory and fsynced
    before the store reports what they hold. The part files remain the
    committed object's on-disk representation: downloads stream them in
    part order, so completion never rewrites bytes.
    """

    def __init__(
        self,
        directory: str,
        part_size: int = DEFAULT_PART_SIZE_BYTES,
    ):
        self._directory = directory
        self._part_size = part_size
        os.makedirs(directory, exist_ok=True)
        # The store's own entry in its parent, not just its contents:
        # fsyncing a directory persists what is in it, not its name,
        # so without this a crash can take the whole store away along
        # with every committed upload inside it.
        parent = os.path.dirname(os.path.normpath(directory))
        if parent:
            _fsync_directory(parent)

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
        storage_id: str,
    ) -> str:
        """Where one part's bytes live.

        Named by a value minted for the write that produced them as
        well as by the part number, so that the name is immutable:
        re-uploading a part writes a second file rather than replacing
        the first, and what the manifest records is what a download
        reads. Part numbers still order the object; storage IDs only
        keep one part's writes apart. Deliberately not the ETag: MD5
        is what the protocol calls for, and two different parts can
        share one."""
        return os.path.join(
            self.blob_directory(encoded_blob_id),
            upload_id,
            f"part.{part_number:08d}.{storage_id}",
        )

    async def make_upload_directory(
        self,
        blob_id: str,
        upload_id: str,
    ) -> None:
        """Prepares the directory a session's parts are written into."""
        encoded = _encode_blob_id(blob_id)

        def sync():
            os.makedirs(
                os.path.join(self.blob_directory(encoded), upload_id),
                exist_ok=True,
            )
            # Each directory is made durable before anything is
            # written into it: a part file fsynced into a directory
            # entry that a crash then loses is a manifest naming bytes
            # that are not there.
            _fsync_directory(self._directory)
            _fsync_directory(self.blob_directory(encoded))

        await asyncio.to_thread(sync)

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
            f"{PART_PATH}?blob={encoded}&upload={upload_id}"
            f"&part={part_number}&exp={expiration}&sig={signature}"
        )

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
    ) -> tuple[str, int]:
        """Returns a URL to `GET` the blob's bytes from, and how long
        that URL is valid for."""
        encoded = _encode_blob_id(blob_id)
        ttl = min(
            DEFAULT_URL_TTL_SECONDS if ttl_seconds is None else ttl_seconds,
            _MAX_URL_TTL_SECONDS,
        )
        expiration = int(time.time()) + ttl
        signature = self.signature_for_get(encoded, expiration)
        url = (
            f"{BLOB_PATH}?blob={encoded}&exp={expiration}&sig={signature}"
        )
        return url, ttl

    async def stage_part(
        self,
        encoded_blob_id: str,
        upload_id: str,
        part_number: int,
        chunks: AsyncIterator[bytes],
    ) -> StagedPart:
        """Writes one part's bytes under a name nothing reads, and
        reports what they turned out to be, digesting them on the way
        through so that the ETag describes what landed rather than
        what was claimed.

        The bytes land under a name minted for this write, which no
        other write occupies; whether the object is *made of* them is
        `StoredBlob`'s to say. Raises `PartTooLarge`, having kept
        nothing, if the bytes exceed the part size."""
        storage_id = uuid4().hex
        temporary = os.path.join(
            self.blob_directory(encoded_blob_id),
            upload_id,
            f"part.{part_number:08d}.{storage_id}.partial",
        )
        digest = hashlib.md5()
        size = 0
        try:
            # A part is megabytes, so the writes go off the event loop
            # for the same reason the download reads off it: this runs
            # on the loop, and writing inline would stall every other
            # request this server is handling.
            async with aiofiles.open(temporary, "wb") as file:
                async for chunk in chunks:
                    if size + len(chunk) > self._part_size:
                        raise PartTooLarge()
                    digest.update(chunk)
                    size += len(chunk)
                    await file.write(chunk)
                await file.flush()
                # `aiofiles` has no `fsync`; `fileno()` is proxied
                # straight through, so the descriptor is the real one.
                await asyncio.to_thread(os.fsync, file.fileno())
        except BaseException:
            # Never leave a partial file behind to be mistaken for a
            # part.
            await asyncio.to_thread(_unlink_if_present, temporary)
            raise

        path = self.part_path(
            encoded_blob_id, upload_id, part_number, storage_id
        )
        # Renamed into place rather than written there, so a download
        # never catches a part half-written. Safe to do before the
        # manifest claims these bytes, because the name is theirs
        # alone: at worst they are left unclaimed.
        await asyncio.to_thread(_publish, temporary, path)
        return StagedPart(
            part=WrittenPart(
                number=part_number,
                etag=digest.hexdigest(),
                size=size,
                storage_id=storage_id,
            ),
            path=path,
        )

    async def discard_storage_id(
        self,
        encoded_blob_id: str,
        upload_id: str,
        part_number: int,
        storage_id: str,
    ) -> None:
        """Drops one write of a part by name."""
        await asyncio.to_thread(
            _unlink_if_present,
            self.part_path(
                encoded_blob_id, upload_id, part_number, storage_id
            ),
        )

    async def discard_part(self, staged: StagedPart) -> None:
        """Drops a part's bytes, for one the object turned out not to
        be made of.

        Safe because the name belongs to this write alone: no manifest
        can be pointing at it unless this write's own `PublishPart`
        succeeded."""
        await asyncio.to_thread(_unlink_if_present, staged.path)

    async def reclaim(
        self,
        encoded_blob_id: str,
        upload_id: str,
        keep: Sequence[tuple[int, str]],
    ) -> None:
        """Removes every part file of a session except the ones the
        object is made of.

        Called once the manifest is fixed, which is the first moment
        it is known which versions of a part are not in the object:
        a part re-uploaded with different bytes leaves its earlier
        version behind, and a client that uploads more parts than it
        commits leaves those. Until then the extra files are what
        makes re-uploading a part safe, so they cannot be reclaimed
        eagerly."""
        directory = os.path.join(
            self.blob_directory(encoded_blob_id), upload_id
        )
        wanted = {
            os.path.basename(
                self.part_path(
                    encoded_blob_id, upload_id, number, storage_id
                )
            ) for number, storage_id in keep
        }

        def sync():
            try:
                names = os.listdir(directory)
            except FileNotFoundError:
                return
            for name in names:
                if name in wanted:
                    continue
                if name.endswith(".partial"):
                    # A write still in flight. Its own writer removes
                    # it if it fails and renames it if it succeeds;
                    # taking it here would turn that writer's refusal
                    # into a failure to rename.
                    continue
                _unlink_if_present(os.path.join(directory, name))

        await asyncio.to_thread(sync)

    async def read_part(
        self,
        encoded_blob_id: str,
        upload_id: str,
        part_number: int,
        storage_id: str,
    ) -> AsyncIterator[bytes]:
        """Streams one part's bytes: the write the object's manifest
        recorded, and no later write of that part."""
        path = self.part_path(
            encoded_blob_id, upload_id, part_number, storage_id
        )
        # Read off the event loop: this generator is driven by it, and
        # a part is megabytes, so reading inline would stall every
        # other request this server is handling.
        async with aiofiles.open(path, "rb") as file:
            while chunk := await file.read(_STREAM_CHUNK_SIZE):
                yield chunk

    async def upload_directory_exists(
        self,
        encoded_blob_id: str,
        upload_id: str,
    ) -> bool:
        return await asyncio.to_thread(
            os.path.isdir,
            os.path.join(self.blob_directory(encoded_blob_id), upload_id),
        )

    async def delete(self, blob_id: str) -> None:
        """Removes every byte this store holds for a blob."""
        encoded = _encode_blob_id(blob_id)

        def sync():
            # Only a blob that is already gone is ignored: any other
            # failure must reach the caller, or `PerformRemove` would
            # report bytes deleted that are still on disk.
            try:
                shutil.rmtree(self.blob_directory(encoded))
            except FileNotFoundError:
                pass

        await asyncio.to_thread(sync)
