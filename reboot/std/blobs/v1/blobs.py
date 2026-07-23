"""Blob storage: large binary objects whose bytes live outside state.

A `Blob` is the *control plane* for one immutable-once-committed
binary object: its state holds only metadata (content type, size,
upload progress, lifecycle status) while the bytes live in a *data
plane* — a `BlobDataPlane` gRPC service (see `data_plane.proto`),
discovered via `REBOOT_BLOB_DATA_PLANE_URL` — and travel directly
between the client and that data plane via URLs minted by
`UploadInstructions` and `DownloadUrl`. Uploads are resumable: parts
are idempotent by number, so a client that lost its connection
re-fetches instructions and re-uploads whatever `Info` does not yet
report.

Authorization model: blob *creation* is application-mediated — only
application code may call `Create`, which is where size and quota
policy belongs (enforced directly or via `max_size`). The blob's
framework-generated random id then acts as a capability. Upload-side
calls (`UploadInstructions`, `PartUploaded`, `Commit`) and `Remove` are
restricted to the `uploader_id` recorded at `Create` — unless
`uploader_id` is left empty, which deliberately allows anyone who knows
the blob's id to upload (for applications without end-user
authentication). Downloads (`DownloadUrl`) are open to anyone who knows
the id by default, but if `Create` (or a later `SetDownloaders`)
records a `downloader_ids` allow-list only the listed users may download;
an empty list restricts downloads to app-internal callers, and the
uploader is *not* implicitly a downloader. `Info` (metadata and upload
progress, watchable reactively) is visible to anyone who may upload or
download the blob: the `uploader_id` and listed `downloader_ids`, plus
anyone who knows the id whenever either side is left open.
"""

import asyncio
import log.log
import rbt.v1alpha1.errors_pb2
import re
from datetime import timedelta
from grpc.aio import AioRpcError
from rbt.std.blobs.v1.blobs_rbt import (
    AlreadyCommitted,
    BeginUploadRequest,
    BeginUploadResponse,
    Blob,
    BlobPart,
    CommitRequest,
    CommitResponse,
    CompleteUploadRequest,
    CompleteUploadResponse,
    CreateRequest,
    CreateResponse,
    DownloadUrlRequest,
    DownloadUrlResponse,
    ExpireIfNotCommittedRequest,
    ExpireIfNotCommittedResponse,
    IncompleteParts,
    InfoRequest,
    InfoResponse,
    NotCommitted,
    PartUploadedRequest,
    PartUploadedResponse,
    PartUploadInstruction,
    PerformRemoveRequest,
    PerformRemoveResponse,
    RemoveRequest,
    RemoveResponse,
    SetDownloadersRequest,
    SetDownloadersResponse,
    SizeMismatch,
    UploadInstructionsRequest,
    UploadInstructionsResponse,
)
from rbt.std.blobs.v1.data_plane_pb2 import (
    ConfigurationRequest,
    ConfigurationResponse,
    DataPlaneBeginUploadRequest,
    DataPlaneCompleteUploadRequest,
    DataPlaneDeleteRequest,
    DataPlaneGetDownloadUrlRequest,
    DataPlaneUploadedPart,
    DataPlaneUploadInstructionsRequest,
)
from rbt.std.blobs.v1.data_plane_pb2_grpc import BlobDataPlaneStub
from reboot.aio.applications import Application, Library
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.http import PythonWebFramework
from reboot.aio.workflows import at_least_once_per_workflow
from reboot.std.blobs.v1._data_plane import (
    ENVVAR_BLOB_DATA_PLANE_URL,
    proxy_target_from_environment,
    stub_from_environment,
)
from reboot.std.blobs.v1._proxy import mount_proxy_routes
from reboot.std.blobs.v1._store import MAX_PARTS
from typing import Optional

logger = log.log.get_logger(__name__)

# How long to keep retrying `Configuration` while the data plane
# comes up, before `pre_run` gives up. The data plane is normally
# already running (spawned by `rbt` or a ready facilitator), so this is
# only a startup-race cushion.
_CONFIGURATION_RETRY_SECONDS = 30
_CONFIGURATION_RETRY_INTERVAL_SECONDS = 0.5

# How long an upload may remain uncommitted before the blob is
# expunged by the `ExpireIfNotCommitted` task `Create` schedules.
DEFAULT_UPLOAD_EXPIRATION = timedelta(hours=24)

