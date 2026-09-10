"""The filesystem data plane's metadata, as a Reboot state machine.

Bytes live on disk (see `_store.py`); which parts make up an object,
and whether that object is finished, live here. The two are ordered
against each other by this state and nothing else: a part's bytes are
written by whichever of a replica's servers served the upload, so the
decision of whether that part is *in* the object has to be made
somewhere all of them agree, which is here.
"""

import rbt.v1alpha1.errors_pb2
from rbt.std.blob.v1.filesystem_rbt import (
    StoredBlob,
    StoredBlobBeginUploadRequest,
    StoredBlobBeginUploadResponse,
    StoredBlobCommitRequest,
    StoredBlobCommitResponse,
    StoredBlobForgetRequest,
    StoredBlobForgetResponse,
    StoredBlobMetadataRequest,
    StoredBlobMetadataResponse,
    StoredBlobPublishPartRequest,
    StoredBlobPublishPartResponse,
)
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext, WriterContext
from typing import Optional
from uuid import uuid4


class StoredBlobServicer(StoredBlob.Servicer):

    def authorizer(self) -> StoredBlob.Authorizer:
        # Nothing here is reachable by an end user. The data plane's
        # gRPC surface and its byte endpoints are the only callers, and
        # both are inside this application; a client's capability is
        # the signed URL it was given, not access to this state.
        return StoredBlob.Authorizer(
            begin_upload=allow_if(any=[is_app_internal]),
            publish_part=allow_if(any=[is_app_internal]),
            commit=allow_if(any=[is_app_internal]),
            metadata=allow_if(any=[is_app_internal]),
            forget=allow_if(any=[is_app_internal]),
        )

    async def begin_upload(
        self,
        context: WriterContext,
        request: StoredBlobBeginUploadRequest,
    ) -> StoredBlobBeginUploadResponse:
        self.state.committed = False
        self.state.content_type = request.content_type
        self.state.upload_id = uuid4().hex
        self.state.ClearField("etag")
        del self.state.parts[:]
        return StoredBlobBeginUploadResponse(upload_id=self.state.upload_id)

    async def publish_part(
        self,
        context: WriterContext,
        request: StoredBlobPublishPartRequest,
    ) -> StoredBlobPublishPartResponse:
        if self.state.committed:
            return StoredBlobPublishPartResponse(published=False)
        if (
            not self.state.HasField("upload_id") or
            self.state.upload_id != request.upload_id
        ):
            return StoredBlobPublishPartResponse(published=False)

        # A part number may arrive more than once: an upload the
        # client retried, or two attempts racing. Whichever lands last
        # is the one the object is made of -- each wrote its own file,
        # so this is the only place the choice is made, and the one it
        # displaces is named back so its bytes can go.
        superseded: Optional[str] = None
        for index, part in enumerate(self.state.parts):
            if part.number == request.part.number:
                superseded = part.storage_id
                self.state.parts[index].CopyFrom(request.part)
                break
        else:
            self.state.parts.append(request.part)
            self.state.parts.sort(key=lambda part: part.number)

        return StoredBlobPublishPartResponse(
            published=True,
            superseded_storage_id=superseded,
        )

    async def commit(
        self,
        context: WriterContext,
        request: StoredBlobCommitRequest,
    ) -> StoredBlobCommitResponse:
        if self.state.committed:
            # `CompleteUpload` is retried by a workflow, so arriving at
            # an object that is already finished is success, not a
            # conflict.
            return StoredBlobCommitResponse(committed=True)

        published = {part.number: part for part in self.state.parts}
        for part in request.parts:
            current = published.get(part.number)
            if current is None or current.storage_id != part.storage_id:
                # A part was uploaded again between this manifest being
                # read and being committed, so the bytes it names are
                # not the object's any more -- and the request that
                # replaced them has taken them away.
                return StoredBlobCommitResponse(committed=False)

        self.state.committed = True
        self.state.content_type = request.content_type
        self.state.upload_id = request.upload_id
        self.state.etag = request.etag
        # Replaced, not added to: what the object is made of is the
        # manifest given here. A part written under this session but
        # left out of it -- uploaded and never reported, or a version
        # of a part superseded by another -- belongs to nothing, and
        # is not what a download reads or what the ETag describes.
        del self.state.parts[:]
        self.state.parts.extend(request.parts)
        return StoredBlobCommitResponse(committed=True)

    async def metadata(
        self,
        context: ReaderContext,
        request: StoredBlobMetadataRequest,
    ) -> StoredBlobMetadataResponse:
        return StoredBlobMetadataResponse(blob=self.state)

    async def forget(
        self,
        context: WriterContext,
        request: StoredBlobForgetRequest,
    ) -> StoredBlobForgetResponse:
        self.state.committed = False
        self.state.content_type = ""
        self.state.ClearField("upload_id")
        self.state.ClearField("etag")
        del self.state.parts[:]
        return StoredBlobForgetResponse()


def servicers() -> list[type[StoredBlob.Servicer]]:
    return [StoredBlobServicer]
