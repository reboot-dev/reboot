"""Blob storage: large binary objects whose bytes live outside state.

A `Blob` is the *control plane* for one immutable-once-committed
binary object: its state holds only metadata (content type, size,
upload progress, lifecycle status) while the bytes live in a *data
plane* — a `BlobDataPlane` gRPC service (see `data_plane.proto`),
discovered via `REBOOT_BLOB_DATA_PLANE_URL` — and travel directly
between the client and that data plane via URLs minted by
`GetPartUploadInstructions` and `GetDownloadUrl`. Uploads are resumable: parts
are idempotent by number, so a client that lost its connection
re-fetches instructions and re-uploads whatever `Info` does not yet
report.

Authorization model: blob *creation* is application-mediated — only
application code may call `Create`, which is where size and quota
policy belongs (enforced directly or via `size`/`max_size`). The
blob's framework-generated random ID then acts as a capability.
Upload-side calls (`GetPartUploadInstructions`, `PartUploaded`, `Commit`) and
`Remove` are restricted to the `uploader_id` recorded at `Create` —
unless `uploader_id` is omitted, which deliberately allows anyone
who knows the blob's ID to upload (for applications without end-user
authentication). Downloads (`GetDownloadUrl`) are open to anyone who knows
the ID by default, but if `Create` (or a later `SetDownloaders`)
records a `downloaders` allow-list only the listed users may download;
an empty list restricts downloads to app-internal callers, and the
uploader is *not* implicitly a downloader. `Info` (metadata and upload
progress, watchable reactively) is visible to anyone who may upload or
download the blob: the `uploader_id` and listed `downloaders`, plus
anyone who knows the ID whenever either side is left open.
"""

import log.log
import os
import rbt.v1alpha1.errors_pb2
import re
import time
from datetime import timedelta
from grpc.aio import AioRpcError
from rbt.std.blob.v1.blob_rbt import (
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
    ExpireIfNotCommittedRequest,
    ExpireIfNotCommittedResponse,
    GetDownloadUrlRequest,
    GetDownloadUrlResponse,
    GetPartUploadInstructionsRequest,
    GetPartUploadInstructionsResponse,
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
)
from rbt.std.blob.v1.data_plane_pb2 import (
    ConfigurationRequest,
    ConfigurationResponse,
    DataPlaneBeginUploadRequest,
    DataPlaneCompleteUploadRequest,
    DataPlaneDeleteRequest,
    DataPlaneGetDownloadUrlRequest,
    DataPlaneGetPartUploadInstructionsRequest,
    DataPlaneUploadedPart,
)
from reboot.aio.applications import Application, Library
from reboot.aio.auth.authorizers import Authorizer, allow_if, is_app_internal
from reboot.aio.backoff import Backoff
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.http import PythonWebFramework
from reboot.aio.servicers import Servicer
from reboot.aio.workflows import at_least_once_per_workflow
from reboot.std.blob.v1._data_plane import (
    ENVVAR_BLOB_DATA_PLANE_URL,
    blobs_directory,
    configured_data_plane_stub,
    data_plane_stub,
)
from reboot.std.blob.v1._filesystem_data_plane import (
    FilesystemDataPlaneServicer,
)
from reboot.std.blob.v1._http import mount_byte_routes
from reboot.std.blob.v1._store import MAX_PARTS, FilesystemBlobStore
from reboot.std.blob.v1._stored_blob import StoredBlobServicer
from typing import Optional

logger = log.log.get_logger(__name__)

# How long to keep retrying `Configuration` while the data plane
# comes up, before `pre_run` gives up. The data plane is normally
# already running (spawned by `rbt` or a ready facilitator), so this is
# only a startup-race cushion.
_CONFIGURATION_RETRY_SECONDS = 30
_CONFIGURATION_MAX_BACKOFF_SECONDS = 2

