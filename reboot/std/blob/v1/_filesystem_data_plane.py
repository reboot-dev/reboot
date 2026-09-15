"""The filesystem blob data plane.

Implements the `BlobDataPlane` gRPC service (see `data_plane.proto`)
over bytes on local disk, for an application that has not been pointed
at a data plane elsewhere. A plain gRPC service, like any other data
plane, so that the control plane speaks one interface wherever the
bytes live and over whatever transport reaches them.

Being a service of the application means being routed like one, and
Reboot serves legacy gRPC to whoever can reach the application --
Envoy will even transcode HTTP to it. Nothing here may be called that
way: `GetDownloadUrl` mints a capability for a blob's bytes and
`Delete` destroys them, both without consulting the `Blob` control
plane, whose authorizer is what decides who may read or remove a blob.
So every method names its caller first, on the same footing as every
other authorizer that asks whether a call is app-internal. What that
rests on is Envoy: a listener whose caller IDs it does not trust has
`x-reboot-caller-id` removed from everything arriving on it (see
`trust_caller_id` in `reboot/routing/envoy_config.py`), so a caller ID
that survives was put there by something entitled to.

Everything else is the store's: `FilesystemBlobStore` keeps the
bytes and drives `StoredBlob`, the state machine that keeps the
metadata, so each call here is authorized and then handed over.
Nothing here holds state of its own, so any of a replica's servers
can serve any call.
"""

import grpc
from rbt.std.blob.v1.data_plane_pb2 import (
    ConfigurationRequest,
    ConfigurationResponse,
    DataPlaneBeginUploadRequest,
    DataPlaneBeginUploadResponse,
    DataPlaneCompleteUploadRequest,
    DataPlaneCompleteUploadResponse,
    DataPlaneDeleteRequest,
    DataPlaneDeleteResponse,
    DataPlaneGetDownloadUrlRequest,
    DataPlaneGetDownloadUrlResponse,
    DataPlaneGetPartUploadInstructionsRequest,
    DataPlaneGetPartUploadInstructionsResponse,
    DataPlanePartUploadInstruction,
)
from rbt.std.blob.v1.data_plane_pb2_grpc import BlobDataPlaneServicer
from reboot.aio.caller_id import CallerID
from reboot.aio.external import ExternalContext
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.interceptors import LegacyGrpcContext
from reboot.aio.internals.contextvars import get_application_id
from reboot.std.blob.v1._store import (
    BlobStoreError,
    FilesystemBlobStore,
    UploadedPart,
)


class FilesystemDataPlaneServicer(BlobDataPlaneServicer):
    """Serves `BlobDataPlane` from the application whose blobs it
    holds: each call is authorized, then handed to the store.

    The store is set by `BlobLibrary` once it knows where this
    application keeps them."""

    _store: FilesystemBlobStore

    async def _authorize_caller(self, context: LegacyGrpcContext) -> None:
        """Refuses anyone but this application's own code.

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

    def _context(self, grpc_context: LegacyGrpcContext) -> ExternalContext:
        """The context the store reaches `StoredBlob` with, on behalf
        of a call `_authorize_caller` has admitted."""
        return grpc_context.external_context(name="blob data plane")

    async def Configuration(
        self,
        request: ConfigurationRequest,
        grpc_context: LegacyGrpcContext,
    ) -> ConfigurationResponse:
        await self._authorize_caller(grpc_context)
        return ConfigurationResponse(part_size=self._store.part_size)

    async def BeginUpload(
        self,
        request: DataPlaneBeginUploadRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneBeginUploadResponse:
        await self._authorize_caller(grpc_context)
        upload_id = await self._store.begin_upload(
            self._context(grpc_context),
            request.blob_id,
            request.content_type,
        )
        return DataPlaneBeginUploadResponse(upload_id=upload_id)

    async def GetPartUploadInstructions(
        self,
        request: DataPlaneGetPartUploadInstructionsRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneGetPartUploadInstructionsResponse:
        await self._authorize_caller(grpc_context)
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
        request: DataPlaneCompleteUploadRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneCompleteUploadResponse:
        await self._authorize_caller(grpc_context)
        try:
            etag = await self._store.complete(
                self._context(grpc_context),
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
            # failures raise other exceptions, which the control
            # plane's workflow retries.
            return DataPlaneCompleteUploadResponse(error=str(error))

    async def GetDownloadUrl(
        self,
        request: DataPlaneGetDownloadUrlRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneGetDownloadUrlResponse:
        await self._authorize_caller(grpc_context)
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
        request: DataPlaneDeleteRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneDeleteResponse:
        await self._authorize_caller(grpc_context)
        await self._store.delete(
            self._context(grpc_context),
            request.blob_id,
            upload_ids=list(request.upload_ids),
        )
        return DataPlaneDeleteResponse()


def legacy_grpc_servicers() -> list[type]:
    return [FilesystemDataPlaneServicer]
