"""The filesystem blob store: the open-source blob data plane's
storage, and the bookkeeping that makes it one.

A blob's *bytes* live here as part files; its metadata lives in state
machines. The `Blob` control plane (see `blob.proto`) holds what the
application knows about a blob, and `StoredBlob` (see
`filesystem.proto`) holds what this store knows about its parts:
which session they were written under, which writes the object is
made of, whether it is committed. Nothing about an object is recorded
on disk beside the bytes, so any of a replica's servers can serve an
upload or a download for one blob while agreeing with the others on
nothing but the directory -- `StoredBlob` is where their writes are
ordered against each other.

This store drives that state machine itself, so that it offers the
same surface an object store does (`begin_upload`, `complete`,
`delete`, ...) and whoever serves it -- the `BlobDataPlane` servicer,
the byte routes -- only authorizes and delegates. Its methods take
the context they reach `StoredBlob` with; a store backed by an object
store keeps its metadata there instead and needs none.

The store mimics S3's multipart-upload semantics (numbered parts,
per-part MD5 ETags, ETag-validating completion) so that clients drive
one protocol regardless of which data plane serves them.
"""

from __future__ import annotations

import aiofiles
import aiofiles.os
import asyncio
import base64
import hashlib
import hmac
import os
import rbt.std.blob.v1.filesystem_pb2 as filesystem_pb2
import rbt.v1alpha1.errors_pb2
import shutil
import time
from dataclasses import dataclass
from rbt.std.blob.v1.filesystem_rbt import StoredBlob, StoredPart
from reboot.aio.external import ExternalContext
from reboot.crypto import root_keys
from typing import AsyncIterator, Optional, Sequence
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

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

_STREAM_CHUNK_BYTES = 1024 * 1024


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


async def _unlink_if_present(path: str) -> None:
    try:
        await aiofiles.os.unlink(path)
    except FileNotFoundError:
        pass


async def _fsync_directory(path: str) -> None:
    """Persists a directory's entries. In a thread, since `aiofiles`
    has no `fsync`."""

    def sync() -> None:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    await asyncio.to_thread(sync)


async def _publish(temporary: str, path: str) -> None:
    """Renames a part's bytes into place and makes the rename itself
    durable.

    Without the directory `fsync` the rename can still be in the page
    cache when the part is recorded as published, and a crash there
    leaves the manifest naming a file that does not exist -- which
    nothing downstream re-checks, since completion works from the
    digests rather than the bytes."""
    await aiofiles.os.replace(temporary, path)
    await _fsync_directory(os.path.dirname(path))


def composite_etag(etags: Sequence[str]) -> str:
    """An object's ETag, S3-style: the MD5 of its parts' concatenated
    MD5 digests, suffixed with the part count."""
    digests = b"".join(bytes.fromhex(etag) for etag in etags)
    return hashlib.md5(digests).hexdigest() + f"-{len(etags)}"