# How long an upload may remain uncommitted before the blob is
# expunged by the `ExpireIfNotCommitted` task `Create` schedules.
DEFAULT_UPLOAD_EXPIRATION = timedelta(hours=24)

# A part ETag is opaque: `data_plane.proto` defines it as whatever the
# data plane returned, and a store is free to return something that is
# not an MD5 digest. This checks only that it is safe to carry — no
# quotes, no control characters, bounded length — so that a client
# cannot smuggle arbitrary content into a value a data plane later
# relies on to finalize the object. Any narrower format belongs to the
# store that produces it.
_PART_ETAG_PATTERN = re.compile(r'[!#-~]{1,128}')


def _size_ceiling(state: Blob.State) -> Optional[int]:
    """The most bytes this blob may hold, or `None` when unlimited. An
    exact `size` is its own ceiling: bytes beyond it could never be
    committed, so there is no reason to accept them."""
    if state.HasField("size"):
        return state.size
    if state.HasField("max_size"):
        return state.max_size
    return None


def _uploader_or_open(
    *,
    context,
    state=None,
    request=None,
    **kwargs,
) -> Authorizer.Decision:
    """Allow app-internal callers and the blob's recorded uploader to
    make upload-side calls, or anyone when no uploader was recorded. An
    absent `uploader_id` means the blob was created without end-user
    authentication, so anyone who knows the blob's ID may upload into
    it. This handles the app-internal case itself (rather than
    composing `is_app_internal` via `any=[...]`) so that an
    unauthenticated non-uploader still surfaces as `Unauthenticated`
    rather than `PermissionDenied`."""
    if context.app_internal:
        return rbt.v1alpha1.errors_pb2.Ok()
    if state is None:
        return rbt.v1alpha1.errors_pb2.PermissionDenied()
    if not state.HasField("uploader_id"):
        return rbt.v1alpha1.errors_pb2.Ok()
    if context.auth is None or context.auth.user_id is None:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    if context.auth.user_id == state.uploader_id:
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


def _downloader_or_open(
    *,
    context,
    state=None,
    request=None,
    **kwargs,
) -> Authorizer.Decision:
    """Allow app-internal callers, and restrict `GetDownloadUrl` to the
    blob's download allow-list. When no `downloaders` list was
    recorded (the
    field is unset) anyone who knows the blob's ID may download; when
    one was recorded only the listed users may (an empty list means no
    one but app-internal callers). Like `_uploader_or_open`, this
    handles app-internal itself so that an unauthenticated non-listed
    caller surfaces as `Unauthenticated` rather than
    `PermissionDenied`."""
    if context.app_internal:
        return rbt.v1alpha1.errors_pb2.Ok()
    if state is None:
        return rbt.v1alpha1.errors_pb2.PermissionDenied()
    if not state.HasField("downloaders"):
        return rbt.v1alpha1.errors_pb2.Ok()
    if context.auth is None or context.auth.user_id is None:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    if context.auth.user_id in state.downloaders.user_ids:
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