# A part ETag is a 32-character MD5 hex digest (optionally quoted by
# the client, which we strip). The data-plane contract requires a
# valid ETag for each reported part, so a malformed one is rejected
# up front rather than being handed to a data plane.
_PART_ETAG_PATTERN = re.compile(r'^"?[0-9a-fA-F]{32}"?$')


def _uploader_or_open(*, context, state=None, request=None, **kwargs):
    """Allow app-internal callers and the blob's recorded uploader to
    make upload-side calls, or anyone when no uploader was recorded. An
    empty `uploader_id` means the blob was created without end-user
    authentication, so anyone who knows the blob's id may upload into
    it. This handles the app-internal case itself (rather than
    composing `is_app_internal` via `any=[...]`) so that an
    unauthenticated non-uploader still surfaces as `Unauthenticated`
    rather than `PermissionDenied`."""
    if context.app_internal:
        return rbt.v1alpha1.errors_pb2.Ok()
    if state is None:
        return rbt.v1alpha1.errors_pb2.PermissionDenied()
    if state.uploader_id == "":
        return rbt.v1alpha1.errors_pb2.Ok()
    if context.auth is None or context.auth.user_id is None:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    if context.auth.user_id == state.uploader_id:
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


def _downloader_or_open(*, context, state=None, request=None, **kwargs):
    """Allow app-internal callers, and gate `DownloadUrl` on the blob's
    download allow-list. When no `downloader_ids` list was recorded (the
    field is unset) anyone who knows the blob's id may download; when
    one was recorded only the listed users may (an empty list means no
    one but app-internal callers). Like `_uploader_or_open`, this
    handles app-internal itself so that an unauthenticated non-listed
    caller surfaces as `Unauthenticated` rather than
    `PermissionDenied`."""
    if context.app_internal:
        return rbt.v1alpha1.errors_pb2.Ok()
    if state is None:
        return rbt.v1alpha1.errors_pb2.PermissionDenied()
    if not state.HasField("downloader_ids"):
        return rbt.v1alpha1.errors_pb2.Ok()
    if context.auth is None or context.auth.user_id is None:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    if context.auth.user_id in state.downloader_ids.user_ids:
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


