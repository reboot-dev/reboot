"""The filesystem blob data plane.

Implements the `BlobDataPlane` gRPC service (see `data_plane.proto`)
over bytes on local disk, for an application that has not been pointed
at a data plane elsewhere. A plain gRPC service, like the Cloud
facilitator's S3-backed one, so that the control plane speaks one
interface wherever the bytes live and over whatever transport reaches
them.

Being a service of the application means being routed like one, and
Reboot serves legacy gRPC to whoever can reach the application --
Envoy will even transcode HTTP to it. Nothing here may be called that
way: `GetDownloadUrl` mints a capability for a blob's bytes and
`Delete` destroys them, both without consulting the `Blob` control
plane, whose authorizer is what decides who may read or remove a blob.
So every method names its caller first, exactly as the facilitator's
data plane does, and on the same footing as every other authorizer
that asks whether a call is app-internal. What that rests on is
Envoy: a listener whose caller IDs it does not trust has
`x-reboot-caller-id` removed from everything arriving on it (see
`trust_caller_id` in `reboot/routing/envoy_config.py`), so a caller ID
that survives was put there by something entitled to. Off Reboot Cloud
that means the trusted port; on it, the proxies in front of the public
port are what make caller IDs truthful.

Metadata lives in `StoredBlob`; bytes live in `FilesystemBlobStore`.
Neither holds state of its own, so any of a replica's servers can
serve any call.
"""

import grpc
import rbt.v1alpha1.errors_pb2
from rbt.std.blob.v1.data_plane_pb2 import (
    ConfigurationResponse,
    DataPlaneBeginUploadResponse,
    DataPlaneCompleteUploadResponse,
    DataPlaneDeleteResponse,
    DataPlaneGetDownloadUrlResponse,
    DataPlaneGetPartUploadInstructionsResponse,
    DataPlanePartUploadInstruction,
)
from rbt.std.blob.v1.data_plane_pb2_grpc import BlobDataPlaneServicer
from rbt.std.blob.v1.filesystem_rbt import StoredBlob, StoredPart
from reboot.aio.caller_id import CallerID
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.interceptors import LegacyGrpcContext
from reboot.aio.internals.contextvars import get_application_id
from reboot.std.blob.v1._store import (
    BlobStoreError,
    FilesystemBlobStore,
    _encode_blob_id,
    composite_etag,
)
from typing import Optional
from uuid import NAMESPACE_URL, uuid5


def _begin_upload_key(blob_id: str):
    """The idempotency key for beginning one blob's upload.

    Derived from the blob ID rather than taken from the caller,
    because the control plane both retries this inside a workflow and
    re-runs it to validate that workflow's effects. "Begin the upload
    for this blob" is one operation however many times it is asked
    for, so the blob names it."""
    return uuid5(NAMESPACE_URL, f"reboot.std.blob.v1/begin-upload/{blob_id}")