def _begin_upload_key(blob_id: str) -> UUID:
    """The idempotency key for beginning one blob's upload.

    Derived from the blob ID rather than taken from the caller,
    because the control plane both retries this inside a workflow and
    re-runs it to validate that workflow's effects. "Begin the upload
    for this blob" is one operation however many times it is asked
    for, so the blob names it."""
    return uuid5(NAMESPACE_URL, f"reboot.std.blob.v1/begin-upload/{blob_id}")


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
    ) -> None:
        self._directory = directory
        self._part_size = part_size

    @classmethod
    async def create(
        cls,
        directory: str,
        part_size: int = DEFAULT_PART_SIZE_BYTES,
    ) -> FilesystemBlobStore:
        """A store over `directory`, which is created if it does not
        exist and made durable before anything is written into it."""
        await aiofiles.os.makedirs(directory, exist_ok=True)
        # The store's own entry in its parent, not just its contents:
        # fsyncing a directory persists what is in it, not its name,
        # so without this a crash can take the whole store away along
        # with every committed upload inside it.
        parent = os.path.dirname(os.path.normpath(directory))
        if parent:
            await _fsync_directory(parent)
        return cls(directory, part_size)

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

    async def begin_upload(
        self,
        context: ExternalContext,
        blob_id: str,
        content_type: str,
    ) -> str:
        """Establishes the session a blob's parts are written under and
        returns it: the one already established, if there is one."""
        _, response = await StoredBlob.idempotently(
            key=_begin_upload_key(blob_id),
        ).BeginUpload(
            context,
            blob_id,
            content_type=content_type,
        )
        # After the session exists in state, so a directory is never
        # left behind for a session nothing knows about.
        await self._make_upload_directory(blob_id, response.upload_id)
        return response.upload_id

    async def _make_upload_directory(
        self,
        blob_id: str,
        upload_id: str,
    ) -> None:
        """Prepares the directory a session's parts are written into."""
        encoded = _encode_blob_id(blob_id)
        await aiofiles.os.makedirs(
            os.path.join(self.blob_directory(encoded), upload_id),
            exist_ok=True,
        )
        # Each directory is made durable before anything is written
        # into it: a part file fsynced into a directory entry that a
        # crash then loses is a manifest naming bytes that are not
        # there.
        await _fsync_directory(self._directory)
        await _fsync_directory(self.blob_directory(encoded))

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
        url = (f"{BLOB_PATH}?blob={encoded}&exp={expiration}&sig={signature}")
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
            await _unlink_if_present(temporary)
            raise

        path = self.part_path(
            encoded_blob_id, upload_id, part_number, storage_id
        )
        # Renamed into place rather than written there, so a download
        # never catches a part half-written. Safe to do before the
        # manifest claims these bytes, because the name is theirs
        # alone: at worst they are left unclaimed.
        await _publish(temporary, path)
        return StagedPart(
            part=WrittenPart(
                number=part_number,
                etag=digest.hexdigest(),
                size=size,
                storage_id=storage_id,
            ),
            path=path,
        )

    async def publish_part(
        self,
        context: ExternalContext,
        blob_id: str,
        upload_id: str,
        staged: StagedPart,
    ) -> bool:
        """Makes a staged part's bytes part of the object, and says
        whether it did.

        The bytes are on disk under a name of their own; whether the
        object is made of them is `StoredBlob`'s to decide, and it
        decides for every server that might be serving this blob.
        Refused bytes are removed, which is safe because the file's
        name belongs to this write alone: no manifest can point at it
        unless this very claim succeeded. Anything that outlives an
        interrupted request is reclaimed at completion, and with the
        blob's directory on `delete`."""
        published = await StoredBlob.ref(blob_id).always().publish_part(
            context,
            upload_id=upload_id,
            part=StoredPart(
                number=staged.part.number,
                size=staged.part.size,
                etag=staged.part.etag,
                storage_id=staged.part.storage_id,
            ),
        )
        if not published.published:
            await _unlink_if_present(staged.path)
            return False
        if published.HasField("superseded_storage_id"):
            # This part had been uploaded before. Nothing is made of
            # the earlier bytes now, and the manifest that could still
            # name them is refused at completion, so they are removed
            # rather than left to accumulate a file per attempt.
            await _unlink_if_present(
                self.part_path(
                    _encode_blob_id(blob_id),
                    upload_id,
                    staged.part.number,
                    published.superseded_storage_id,
                ),
            )
        return True

    async def _reclaim(
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
                self.part_path(encoded_blob_id, upload_id, number, storage_id)
            ) for number, storage_id in keep
        }

        try:
            names = await aiofiles.os.listdir(directory)
        except FileNotFoundError:
            return
        for name in names:
            if name in wanted:
                continue
            if name.endswith(".partial"):
                # A write still in flight. Its own writer removes it if
                # it fails and renames it if it succeeds; taking it
                # here would turn that writer's refusal into a failure
                # to rename.
                continue
            await _unlink_if_present(os.path.join(directory, name))

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
            while chunk := await file.read(_STREAM_CHUNK_BYTES):
                yield chunk

    async def upload_directory_exists(
        self,
        encoded_blob_id: str,
        upload_id: str,
    ) -> bool:
        return await aiofiles.os.path.isdir(
            os.path.join(self.blob_directory(encoded_blob_id), upload_id)
        )

    async def stored(
        self,
        context: ExternalContext,
        blob_id: str,
    ) -> Optional[filesystem_pb2.StoredBlob]:
        """The metadata stored for a blob, or `None` when none is.

        A blob whose upload never began has no state at all, which the
        framework reports by refusing the read rather than by
        answering with an absent one."""
        try:
            metadata = await StoredBlob.ref(blob_id).metadata(context)
        except StoredBlob.MetadataAborted as aborted:
            if isinstance(
                aborted.error,
                rbt.v1alpha1.errors_pb2.StateNotConstructed,
            ):
                return None
            raise
        return metadata.blob if metadata.HasField("blob") else None

    async def complete(
        self,
        context: ExternalContext,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: Sequence[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str:
        """Finishes the object from the parts the client reports,
        checking each against what was actually written, and returns
        its ETag. Raises `BlobStoreError` for what can never succeed;
        completing an already-completed blob returns its ETag."""
        stored = await self.stored(context, blob_id)
        if stored is None:
            raise BlobStoreError("no upload was ever begun for this blob")
        if stored.committed:
            # A retried completion. The object is finished and its
            # ETag is what it was -- but reclaiming may not have run,
            # or not finished, so it runs again from what was
            # committed.
            await self._reclaim(
                _encode_blob_id(blob_id),
                stored.upload_id,
                [(part.number, part.storage_id) for part in stored.parts],
            )
            return stored.etag
        if stored.upload_id != upload_id:
            # The parts that would be committed were written under a
            # different session than the one being completed, so they
            # are not the parts this verified.
            raise BlobStoreError(
                "the upload session being completed is not the one this "
                "blob's parts were written under"
            )

        published = {part.number: part for part in stored.parts}
        reported = {part.number: part for part in parts}
        if len(reported) == 0:
            raise BlobStoreError("no parts were reported")

        last_part_number = max(reported)
        for number in sorted(reported):
            part = published.get(number)
            if part is None:
                raise BlobStoreError(f"part {number} was never uploaded")
            if part.etag != reported[number].etag.strip('"'):
                raise BlobStoreError(
                    f"part {number} ETag mismatch: the uploaded bytes do "
                    "not match what was reported via `PartUploaded`"
                )
            if part.size != reported[number].size:
                raise BlobStoreError(
                    f"part {number} size mismatch: uploaded {part.size} "
                    f"bytes but {reported[number].size} were reported via "
                    "`PartUploaded`"
                )
            if number != last_part_number and part.size != self._part_size:
                # S3 rejects a short middle part with `EntityTooSmall`;
                # reject it here too, so that an upload which cannot
                # commit against the S3 store cannot commit against
                # this one either.
                raise BlobStoreError(
                    f"part {number} is {part.size} bytes, but every part "
                    f"except the last must be exactly {self._part_size} "
                    "bytes"
                )

        total_size = sum(published[number].size for number in reported)
        # Checked against what the parts were found to hold, not
        # against the sizes that were reported alongside them.
        if max_size is not None and total_size > max_size:
            raise BlobStoreError(
                f"uploaded {total_size} bytes exceeds the maximum of "
                f"{max_size}"
            )

        manifest = [
            StoredPart(
                number=number,
                size=published[number].size,
                etag=published[number].etag,
                storage_id=published[number].storage_id,
            ) for number in sorted(reported)
        ]
        etag = composite_etag([part.etag for part in manifest])
        committed = await StoredBlob.ref(blob_id).always().commit(
            context,
            upload_id=upload_id,
            content_type=content_type,
            etag=etag,
            parts=manifest,
        )
        if not committed.committed:
            raise BlobStoreError(
                "a part was uploaded again while this upload was being "
                "completed; report the parts and commit again"
            )
        # The manifest is fixed, so anything else this session wrote
        # -- a part uploaded and never reported, a version of a part
        # that lost -- belongs to nothing and is safe to remove. Done
        # after the commit, so a failure here leaves files behind
        # rather than taking away bytes the object is made of; a retry
        # reclaims them above. `commit` accepted this manifest, and
        # refuses one whose parts have been superseded, so it is
        # exactly what was recorded.
        await self._reclaim(
            _encode_blob_id(blob_id),
            upload_id,
            [(part.number, part.storage_id) for part in manifest],
        )
        return etag

    async def delete(
        self,
        context: ExternalContext,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        """Removes a blob's bytes and any unfinished upload of it.
        Idempotent: deleting an absent blob succeeds.

        A part lives inside the blob's own directory, so removing the
        directory removes any unfinished upload with it, whatever
        `upload_ids` says. Forgotten before the bytes go, so that
        nothing reads a manifest naming bytes that are already gone:
        between the two a download would answer `200` and then run out
        of file."""
        try:
            await StoredBlob.ref(blob_id).always().forget(context)
        except StoredBlob.ForgetAborted as aborted:
            if isinstance(
                aborted.error,
                rbt.v1alpha1.errors_pb2.StateNotConstructed,
            ):
                # Nothing was ever stored for this blob, so there is
                # nothing to forget and deleting it has succeeded.
                pass
            else:
                raise
        await self._remove_bytes(blob_id)

    async def _remove_bytes(self, blob_id: str) -> None:
        """Removes every byte this store holds for a blob."""
        encoded = _encode_blob_id(blob_id)
        # Only a blob that is already gone is ignored: any other failure
        # must reach the caller, or `PerformRemove` would report bytes
        # deleted that are still on disk. In a thread because
        # `aiofiles` has no `rmtree`.
        try:
            await asyncio.to_thread(
                shutil.rmtree, self.blob_directory(encoded)
            )
        except FileNotFoundError:
            pass