class BlobServicer(Blob.Servicer):

    # The data-plane gRPC stub and the part size it reported, both set
    # by `BlobsLibrary` once it has connected to the data plane.
    _data_plane: BlobDataPlaneStub
    _part_size: int

    def authorizer(self):
        # Every method is listed explicitly so none can be
        # accidentally left ungated. `Create`, `SetDownloaders`, and
        # the internal workflow methods are app-internal only; the
        # upload-side methods and `Remove` require the caller to be the
        # blob's uploader, unless `uploader_id` is empty; `DownloadUrl`
        # is gated on the `downloader_ids` allow-list, or open when none
        # was recorded; `Info` is visible to anyone who may upload or
        # download the blob (either predicate suffices).
        return Blob.Authorizer(
            create=allow_if(any=[is_app_internal]),
            set_downloaders=allow_if(any=[is_app_internal]),
            begin_upload=allow_if(any=[is_app_internal]),
            complete_upload=allow_if(any=[is_app_internal]),
            perform_remove=allow_if(any=[is_app_internal]),
            expire_if_not_committed=allow_if(any=[is_app_internal]),
            info=allow_if(any=[_uploader_or_open, _downloader_or_open]),
            download_url=allow_if(any=[_downloader_or_open]),
            upload_instructions=allow_if(any=[_uploader_or_open]),
            part_uploaded=allow_if(any=[_uploader_or_open]),
            commit=allow_if(any=[_uploader_or_open]),
            remove=allow_if(any=[_uploader_or_open]),
        )

    async def create(
        self,
        context: WriterContext,
        request: CreateRequest,
    ) -> CreateResponse:
        self.state.status = Blob.State.UPLOADING
        self.state.content_type = request.content_type
        self.state.uploader_id = request.uploader_id
        if request.HasField("downloader_ids"):
            self.state.downloader_ids.CopyFrom(request.downloader_ids)
        if request.HasField("size"):
            self.state.size = request.size
        if request.HasField("max_size"):
            self.state.max_size = request.max_size

        # The storage-backend side effect (provisioning the upload
        # session) happens in the `BeginUpload` workflow, not here.
        await self.ref().schedule().begin_upload(context)

        # Expunge this blob if it is never committed.
        await self.ref().schedule(
            when=DEFAULT_UPLOAD_EXPIRATION,
        ).expire_if_not_committed(context)

        return CreateResponse()

    async def set_downloaders(
        self,
        context: WriterContext,
        request: SetDownloadersRequest,
    ) -> SetDownloadersResponse:
        # Replace semantics: a present `downloader_ids` (even empty)
        # restricts downloads to the listed users; an omitted one
        # removes any restriction so anyone who knows the id may
        # download again.
        if request.HasField("downloader_ids"):
            self.state.downloader_ids.CopyFrom(request.downloader_ids)
        else:
            self.state.ClearField("downloader_ids")
        return SetDownloadersResponse()

    @classmethod
    async def begin_upload(
        cls,
        context: WorkflowContext,
        request: BeginUploadRequest,
    ) -> BeginUploadResponse:
        state = await Blob.ref().read(context)

        async def provision() -> str:
            response = await cls._data_plane.BeginUpload(
                DataPlaneBeginUploadRequest(
                    blob_id=context.state_id,
                    content_type=state.content_type,
                )
            )
            return response.upload_id

        upload_id = await at_least_once_per_workflow(
            "provision upload session", context, provision
        )

        async def record(state: Blob.State) -> None:
            state.upload_id = upload_id

        await Blob.ref().write(context, record)
        return BeginUploadResponse()

    async def upload_instructions(
        self,
        context: ReaderContext,
        request: UploadInstructionsRequest,
    ) -> UploadInstructionsResponse:
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.UploadInstructionsAborted(AlreadyCommitted())

        if not self.state.HasField("upload_id"):
            return UploadInstructionsResponse(
                ready=False,
                part_size=self._part_size,
            )

        part_numbers = [
            number for number in request.part_numbers
            if 1 <= number <= MAX_PARTS
        ]
        response = await self._data_plane.UploadInstructions(
            DataPlaneUploadInstructionsRequest(
                blob_id=context.state_id,
                upload_id=self.state.upload_id,
                part_numbers=part_numbers,
            )
        )
        instructions = [
            PartUploadInstruction(
                part_number=instruction.part_number,
                url=instruction.url,
            ) for instruction in response.instructions
        ]

        return UploadInstructionsResponse(
            ready=True,
            part_size=self._part_size,
            instructions=instructions,
        )

    async def part_uploaded(
        self,
        context: WriterContext,
        request: PartUploadedRequest,
    ) -> PartUploadedResponse:
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.PartUploadedAborted(AlreadyCommitted())

        # Reject out-of-range part numbers: a bogus record (e.g. the
        # proto default `0` from an omitted field) can only be
        # overwritten, never removed, so it would make `Commit`'s
        # contiguity check fail forever.
        if request.part_number < 1 or request.part_number > MAX_PARTS:
            raise Blob.PartUploadedAborted(IncompleteParts())

        # Validate the ETag as an MD5 hex digest, as the data-plane
        # contract requires, so a client can't smuggle arbitrary
        # content into the value a data plane later relies on to
        # finalize the object.
        if not _PART_ETAG_PATTERN.match(request.etag):
            raise Blob.PartUploadedAborted(IncompleteParts())

        part = BlobPart(
            number=request.part_number,
            etag=request.etag,
            size=request.size,
        )

        # Safe to call multiple times for the same part number: a
        # re-uploaded part overwrites its previous record.
        parts = [p for p in self.state.parts if p.number != part.number]
        parts.append(part)
        parts.sort(key=lambda part: part.number)

        total = sum(part.size for part in parts)
        if self.state.HasField("max_size") and total > self.state.max_size:
            raise Blob.PartUploadedAborted(SizeMismatch(bytes_uploaded=total))

        del self.state.parts[:]
        self.state.parts.extend(parts)
        return PartUploadedResponse()

    async def commit(
        self,
        context: WriterContext,
        request: CommitRequest,
    ) -> CommitResponse:
        if self.state.status == Blob.State.COMMITTING:
            # Idempotent: the `CompleteUpload` workflow is already
            # scheduled.
            return CommitResponse()
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.CommitAborted(AlreadyCommitted())

        numbers = [part.number for part in self.state.parts]
        if not numbers or numbers != list(range(1, len(numbers) + 1)):
            raise Blob.CommitAborted(IncompleteParts())

        total = sum(part.size for part in self.state.parts)
        if self.state.HasField("size") and total != self.state.size:
            raise Blob.CommitAborted(SizeMismatch(bytes_uploaded=total))
        if self.state.HasField("max_size") and total > self.state.max_size:
            raise Blob.CommitAborted(SizeMismatch(bytes_uploaded=total))

        self.state.status = Blob.State.COMMITTING
        # Clear any error from a previous failed commit attempt, so a
        # client watching `Info` doesn't observe the stale error while
        # this fresh attempt is in flight.
        self.state.ClearField("commit_error")
        await self.ref().schedule().complete_upload(context)
        return CommitResponse()

    @classmethod
    async def complete_upload(
        cls,
        context: WorkflowContext,
        request: CompleteUploadRequest,
    ) -> CompleteUploadResponse:
        state = await Blob.ref().read(context)

        # A concurrent `Remove` may have moved the blob out of
        # COMMITTING (deletion always wins); if so, don't finalize.
        if state.status != Blob.State.COMMITTING:
            return CompleteUploadResponse()

        complete_request = DataPlaneCompleteUploadRequest(
            blob_id=context.state_id,
            upload_id=state.upload_id,
            content_type=state.content_type,
            parts=[
                DataPlaneUploadedPart(
                    number=part.number, etag=part.etag, size=part.size
                ) for part in state.parts
            ],
        )
        if state.HasField("max_size"):
            complete_request.max_size = state.max_size

        async def attempt() -> tuple:
            # A response `error` is a *permanent* failure (e.g. an ETag
            # mismatch): report it back onto the blob so the client can
            # re-upload and re-commit. A gRPC error is transient and
            # propagates, so the workflow retries.
            response = await cls._data_plane.CompleteUpload(complete_request)
            if response.HasField("error"):
                return ("failed", response.error)
            return ("committed", response.etag)

        outcome, detail = await at_least_once_per_workflow(
            "complete upload", context, attempt
        )

        # Only transition if the blob is still COMMITTING: a
        # concurrent `Remove` may have moved it to DELETING/DELETED,
        # which must win (otherwise we'd resurrect a deleted blob or
        # mark a bytes-less blob COMMITTED).
        superseded = [False]

        async def record(state: Blob.State) -> None:
            if state.status != Blob.State.COMMITTING:
                superseded[0] = True
                return
            if outcome == "committed":
                state.status = Blob.State.COMMITTED
                state.etag = detail
                state.ClearField("commit_error")
            else:
                state.status = Blob.State.UPLOADING
                state.commit_error = detail

        await Blob.ref().write(context, record)

        # If a delete raced ahead of a successful completion, the
        # bytes we just finalized are now orphaned; clean them up.
        if superseded[0] and outcome == "committed":

            async def cleanup() -> None:
                await cls._data_plane.Delete(
                    DataPlaneDeleteRequest(blob_id=context.state_id)
                )

            await at_least_once_per_workflow(
                "cleanup orphaned bytes", context, cleanup
            )

        return CompleteUploadResponse()

    async def info(
        self,
        context: ReaderContext,
        request: InfoRequest,
    ) -> InfoResponse:
        response = InfoResponse(
            status=self.state.status,
            content_type=self.state.content_type,
            uploader_id=self.state.uploader_id,
            bytes_uploaded=sum(part.size for part in self.state.parts),
            parts=self.state.parts,
        )
        if self.state.HasField("size"):
            response.size = self.state.size
        if self.state.HasField("max_size"):
            response.max_size = self.state.max_size
        if self.state.HasField("etag"):
            response.etag = self.state.etag
        if self.state.HasField("commit_error"):
            response.commit_error = self.state.commit_error
        return response

    async def download_url(
        self,
        context: ReaderContext,
        request: DownloadUrlRequest,
    ) -> DownloadUrlResponse:
        if self.state.status != Blob.State.COMMITTED:
            raise Blob.DownloadUrlAborted(NotCommitted())
        download_request = DataPlaneGetDownloadUrlRequest(
            blob_id=context.state_id,
        )
        if request.HasField("ttl_seconds"):
            download_request.ttl_seconds = request.ttl_seconds
        response = await self._data_plane.GetDownloadUrl(download_request)
        return DownloadUrlResponse(url=response.url)

    async def remove(
        self,
        context: WriterContext,
        request: RemoveRequest,
    ) -> RemoveResponse:
        if self.state.status in (
            Blob.State.DELETING,
            Blob.State.DELETED,
        ):
            return RemoveResponse()
        self.state.status = Blob.State.DELETING
        await self.ref().schedule().perform_remove(context)
        return RemoveResponse()

    @classmethod
    async def perform_remove(
        cls,
        context: WorkflowContext,
        request: PerformRemoveRequest,
    ) -> PerformRemoveResponse:

        async def remove() -> None:
            await cls._data_plane.Delete(
                DataPlaneDeleteRequest(blob_id=context.state_id)
            )

        await at_least_once_per_workflow("remove bytes", context, remove)

        async def record(state: Blob.State) -> None:
            state.status = Blob.State.DELETED
            del state.parts[:]

        await Blob.ref().write(context, record)
        return PerformRemoveResponse()

    async def expire_if_not_committed(
        self,
        context: WriterContext,
        request: ExpireIfNotCommittedRequest,
    ) -> ExpireIfNotCommittedResponse:
        if self.state.status == Blob.State.UPLOADING:
            self.state.status = Blob.State.DELETING
            await self.ref().schedule().perform_remove(context)
        elif self.state.status == Blob.State.COMMITTING:
            # A commit is in flight. If it fails it will revert to
            # UPLOADING and could then be abandoned, so re-arm the
            # expiration check rather than dropping it.
            await self.ref().schedule(
                when=DEFAULT_UPLOAD_EXPIRATION,
            ).expire_if_not_committed(context)
        return ExpireIfNotCommittedResponse()