class FilesystemDataPlaneServicer(BlobDataPlaneServicer):
    """Serves `BlobDataPlane` from the application whose blobs it
    holds.

    The store is set by `BlobLibrary` once it knows where this
    application keeps them."""

    _store: FilesystemBlobStore

    async def _caller(self, context: LegacyGrpcContext):
        """Refuses anyone but this application's own code, and returns
        a context for reaching `StoredBlob`.

        This is the check `is_app_internal` makes, made by hand
        because a legacy gRPC servicer has no authorizer to make it.
        It reads a header, and what stands behind that header is
        Envoy removing it from traffic whose caller IDs it does not
        trust -- see the note at the top of this module."""
        application_id = get_application_id()
        caller_id_header = dict(context.invocation_metadata()
                               ).get(CALLER_ID_HEADER)
        if caller_id_header is None or application_id is None:
            await context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "the blob data plane serves only the application it "
                "belongs to",
            )
            raise RuntimeError("This is unreachable")

        try:
            caller_id = CallerID.parse(caller_id_header)
        except ValueError:
            await context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "cannot deduce calling application from caller ID header",
            )
            raise RuntimeError("This is unreachable")

        if caller_id.application_id != application_id:
            await context.abort(
                grpc.StatusCode.PERMISSION_DENIED,
                "the blob data plane serves only the application it "
                "belongs to",
            )
            raise RuntimeError("This is unreachable")

        return context.external_context(name="blob data plane")

    async def Configuration(self, request, context: LegacyGrpcContext):
        await self._caller(context)
        return ConfigurationResponse(part_size=self._store.part_size)

    async def BeginUpload(
        self,
        request,
        grpc_context: LegacyGrpcContext,
    ):
        context = await self._caller(grpc_context)
        _, response = await StoredBlob.idempotently(
            key=_begin_upload_key(request.blob_id),
        ).BeginUpload(
            context,
            request.blob_id,
            content_type=request.content_type,
        )
        # After the session exists in state, so a directory is never
        # left behind for a session nothing knows about.
        await self._store.make_upload_directory(
            request.blob_id,
            response.upload_id,
        )
        return DataPlaneBeginUploadResponse(upload_id=response.upload_id)

    async def GetPartUploadInstructions(
        self,
        request,
        grpc_context: LegacyGrpcContext,
    ):
        context = await self._caller(grpc_context)
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
        return DataPlaneGetPartUploadInstructionsResponse(
            instructions=instructions
        )

    async def CompleteUpload(
        self,
        request,
        grpc_context: LegacyGrpcContext,
    ):
        context = await self._caller(grpc_context)
        try:
            etag = await self._complete(request, context)
            return DataPlaneCompleteUploadResponse(etag=etag)
        except BlobStoreError as error:
            # A permanent failure: report it so the control plane can
            # surface it and let the client re-upload. Transient
            # failures raise other exceptions, which the control
            # plane's workflow retries.
            return DataPlaneCompleteUploadResponse(error=str(error))

    async def _stored(self, blob_id: str, context):
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

    async def _complete(self, request, context) -> str:
        stored = await self._stored(request.blob_id, context)
        if stored is None:
            raise BlobStoreError("no upload was ever begun for this blob")
        if stored.committed:
            # A retried `CompleteUpload`. The object is finished and
            # its ETag is what it was -- but reclaiming may not have
            # run, or not finished, so it runs again from what was
            # committed.
            await self._store.reclaim(
                _encode_blob_id(request.blob_id),
                stored.upload_id,
                [(part.number, part.storage_id) for part in stored.parts],
            )
            return stored.etag
        if stored.upload_id != request.upload_id:
            # The parts that would be committed were written under a
            # different session than the one being completed, so they
            # are not the parts this verified.
            raise BlobStoreError(
                "the upload session being completed is not the one this "
                "blob's parts were written under"
            )

        published = {part.number: part for part in stored.parts}
        reported = {part.number: part for part in request.parts}
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
            if (
                number != last_part_number and
                part.size != self._store.part_size
            ):
                # S3 rejects a short middle part with `EntityTooSmall`;
                # reject it here too, so that an upload which cannot
                # commit against the S3 store cannot commit against
                # this one either.
                raise BlobStoreError(
                    f"part {number} is {part.size} bytes, but every part "
                    f"except the last must be exactly "
                    f"{self._store.part_size} bytes"
                )

        total_size = sum(published[number].size for number in reported)
        max_size: Optional[int] = (
            request.max_size if request.HasField("max_size") else None
        )
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
        committed = await StoredBlob.ref(request.blob_id).always().commit(
            context,
            upload_id=request.upload_id,
            content_type=request.content_type,
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
        # reclaims them above.
        # `commit` accepted this manifest, and refuses one whose parts
        # have been superseded, so it is exactly what was recorded.
        await self._store.reclaim(
            _encode_blob_id(request.blob_id),
            request.upload_id,
            [(part.number, part.storage_id) for part in manifest],
        )
        return etag

    async def GetDownloadUrl(
        self,
        request,
        grpc_context: LegacyGrpcContext,
    ):
        context = await self._caller(grpc_context)
        url, ttl_seconds = self._store.download_url(
            request.blob_id,
            request.ttl_seconds if request.HasField("ttl_seconds") else None,
        )
        return DataPlaneGetDownloadUrlResponse(
            url=url,
            ttl_seconds=ttl_seconds,
        )

    async def Delete(
        self,
        request,
        grpc_context: LegacyGrpcContext,
    ):
        context = await self._caller(grpc_context)
        # `upload_ids` is not needed here: a part lives inside the
        # blob's own directory, so removing the directory removes any
        # unfinished upload with it.
        # Forgotten before the bytes go, so that nothing reads a
        # manifest naming bytes that are already gone: between the two
        # a download would answer `200` and then run out of file.
        try:
            await StoredBlob.ref(request.blob_id).always().forget(context)
        except StoredBlob.ForgetAborted as aborted:
            # Nothing was ever stored for this blob, so there is
            # nothing to forget and deleting it has succeeded.
            if not isinstance(
                aborted.error,
                rbt.v1alpha1.errors_pb2.StateNotConstructed,
            ):
                raise
        await self._store.delete(request.blob_id)
        return DataPlaneDeleteResponse()


def legacy_grpc_servicers() -> list[type]:
    return [FilesystemDataPlaneServicer]
