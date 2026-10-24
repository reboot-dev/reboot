"""Blob storage: large binary objects whose bytes live outside state.

A `Blob` is the *control plane* for one immutable-once-committed
binary object: its state holds only metadata (content type, size,
upload progress, lifecycle status) while the bytes live in an
S3-compatible bucket and travel directly between the client and that
bucket via URLs minted by `GetPartUploadInstructions` and
`GetDownloadUrl`. Uploads are resumable: parts are idempotent by
number, so a client that lost its connection re-fetches instructions
and re-uploads whatever `Info` does not yet report.

The bucket is named by the `REBOOT_STD_BLOB_S3_*` environment variables
(see `reboot.std.blob.v1._s3`). Where none is -- under `rbt dev run`
and in tests -- the application runs a MinIO of its own, keeping its
objects beside the rest of the application's state, and has Envoy
forward `/rbt.std.blob.v1/` to it so that the browser reaches it on
the application's own origin.

Authorization model: blob *creation* is application-mediated -- only
application code may call `Create`, which is where size and quota
policy belongs (enforced directly or via `size`/`max_size`). The
blob's framework-generated random ID then acts as a capability.
Upload-side calls (`GetPartUploadInstructions`, `PartUploaded`,
`Commit`) and `Remove` are restricted to the `uploader_id` recorded at
`Create` -- unless `uploader_id` is omitted, which deliberately allows
anyone who knows the blob's ID to upload (for applications without
end-user authentication). Downloads (`GetDownloadUrl`) are open to
anyone who knows the ID by default, but if `Create` (or a later
`SetDownloaders`) records a `downloaders` allow-list only the listed
users may download; an empty list restricts downloads to app-internal
callers, and the uploader is *not* implicitly a downloader. `Info`
(metadata and upload progress, watchable reactively) is visible to
anyone who may upload or download the blob: the `uploader_id` and
listed `downloaders`, plus anyone who knows the ID whenever either
side is left open.
"""

import log.log
import os
import rbt.v1alpha1.errors_pb2
import re
import tempfile
from datetime import timedelta
from pathlib import Path
from rbt.std.blob.v1.blob_rbt import (
    AlreadyCommitted,
    Blob,
    BlobPart,
    CommitRefused,
    CommitRequest,
    CommitResponse,
    CommitWorkflowRequest,
    CommitWorkflowResponse,
    CreateRequest,
    CreateResponse,
    CreateWorkflowRequest,
    CreateWorkflowResponse,
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
    RemoveRequest,
    RemoveResponse,
    RemoveWorkflowRequest,
    RemoveWorkflowResponse,
    SetDownloadersRequest,
    SetDownloadersResponse,
    SizeMismatch,
)
from reboot.aio.applications import Application, Library
from reboot.aio.auth.authorizers import Authorizer, allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.aio.workflows import at_least_once_per_workflow, until
from reboot.routing.envoy_config import Upstream
from reboot.run_environments import is_in_test, on_cloud, running_rbt_dev
from reboot.settings import ENVVAR_RBT_STATE_DIRECTORY
from reboot.std.blob.v1._content_type import download_response_overrides
from reboot.std.blob.v1._minio import MINIO_REGION, MinioServer
from reboot.std.blob.v1._s3 import (
    ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID,
    ENVVAR_STD_BLOB_S3_BUCKET,
    ENVVAR_STD_BLOB_S3_ENDPOINT,
    ENVVAR_STD_BLOB_S3_REGION,
    ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY,
    ENVVAR_STD_BLOB_S3_URL_PREFIX,
    S3Bucket,
    S3NotConfigured,
    UploadedPart,
)
from typing import Optional
from urllib.parse import urlparse

logger = log.log.get_logger(__name__)

# How long an upload may remain uncommitted before the blob is
# expunged by the `ExpireIfNotCommitted` task `Create` schedules.
DEFAULT_UPLOAD_EXPIRATION = timedelta(hours=24)

# The maximum number of parts in one blob, following S3.
MAX_PARTS = 10000

# The path prefix on the application's own origin under which the
# bytes of a MinIO the application runs itself are reached: Envoy
# forwards it to the MinIO. The library's proto package, which is
# what keeps its state types and methods apart from everyone else's
# at `/` too, and is versioned.
BLOB_URL_PREFIX = "/rbt.std.blob.v1/"

# The bucket the application's own MinIO keeps blobs in.
_MINIO_BUCKET = "reboot-blobs"