class BlobServicer(Blob.Servicer):

    # The part size the data plane reported, set by `BlobLibrary`
    # once it has asked.
    _part_size: int

    def authorizer(self) -> Blob.Authorizer:
        # Every method is listed explicitly so that none can be
        # accidentally left without a rule.
        return Blob.Authorizer(
            create=allow_if(any=[is_app_internal]),
            set_downloaders=allow_if(any=[is_app_internal]),
            begin_upload=allow_if(any=[is_app_internal]),
            complete_upload=allow_if(any=[is_app_internal]),
            perform_remove=allow_if(any=[is_app_internal]),
            expire_if_not_committed=allow_if(any=[is_app_internal]),
            # Either side may watch a blob: the uploader to follow
            # its own progress, a downloader to see when the bytes
            # are ready.
            info=allow_if(any=[_uploader_or_open, _downloader_or_open]),
            get_download_url=allow_if(any=[_downloader_or_open]),
            get_part_upload_instructions=allow_if(any=[_uploader_or_open]),
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
        if request.HasField("uploader_id"):
            self.state.uploader_id = request.uploader_id
        if request.HasField("downloaders"):
            self.state.downloaders.CopyFrom(request.downloaders)
        if request.HasField("size"):
            self.state.size = request.size
        if request.HasField("max_size"):
            self.state.max_size = request.max_size

        # The data-plane side effect (provisioning the upload
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
        # Replace semantics: a present `downloaders` (even empty)
        # restricts downloads to the listed users; an omitted one
        # removes any restriction so anyone who knows the ID may
        # download again.
        if request.HasField("downloaders"):
            self.state.downloaders.CopyFrom(request.downloaders)
        else:
            self.state.ClearField("downloaders")
        return SetDownloadersResponse()

    @classmethod
    async def begin_upload(
        cls,
        context: WorkflowContext,
        request: BeginUploadRequest,
    ) -> BeginUploadResponse:
        state = await Blob.ref().read(context)

        async def provision() -> str:
            async with data_plane_stub(context) as data_plane:
                response = await data_plane.BeginUpload(
                    DataPlaneBeginUploadRequest(
                        blob_id=context.state_id,
                        content_type=state.content_type,
                    )
                )
                return response.upload_id

        upload_id = await at_least_once_per_workflow(
            "provision upload session", context, provision
        )

        # A `Remove` may have landed between the read above and this
        # write -- a workflow spans several transactions, so Reboot
        # serializes each of them but holds nothing across the whole
        # method. Recording an upload session on a removed blob would
        # strand the data plane's directory forever, so drop the
        # session instead. Deletion always wins, as in `CompleteUpload`.
        removed = False

        async def record(state: Blob.State) -> None:
            nonlocal removed
            if state.status in (
                Blob.State.REMOVING,
                Blob.State.REMOVED,
            ):
                removed = True
                return
            state.upload_id = upload_id

        await Blob.ref().write(context, record)

        if removed:
            async with data_plane_stub(context) as data_plane:
                await data_plane.Delete(
                    DataPlaneDeleteRequest(
                        blob_id=context.state_id,
                        upload_ids=[upload_id],
                    )
                )

        return BeginUploadResponse()

    async def get_part_upload_instructions(
        self,
        context: ReaderContext,
        request: GetPartUploadInstructionsRequest,
    ) -> GetPartUploadInstructionsResponse:
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.GetPartUploadInstructionsAborted(AlreadyCommitted())

        if not self.state.HasField("upload_id"):
            return GetPartUploadInstructionsResponse(
                ready=False,
                part_size=self._part_size,
            )

        # A minted URL is self-authorizing: whoever holds it can `PUT` a
        # full part into the data plane and never report it, so the
        # numbers handed out here are the only place a declared
        # `size`/`max_size` can restrict how many bytes an upload
        # session may occupy: past that, `PartUploaded` and `Commit`
        # only ever see the sizes a client chose to report.
        ceiling = _size_ceiling(self.state)
        if ceiling is None:
            max_part_number = MAX_PARTS
        else:
            # Round up, since a ceiling that doesn't fill a whole part
            # still needs a part to carry it.
            max_part_number = min(
                MAX_PARTS,
                max(1, (ceiling + self._part_size - 1) // self._part_size),
            )

        part_numbers = [
            number for number in request.part_numbers
            if 1 <= number <= max_part_number
        ]
        async with data_plane_stub(context) as data_plane:
            response = await data_plane.GetPartUploadInstructions(
                DataPlaneGetPartUploadInstructionsRequest(
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

        return GetPartUploadInstructionsResponse(
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

        # Check that the ETag is safe to carry; see
        # `_PART_ETAG_PATTERN` for why that is all this can check.
        if not _PART_ETAG_PATTERN.fullmatch(request.etag):
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
        ceiling = _size_ceiling(self.state)
        if ceiling is not None and total > ceiling:
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
        ceiling = _size_ceiling(self.state)
        if ceiling is not None and total > ceiling:
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
        ceiling = _size_ceiling(state)
        if ceiling is not None:
            complete_request.max_size = ceiling

        async def attempt() -> tuple:
            # A response `error` is a *permanent* failure (e.g. an ETag
            # mismatch): report it back onto the blob so the client can
            # re-upload and re-commit. A gRPC error is transient and
            # propagates, so the workflow retries.
            async with data_plane_stub(context) as data_plane:
                response = await data_plane.CompleteUpload(complete_request)
            if response.HasField("error"):
                return ("failed", response.error)
            return ("committed", response.etag)

        outcome, detail = await at_least_once_per_workflow(
            "complete upload", context, attempt
        )

        # Only transition if the blob is still COMMITTING: a
        # concurrent `Remove` may have moved it to REMOVING/REMOVED,
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
                async with data_plane_stub(context) as data_plane:
                    await data_plane.Delete(
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
            uploader_id=(
                self.state.uploader_id
                if self.state.HasField("uploader_id") else None
            ),
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

    async def get_download_url(
        self,
        context: ReaderContext,
        request: GetDownloadUrlRequest,
    ) -> GetDownloadUrlResponse:
        if self.state.status != Blob.State.COMMITTED:
            raise Blob.GetDownloadUrlAborted(NotCommitted())
        download_request = DataPlaneGetDownloadUrlRequest(
            blob_id=context.state_id,
        )
        if request.HasField("ttl_seconds"):
            download_request.ttl_seconds = request.ttl_seconds
        async with data_plane_stub(context) as data_plane:
            response = await data_plane.GetDownloadUrl(download_request)
        return GetDownloadUrlResponse(
            url=response.url,
            ttl_seconds=response.ttl_seconds,
        )

    async def remove(
        self,
        context: WriterContext,
        request: RemoveRequest,
    ) -> RemoveResponse:
        if self.state.status in (
            Blob.State.REMOVING,
            Blob.State.REMOVED,
        ):
            return RemoveResponse()
        self.state.status = Blob.State.REMOVING
        await self.ref().schedule().perform_remove(context)
        return RemoveResponse()

    @classmethod
    async def perform_remove(
        cls,
        context: WorkflowContext,
        request: PerformRemoveRequest,
    ) -> PerformRemoveResponse:

        # An upload that never completed has parked bytes that
        # deleting the object does not reach, and the ID naming that
        # session is only known here.
        state = await Blob.ref().read(context)
        upload_ids = [state.upload_id] if state.HasField("upload_id") else []

        async def remove() -> None:
            async with data_plane_stub(context) as data_plane:
                await data_plane.Delete(
                    DataPlaneDeleteRequest(
                        blob_id=context.state_id,
                        upload_ids=upload_ids,
                    )
                )

        await at_least_once_per_workflow("remove bytes", context, remove)

        async def record(state: Blob.State) -> None:
            state.status = Blob.State.REMOVED
            del state.parts[:]

        await Blob.ref().write(context, record)
        return PerformRemoveResponse()

    async def expire_if_not_committed(
        self,
        context: WriterContext,
        request: ExpireIfNotCommittedRequest,
    ) -> ExpireIfNotCommittedResponse:
        if self.state.status == Blob.State.UPLOADING:
            self.state.status = Blob.State.REMOVING
            await self.ref().schedule().perform_remove(context)
        elif self.state.status == Blob.State.COMMITTING:
            # A commit is in flight. If it fails it will revert to
            # UPLOADING and could then be abandoned, so re-arm the
            # expiration check rather than dropping it.
            await self.ref().schedule(
                when=DEFAULT_UPLOAD_EXPIRATION,
            ).expire_if_not_committed(context)
        return ExpireIfNotCommittedResponse()


BLOBS_LIBRARY_NAME = "reboot.std.blob.v1.blob"


class BlobLibrary(Library):
    name = BLOBS_LIBRARY_NAME

    def __init__(self, *, blobs_directory: Optional[str] = None) -> None:
        self._blobs_directory = blobs_directory
        self._store: Optional[FilesystemBlobStore] = None
        self._prepared = False

    def _hosts_data_plane(self) -> bool:
        """Whether this application serves its own blob bytes.

        It does unless pointed at a data plane elsewhere, which is how
        Reboot Cloud hands an application its facilitator."""
        return not os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL)

    def servicers(self) -> list[type[Servicer]]:
        if not self._hosts_data_plane():
            return [BlobServicer]
        return [BlobServicer, StoredBlobServicer]

    def legacy_grpc_servicers(self) -> list[type]:
        if not self._hosts_data_plane():
            return []
        return [FilesystemDataPlaneServicer]

    async def pre_run(self, application: Application) -> None:
        # `pre_run` may be called more than once (e.g. a test that
        # `up`s an application after a `down`); prepare once.
        if self._prepared:
            return

        if self._hosts_data_plane():
            if not isinstance(application.web_framework, PythonWebFramework):
                # Better to fail here than to hand out URLs that will
                # 404: without the byte routes this application cannot
                # serve any bytes it stores.
                raise RuntimeError(
                    "Serving blob bytes needs HTTP routes, which only "
                    "Python applications currently support; configure a "
                    "data plane that serves its own URLs via "
                    f"`{ENVVAR_BLOB_DATA_PLANE_URL}`."
                )
            store = FilesystemBlobStore(
                self._blobs_directory or blobs_directory()
            )
            self._store = store
            FilesystemDataPlaneServicer._store = store
            mount_byte_routes(application.http, store)
            # Known without asking, since this application is the data
            # plane; `Configuration` still reports it, for a client
            # that does not know which data plane it is talking to.
            BlobServicer._part_size = store.part_size
            self._prepared = True
            return

        # A data plane elsewhere has to be asked. Asked here, in
        # `pre_run`, because this runs in every server process, and
        # `_part_size` is per-process state that each of them serves
        # `GetPartUploadInstructions` from.
        configuration = await self._configuration()
        if configuration.part_size == 0:
            # Fail here rather than let a zero reach the browser
            # uploader, which divides the blob's size by it.
            raise RuntimeError(
                "The blob data plane reported a part size of zero; "
                f"check the service at `{ENVVAR_BLOB_DATA_PLANE_URL}`"
            )
        BlobServicer._part_size = configuration.part_size

        if configuration.forwarded_paths:
            # Reverse-proxying a data plane's byte endpoints is no
            # longer something this library does, so a data plane that
            # needs it would mint URLs nothing serves. Say so now
            # rather than at the first upload.
            raise RuntimeError(
                "This blob data plane asks for paths to be forwarded to "
                "it, which is no longer supported; configure a data "
                "plane that serves its own URLs via "
                f"`{ENVVAR_BLOB_DATA_PLANE_URL}`."
            )

        self._prepared = True

    async def _configuration(self) -> ConfigurationResponse:
        # The data plane is normally already running, but tolerate a
        # startup race by retrying while it becomes reachable.
        backoff = Backoff(
            max_backoff_seconds=_CONFIGURATION_MAX_BACKOFF_SECONDS,
        )
        deadline = time.monotonic() + _CONFIGURATION_RETRY_SECONDS
        while True:
            try:
                async with configured_data_plane_stub() as data_plane:
                    return await data_plane.Configuration(
                        ConfigurationRequest()
                    )
            except AioRpcError as error:
                if time.monotonic() >= deadline:
                    raise RuntimeError(
                        "Timed out waiting for the blob data plane to "
                        "become reachable via "
                        f"`{ENVVAR_BLOB_DATA_PLANE_URL}`."
                    ) from error
                await backoff()


def servicers() -> list[type[Blob.Servicer]]:
    return [BlobServicer]


def blob_library() -> BlobLibrary:
    return BlobLibrary()