BLOBS_LIBRARY_NAME = "reboot.std.blobs.v1.blobs"


class BlobsLibrary(Library):
    name = BLOBS_LIBRARY_NAME

    def __init__(self):
        self._connected = False

    def servicers(self):
        return [BlobServicer]

    async def pre_run(self, application: Application) -> None:
        # `pre_run` may be called more than once (e.g. a test that
        # `up`s an application after a `down`); connect once.
        if self._connected:
            return

        stub = stub_from_environment()
        BlobServicer._data_plane = stub

        configuration = await self._configuration(stub)
        BlobServicer._part_size = configuration.part_size

        # A data plane whose URLs are not directly reachable (e.g. the
        # localhost filesystem server) asks for paths to be forwarded
        # to it, and the application proxies those to its HTTP
        # endpoint; one that serves its own URLs (e.g. S3) asks for
        # none and needs no application routes.
        if configuration.forwarded_paths:
            if not isinstance(application.web_framework, PythonWebFramework):
                # Better to fail fast here than to hand out URLs that
                # will 404: without the proxy routes, a forwarded-path
                # data plane cannot serve any bytes.
                raise RuntimeError(
                    "This blob data plane needs paths forwarded to it, "
                    "which only Python applications currently support; "
                    "configure a data plane whose URLs are directly "
                    "reachable by clients via "
                    f"`{ENVVAR_BLOB_DATA_PLANE_URL}`."
                )
            mount_proxy_routes(
                application.http,
                proxy_target_from_environment(configuration.http_port),
                configuration.forwarded_paths,
            )

        self._connected = True

    async def _configuration(
        self,
        stub: BlobDataPlaneStub,
    ) -> ConfigurationResponse:
        # The data plane is normally already running, but tolerate a
        # startup race by retrying while it becomes reachable.
        attempts = int(
            _CONFIGURATION_RETRY_SECONDS /
            _CONFIGURATION_RETRY_INTERVAL_SECONDS
        )
        last_error: Optional[AioRpcError] = None
        for _ in range(attempts):
            try:
                return await stub.Configuration(ConfigurationRequest())
            except AioRpcError as error:
                last_error = error
                await asyncio.sleep(_CONFIGURATION_RETRY_INTERVAL_SECONDS)
        raise RuntimeError(
            "Timed out waiting for the blob data plane to become "
            f"reachable via `{ENVVAR_BLOB_DATA_PLANE_URL}`."
        ) from last_error


def servicers():
    return [BlobServicer]


def blobs_library() -> BlobsLibrary:
    return BlobsLibrary()