# Where, under the application's state directory, its own MinIO keeps
# everything of its own.
_MINIO_SUBDIRECTORY = "blobs"

# A part ETag is opaque: it is whatever S3 returned, and an
# S3-compatible server is free to return something that is not an MD5
# digest. This checks only that it is safe to carry -- no quotes, no
# control characters, bounded length -- so that a client cannot
# smuggle arbitrary content into a value S3 later relies on to
# finalize the object. Any narrower format belongs to the server that
# produces it.
_PART_ETAG_PATTERN = re.compile(r'[!#-~]{1,128}')


# The statuses in which a `Remove` has already been recorded, so that
# another is a no-op.
_REMOVE_REQUESTED = (
    Blob.State.REMOVE_WHILE_CREATING,
    Blob.State.REMOVE_WHILE_COMMITTING,
    Blob.State.REMOVING,
    Blob.State.REMOVED,
)


def _removing_from(
    status: "Blob.State.Status.ValueType",
) -> "Blob.State.Status.ValueType":
    """Returns the status a `Remove` moves `status` to: `REMOVING`
    when no workflow is in flight, and otherwise the status that names
    the in-flight workflow, whose write moves the blob on to
    `REMOVING`."""
    if status == Blob.State.CREATING:
        return Blob.State.REMOVE_WHILE_CREATING
    if status == Blob.State.COMMITTING:
        return Blob.State.REMOVE_WHILE_COMMITTING
    return Blob.State.REMOVING


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
    recorded (the field is unset) anyone who knows the blob's ID may
    download; when one was recorded only the listed users may (an
    empty list means no one but app-internal callers). Like
    `_uploader_or_open`, this handles app-internal itself so that an
    unauthenticated non-listed caller surfaces as `Unauthenticated`
    rather than `PermissionDenied`."""
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


class S3BlobServicer(Blob.Servicer):
    """The `Blob` control plane over an S3-compatible bucket: S3
    itself, or anything that speaks its API (MinIO, Cloudflare R2,
    Backblaze B2, Ceph, ...), where every blob is one object written
    as a multipart upload.

    The bucket is set by `BlobLibrary` once it has configured one, and
    is otherwise built from the environment the first time it is
    needed, since every server process of the application is
    configured the same way.

    This is the only servicer for `Blob`, and it speaks S3 directly.
    If and when an API other than S3 calls for a second one (an
    `AzureBlobServicer`, say), factor what the two share out of this
    class into a base they both extend."""

    _bucket: Optional[S3Bucket] = None

    @classmethod
    def _s3(cls) -> S3Bucket:
        if cls._bucket is None:
            cls._bucket = S3Bucket.from_environment()
        return cls._bucket

    def authorizer(self) -> Blob.Authorizer:
        # Every method is listed explicitly so that none can be
        # accidentally left without a rule.
        return Blob.Authorizer(
            create=allow_if(any=[is_app_internal]),
            set_downloaders=allow_if(any=[is_app_internal]),
            create_workflow=allow_if(any=[is_app_internal]),
            commit_workflow=allow_if(any=[is_app_internal]),
            remove_workflow=allow_if(any=[is_app_internal]),
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
        self.state.status = Blob.State.CREATING
        self.state.content_type = request.content_type
        if request.HasField("uploader_id"):
            self.state.uploader_id = request.uploader_id
        if request.HasField("downloaders"):
            self.state.downloaders.CopyFrom(request.downloaders)
        if request.HasField("size"):
            self.state.size = request.size
        if request.HasField("max_size"):
            self.state.max_size = request.max_size

        # The S3 side effect (creating the multipart upload)
        # happens in `CreateWorkflow`.
        await self.ref().schedule().create_workflow(context)

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
    async def create_workflow(
        cls,
        context: WorkflowContext,
        request: CreateWorkflowRequest,
    ) -> CreateWorkflowResponse:
        state = await Blob.ref().read(context)

        async def provision() -> str:
            return await cls._s3().create_multipart_upload(
                blob_id=context.state_id,
                content_type=state.content_type,
            )

        upload_id = await at_least_once_per_workflow(
            "create multipart upload", context, provision
        )

        # A `Remove` may have landed between the read above and this
        # write -- a workflow spans several transactions, so Reboot
        # serializes each of them but holds nothing across the whole
        # method. It is recorded as `REMOVE_WHILE_CREATING`, which only
        # this write moves on to `REMOVING`: `RemoveWorkflow` waits for
        # that, so that it finds the upload recorded here and is the
        # one place the bucket is cleaned up.
        async def record(state: Blob.State) -> None:
            state.upload_id = upload_id
            if state.status == Blob.State.CREATING:
                state.status = Blob.State.UPLOADING
            elif state.status == Blob.State.REMOVE_WHILE_CREATING:
                state.status = Blob.State.REMOVING

        await Blob.ref().write(context, record)

        return CreateWorkflowResponse()

    async def get_part_upload_instructions(
        self,
        context: ReaderContext,
        request: GetPartUploadInstructionsRequest,
    ) -> GetPartUploadInstructionsResponse:
        part_size = self._s3().part_size
        if self.state.status == Blob.State.CREATING:
            return GetPartUploadInstructionsResponse(
                ready=False,
                part_size=part_size,
                max_parts=MAX_PARTS,
            )
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.GetPartUploadInstructionsAborted(AlreadyCommitted())

        # A minted URL is self-authorizing: whoever holds it can `PUT` a
        # full part into the bucket and never report it, so the numbers
        # handed out here are the only place a declared
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
                max(1, (ceiling + part_size - 1) // part_size),
            )

        instructions = [
            PartUploadInstruction(
                part_number=number,
                url=self._s3().part_upload_url(
                    blob_id=context.state_id,
                    upload_id=self.state.upload_id,
                    part_number=number,
                ),
            ) for number in request.part_numbers
            if 1 <= number <= max_part_number
        ]

        return GetPartUploadInstructionsResponse(
            ready=True,
            part_size=part_size,
            instructions=instructions,
            max_parts=MAX_PARTS,
        )

    async def part_uploaded(
        self,
        context: WriterContext,
        request: PartUploadedRequest,
    ) -> PartUploadedResponse:
        if self.state.status == Blob.State.CREATING:
            raise Blob.PartUploadedAborted(IncompleteParts())
        if self.state.status != Blob.State.UPLOADING:
            raise Blob.PartUploadedAborted(AlreadyCommitted())

        # Reject out-of-range part numbers: a bogus record (e.g. the
        # proto default `0` from an omitted field) can only be
        # overwritten, never removed, so it would make `Commit`'s
        # contiguity check fail forever.
        if request.part_number < 1 or request.part_number > MAX_PARTS:
            raise Blob.PartUploadedAborted(IncompleteParts())

        # The receipt this servicer takes is S3's ETag: a part reported
        # with none, or with another kind, has nothing `Commit` could
        # check against the bucket.
        if request.WhichOneof("receipt") != "etag":
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
            # Idempotent: the `CommitWorkflow` workflow is already
            # scheduled.
            return CommitResponse()
        # Until `CreateWorkflow` has recorded the multipart upload there
        # is nothing the reported parts could have been uploaded to.
        if self.state.status == Blob.State.CREATING:
            raise Blob.CommitAborted(IncompleteParts())
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
        self.state.ClearField("commit_refused")
        await self.ref().schedule().commit_workflow(context)
        return CommitResponse()

    @classmethod
    async def commit_workflow(
        cls,
        context: WorkflowContext,
        request: CommitWorkflowRequest,
    ) -> CommitWorkflowResponse:
        state = await Blob.ref().read(context)

        # A `Remove` that landed before this snapshot is a commit not
        # worth finishing: skip straight to the write that moves the
        # blob on to `REMOVING`. One that lands after the snapshot is
        # found by that same write.
        etag_or_commit_refused: str | CommitRefused | None = None
        if state.status == Blob.State.COMMITTING:
            parts = [
                UploadedPart(number=part.number, etag=part.etag, size=part.size)
                for part in state.parts
            ]
            ceiling = _size_ceiling(state)

            async def complete() -> str | CommitRefused:
                # A refusal is a *permanent* failure (e.g. an ETag
                # mismatch), answered rather than raised, so that it
                # is memoized like the ETag and recorded on the blob
                # for the client to re-upload and re-commit. Any
                # exception is transient and propagates, so the
                # workflow retries.
                return await cls._s3().complete_multipart_upload(
                    blob_id=context.state_id,
                    upload_id=state.upload_id,
                    content_type=state.content_type,
                    parts=parts,
                    max_size=ceiling,
                )

            etag_or_commit_refused = await at_least_once_per_workflow(
                "commit", context, complete
            )

        # Only a blob still COMMITTING takes the outcome; one that is
        # REMOVE_WHILE_COMMITTING moves on to REMOVING instead, and
        # `RemoveWorkflow`, waiting for exactly that, deletes whatever
        # the completion left in the bucket. Deletion always wins.
        async def record(state: Blob.State) -> None:
            if state.status == Blob.State.REMOVE_WHILE_COMMITTING:
                state.status = Blob.State.REMOVING
            elif state.status != Blob.State.COMMITTING:
                return
            elif isinstance(etag_or_commit_refused, str):
                state.status = Blob.State.COMMITTED
                state.etag = etag_or_commit_refused
                state.ClearField("commit_refused")
            elif etag_or_commit_refused is not None:
                state.status = Blob.State.UPLOADING
                state.commit_refused.CopyFrom(etag_or_commit_refused)

        await Blob.ref().write(context, record)

        # Abort only after the write above has recorded the refusal on
        # the blob: a browser cannot await a task, so a client watching
        # `Info` is how the uploader learns of it. Raising as well
        # makes the task itself report the outcome, and declaring the
        # error keeps the workflow from being retried for a commit that
        # can never succeed as reported.
        if isinstance(etag_or_commit_refused, CommitRefused):
            raise Blob.CommitWorkflowAborted(etag_or_commit_refused)
        return CommitWorkflowResponse()

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
        if self.state.HasField("commit_refused"):
            response.commit_refused.CopyFrom(self.state.commit_refused)
        return response

    async def get_download_url(
        self,
        context: ReaderContext,
        request: GetDownloadUrlRequest,
    ) -> GetDownloadUrlResponse:
        if self.state.status in _REMOVE_REQUESTED:
            # Final: a removed blob will never have bytes to serve.
            raise Blob.GetDownloadUrlAborted(NotCommitted())
        if self.state.status != Blob.State.COMMITTED:
            # Not yet: a reactive reader is pushed the URL on commit.
            return GetDownloadUrlResponse(ready=False)
        url, ttl_seconds = self._s3().download_url(
            blob_id=context.state_id,
            ttl_seconds=(
                request.ttl_seconds
                if request.HasField("ttl_seconds") else None
            ),
            response_overrides=download_response_overrides(
                self.state.content_type
            ),
        )
        return GetDownloadUrlResponse(
            ready=True,
            url=url,
            ttl_seconds=ttl_seconds,
        )

    async def remove(
        self,
        context: WriterContext,
        request: RemoveRequest,
    ) -> RemoveResponse:
        if self.state.status in _REMOVE_REQUESTED:
            # Idempotent: the `RemoveWorkflow` workflow is already
            # scheduled.
            return RemoveResponse()
        self.state.status = _removing_from(self.state.status)
        await self.ref().schedule().remove_workflow(context)
        return RemoveResponse()

    @classmethod
    async def remove_workflow(
        cls,
        context: WorkflowContext,
        request: RemoveWorkflowRequest,
    ) -> RemoveWorkflowResponse:
        # A `Remove` that landed while `CreateWorkflow` or
        # `CommitWorkflow` was in flight left the blob in a
        # `REMOVE_WHILE_*` status that only that workflow's write moves
        # on to `REMOVING`. Waiting for it means the upload it records,
        # or the object it completes, is here to be deleted, and that
        # this is the one place the bucket is cleaned up.
        async def removing() -> bool:
            state = await Blob.ref().read(context)
            return state.status == Blob.State.REMOVING

        await until("removing", context, removing)

        # An upload that never completed has parked bytes that
        # deleting the object does not reach, and the ID naming that
        # upload is only known here.
        state = await Blob.ref().read(context)
        upload_ids = [state.upload_id] if state.HasField("upload_id") else []

        async def remove() -> None:
            await cls._s3().delete_object(
                blob_id=context.state_id,
                upload_ids=upload_ids,
            )

        await at_least_once_per_workflow("remove bytes", context, remove)

        async def record(state: Blob.State) -> None:
            state.status = Blob.State.REMOVED
            del state.parts[:]

        await Blob.ref().write(context, record)
        return RemoveWorkflowResponse()

    async def expire_if_not_committed(
        self,
        context: WriterContext,
        request: ExpireIfNotCommittedRequest,
    ) -> ExpireIfNotCommittedResponse:
        if self.state.status in (
            Blob.State.CREATING,
            Blob.State.UPLOADING,
        ):
            self.state.status = _removing_from(self.state.status)
            await self.ref().schedule().remove_workflow(context)
        elif self.state.status == Blob.State.COMMITTING:
            # A commit is in flight. If it fails it will revert to
            # UPLOADING and could then be abandoned, so re-arm the
            # expiration check rather than dropping it.
            await self.ref().schedule(
                when=DEFAULT_UPLOAD_EXPIRATION,
            ).expire_if_not_committed(context)
        return ExpireIfNotCommittedResponse()


BLOBS_LIBRARY_NAME = "reboot.std.blob.v1.blob"

# The MinIO this process runs, if it runs one. One per process however
# many applications are brought up in it, since the environment it is
# published through is per process too.
_minio: Optional[MinioServer] = None


def _minio_directory() -> Path:
    """Where this application's own MinIO keeps its objects: beside
    the rest of the application's state, so that whatever reclaims
    that state reclaims the blobs with it. A run that keeps no state
    across restarts keeps its blobs in a temporary directory too."""
    state_directory = os.environ.get(ENVVAR_RBT_STATE_DIRECTORY)
    if state_directory is None:
        return Path(tempfile.mkdtemp(prefix="reboot-blobs-"))
    return Path(state_directory) / _MINIO_SUBDIRECTORY


class BlobLibrary(Library):
    name = BLOBS_LIBRARY_NAME

    def servicers(self) -> list[type[Servicer]]:
        return [S3BlobServicer]

    async def pre_run(self, application: Application) -> None:
        # `pre_run` may be called more than once (e.g. a test that
        # `up`s an application after a `down`), and runs in every
        # server process of the application; a bucket configured by
        # the time it runs, by whoever runs the application or by the
        # process that started a MinIO, is the bucket to use.
        if not os.environ.get(ENVVAR_STD_BLOB_S3_ENDPOINT):
            if not (running_rbt_dev() or is_in_test()):
                raise S3NotConfigured(
                    "Blobs need an S3-compatible bucket to keep their bytes "
                    f"in, named by '{ENVVAR_STD_BLOB_S3_ENDPOINT}', "
                    f"'{ENVVAR_STD_BLOB_S3_BUCKET}', "
                    f"'{ENVVAR_STD_BLOB_S3_REGION}', "
                    f"'{ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID}' and "
                    f"'{ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY}'. " + (
                        "These are set automatically for applications on "
                        "Reboot Cloud; please contact your administrator."
                        if on_cloud() else
                        "Under `rbt dev run` Reboot runs a MinIO for you; "
                        "`rbt serve run` needs one you provide."
                    )
                )
            await self._run_minio()

        bucket = S3Bucket.from_environment()
        if _minio is not None:
            # The application's own: nobody else makes its bucket.
            await bucket.ensure_bucket()
        S3BlobServicer._bucket = bucket

    async def _run_minio(self) -> None:
        """Starts this process's MinIO, if it is not running yet, and
        publishes it through the environment: to this process's
        `S3Bucket`, and to the server processes it spawns, which
        inherit the environment."""
        global _minio
        if _minio is None:
            _minio = MinioServer(_minio_directory())
        await _minio.start()
        os.environ[ENVVAR_STD_BLOB_S3_ENDPOINT] = _minio.endpoint
        os.environ[ENVVAR_STD_BLOB_S3_BUCKET] = _MINIO_BUCKET
        os.environ[ENVVAR_STD_BLOB_S3_REGION] = MINIO_REGION
        os.environ[ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID] = _minio.access_key_id
        os.environ[ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY] = (
            _minio.secret_access_key
        )
        os.environ[ENVVAR_STD_BLOB_S3_URL_PREFIX] = BLOB_URL_PREFIX

    def upstreams(self) -> list[Upstream]:
        # A bucket reached on a prefix of the application's own, the
        # application's own MinIO or one named that way, is reached
        # through Envoy, which sends it the `Host` its URLs were signed
        # for.
        url_prefix = os.environ.get(ENVVAR_STD_BLOB_S3_URL_PREFIX)
        endpoint = os.environ.get(ENVVAR_STD_BLOB_S3_ENDPOINT)
        if not url_prefix or not endpoint:
            return []
        parsed = urlparse(endpoint)
        assert parsed.hostname is not None
        return [
            Upstream(
                name="blob",
                prefix=url_prefix,
                host=parsed.hostname,
                port=parsed.port or (443 if parsed.scheme == "https" else 80),
                prefix_rewrite="/",
                host_rewrite=parsed.netloc,
            )
        ]


def servicers() -> list[type[Blob.Servicer]]:
    return [S3BlobServicer]


def blob_library() -> BlobLibrary:
    return BlobLibrary()
