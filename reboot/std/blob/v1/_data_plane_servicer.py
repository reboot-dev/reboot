"""The `BlobDataPlane` gRPC servicer, for any store.

Every data plane serves the same six RPCs the same way: refuse a
caller it does not serve, then hand the call to its store. What
differs from one data plane to the next is the store and who may
call, so a data plane is a subclass of `BlobDataPlaneServicer` that
answers those two questions, and a store is anything with the
`BlobStore` surface -- a directory of part files here, an object
store elsewhere.
"""

import rbt.std.blob.v1.data_plane_pb2_grpc as data_plane_pb2_grpc
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
from reboot.aio.external import ExternalContext
from reboot.aio.interceptors import LegacyGrpcContext
from reboot.std.blob.v1._store import BlobStoreError, UploadedPart
from typing import Optional, Protocol, Sequence


class BlobStore(Protocol):
    """What a `BlobDataPlaneServicer` needs of a store: S3's multipart
    upload, seen from the control plane.

    Methods that may need to reach Reboot state for their metadata
    take a `context` to do so with; a store whose metadata lives in an
    object store ignores it."""

    @property
    def part_size(self) -> int:
        """The part size clients must use; every part but the last is
        exactly this size."""
        ...

    async def begin_upload(
        self,
        context: ExternalContext,
        blob_id: str,
        content_type: str,
    ) -> str:
        """Establishes the session a blob's parts are written under and
        returns it, reusing an existing uncommitted one where it can."""
        ...

    def part_put_url(
        self,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        """A URL to `PUT` one part's bytes to."""
        ...

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
        checking each against what was actually stored, and returns
        its ETag. Raises `BlobStoreError` for what can never succeed;
        completing an already-completed blob returns its ETag."""
        ...

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
    ) -> tuple[str, int]:
        """A URL to `GET` the blob's bytes from, and how long it is
        valid for."""
        ...

    async def delete(
        self,
        context: ExternalContext,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        """Removes the blob's bytes and any unfinished upload of it.
        Idempotent: deleting an absent blob succeeds."""
        ...


class BlobDataPlaneServicer(data_plane_pb2_grpc.BlobDataPlaneServicer):
    """Serves `BlobDataPlane` from a `BlobStore`: each call is
    authorized, then handed to the store.

    A subclass says which store, in `_blob_store()`, and who may call,
    in `_authorize()`."""

    async def _authorize(self, context: LegacyGrpcContext) -> None:
        """Aborts the call unless its caller is one this data plane
        serves."""
        raise NotImplementedError

    def _blob_store(self) -> BlobStore:
        """The store this data plane serves from."""
        raise NotImplementedError

    def _context(self, grpc_context: LegacyGrpcContext) -> ExternalContext:
        """The context the store reaches Reboot state with, on behalf
        of a call `_authorize` has admitted."""
        return grpc_context.external_context(name="blob data plane")

    async def Configuration(
        self,
        request: ConfigurationRequest,
        grpc_context: LegacyGrpcContext,
    ) -> ConfigurationResponse:
        await self._authorize(grpc_context)
        return ConfigurationResponse(part_size=self._blob_store().part_size)

    async def BeginUpload(
        self,
        request: DataPlaneBeginUploadRequest,
        grpc_context: LegacyGrpcContext,
    ) -> DataPlaneBeginUploadResponse:
        await self._authorize(grpc_context)
        upload_id = await self._blob_store().begin_upload(
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
        await self._authorize(grpc_context)
        instructions = [
            DataPlanePartUploadInstruction(
                part_number=part_number,
                url=self._blob_store().part_put_url(
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
        await self._authorize(grpc_context)
        try:
            etag = await self._blob_store().complete(
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
        await self._authorize(grpc_context)
        url, ttl_seconds = self._blob_store().download_url(
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
        await self._authorize(grpc_context)
        await self._blob_store().delete(
            self._context(grpc_context),
            request.blob_id,
            upload_ids=list(request.upload_ids),
        )
        return DataPlaneDeleteResponse()
