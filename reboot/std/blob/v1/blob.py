"""Blob storage: large binary objects whose bytes live outside state.

A `Blob` is the *control plane* for one immutable-once-committed
binary object: its state holds only metadata (content type, size,
upload progress, lifecycle status) while the bytes live in an
S3-compatible bucket and travel directly between the client and that
bucket via URLs from `PartUploadUrl` and `DownloadUrl`. Uploads are
resumable: parts are idempotent by
number, so a client that lost its connection re-fetches instructions
and re-uploads whatever `Info` does not yet report.

The bucket is named by the `REBOOT_STD_BLOB_S3_*` environment variables
(see `reboot.std.blob.v1._s3`). Where none is -- under `rbt dev run`
and in tests -- the application runs a Silo of its own, keeping its
objects beside the rest of the application's state, and has Envoy
forward `/rbt.std.blob.v1/` to it so that the browser reaches it on
the application's own origin.

Authorization model: blob *creation* is application-mediated -- only
application code may call `Create`, which is where size and quota
policy belongs (enforced directly or via `size`/`max_size`). The
blob's framework-generated random ID then acts as a capability.
Upload-side calls (`PartUploadUrl`, `PartUploaded`, `Commit`,
`RestartUpload`) and `Discard` are restricted to the `uploader_id`
recorded at `Create` -- unless `uploader_id` is omitted, which
deliberately allows anyone who knows the blob's ID to upload (for
applications without end-user authentication). Downloads (`DownloadUrl`) are open to
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
    CreateRequest,
    CreateResponse,
    Discarded,
    DiscardRequest,
    DiscardResponse,
    DownloadUrlRequest,
    DownloadUrlResponse,
    IncompleteParts,
    InfoRequest,
    InfoResponse,
    PartUploadedRequest,
    PartUploadedResponse,
    PartUploadUrlRequest,
    PartUploadUrlResponse,
    ReapOrphanedUploadsRequest,
    ReapOrphanedUploadsResponse,
    ReconcileRequest,
    ReconcileResponse,
    RestartUploadRequest,
    RestartUploadResponse,
    SetDownloadersRequest,
    SetDownloadersResponse,
    SizeMismatch,
    UploadNotFound,
    UploadNotReady,
)
from reboot.aio.applications import Application, Library
from reboot.aio.auth.authorizers import (
    Authorizer,
    AuthorizerRule,
    allow_if,
    is_app_internal,
)
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.aio.workflows import at_least_once, at_least_once_per_workflow
from reboot.routing.upstreams import Upstream
from reboot.run_environments import is_in_test, on_cloud, running_rbt_dev
from reboot.settings import ENVVAR_RBT_STATE_DIRECTORY
from reboot.std.blob.v1._content_type import download_response_overrides
from reboot.std.blob.v1._s3 import (
    ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID,
    ENVVAR_STD_BLOB_S3_BUCKET,
    ENVVAR_STD_BLOB_S3_ENDPOINT,
    ENVVAR_STD_BLOB_S3_REGION,
    ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY,
    S3Bucket,
    S3NotConfigured,
)
from reboot.std.blob.v1._silo import SILO_REGION, SiloServer
from typing import Optional
from urllib.parse import urlparse

logger = log.log.get_logger(__name__)

# How long after its multipart upload is recorded a blob reaps the
# orphans under its key: uploads an attempt of `Reconcile` had the
# bucket create but died before recording. Long after any lag between
# the bucket creating an upload and listing it, so that the listing
# the reaper acts on is complete.
ORPHANED_UPLOAD_REAP_DELAY = timedelta(hours=1)

# The maximum number of parts in one blob, following S3.
MAX_PARTS = 10000

# The path prefix on the application's own origin under which the
# bytes of a Silo the application runs itself are reached: the
# application forwards it to the Silo, as the upstream the library
# names. The library's proto package, which is what keeps its state
# types and methods apart from everyone else's at `/` too, and is
# versioned.
SILO_UPSTREAM_URL_PREFIX = "/rbt.std.blob.v1/"

# `true` when the bucket the `REBOOT_STD_BLOB_S3_*` variables name is
# the Silo this application runs, an upstream of the application on
# its loopback: the URLs its clients are given are then relative to
# the application on `SILO_UPSTREAM_URL_PREFIX`, rather than absolute
# URLs of a loopback they cannot reach.
ENVVAR_STD_BLOB_SILO_UPSTREAM = "REBOOT_STD_BLOB_SILO_UPSTREAM"

# The bucket the application's own Silo keeps blobs in.
_SILO_BUCKET = "reboot-blobs"

# Where, under the application's state directory, its own Silo keeps
# everything of its own.
_SILO_SUBDIRECTORY = "blobs"

# A part ETag is opaque: it is whatever S3 returned, and an
# S3-compatible server is free to return something that is not an MD5
# digest. This checks only that it is safe to carry -- no quotes, no
# control characters, bounded length -- so that a client cannot
# smuggle arbitrary content into a value S3 later relies on to
# finalize the object. Any narrower format belongs to the server that
# produces it.
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
    """Allow app-internal callers, and restrict `DownloadUrl` to the
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


# What `blob_library()` sets without `authorizer=`. Creation, and the
# rest of what only the application does, is app-internal, so that a
# blob is created from within the application's own transaction, after
# whatever policy of its own the application applies (what may be
# attached to what, how large, by whom) and not from a browser; an
# application for which authorization alone is policy enough passes
# an `authorizer=` of its own. Either side may watch a blob: the
# uploader to follow its own progress, a downloader to see when the
# bytes are ready. Every method is listed, so that none is left
# without a rule.
DEFAULT_AUTHORIZER: Authorizer | AuthorizerRule = Blob.Authorizer(
    create=allow_if(any=[is_app_internal]),
    set_downloaders=allow_if(any=[is_app_internal]),
    reconcile=allow_if(any=[is_app_internal]),
    reap_orphaned_uploads=allow_if(any=[is_app_internal]),
    info=allow_if(any=[_uploader_or_open, _downloader_or_open]),
    download_url=allow_if(any=[_downloader_or_open]),
    part_upload_url=allow_if(any=[_uploader_or_open]),
    part_uploaded=allow_if(any=[_uploader_or_open]),
    commit=allow_if(any=[_uploader_or_open]),
    restart_upload=allow_if(any=[_uploader_or_open]),
    discard=allow_if(any=[_uploader_or_open]),
)


class S3BlobServicer(Blob.Servicer):
    """The `Blob` control plane over an S3-compatible bucket: S3
    itself, or anything that speaks its API (Silo, Cloudflare R2,
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

    # Whether the bucket is the Silo the application runs, an upstream
    # of the application on its loopback reached by the application's
    # clients through the application on `SILO_UPSTREAM_URL_PREFIX`.
    # Set by `BlobLibrary` with the bucket, from the environment.
    _silo_upstream: bool = False

    # A class attribute, so the last `blob_library(...)` call sets it
    # for every application in the process.
    _authorizer: Authorizer | AuthorizerRule = DEFAULT_AUTHORIZER

    @classmethod
    def _s3(cls) -> S3Bucket:
        if cls._bucket is None:
            cls._bucket = S3Bucket.from_environment()
        return cls._bucket

    def authorizer(self) -> Authorizer | AuthorizerRule:
        return self._authorizer

    @classmethod
    def _maybe_silo_upstream_url_reference(cls, url: str) -> str:
        """The URL reference a client is given for the bucket's absolute
        `url`: the URL itself, or, for the Silo the application runs,
        a path relative to the application on
        `SILO_UPSTREAM_URL_PREFIX`: the same path and query, which the
        application forwards to the Silo with the `Host` the URL was
        signed for."""
        if not cls._silo_upstream:
            return url
        endpoint = cls._s3().endpoint
        parsed = urlparse(url)
        assert parsed.netloc == urlparse(endpoint).netloc, (
            f"'{url}' is not a URL of the Silo at '{endpoint}'"
        )
        prefix = SILO_UPSTREAM_URL_PREFIX.rstrip("/")
        return f"{prefix}{parsed.path}?{parsed.query}"

    async def create(
        self,
        context: WriterContext,
        request: CreateRequest,
    ) -> CreateResponse:
        self.state.status = Blob.State.CREATED
        self.state.content_type = request.content_type
        if request.HasField("uploader_id"):
            self.state.uploader_id = request.uploader_id
        if request.HasField("downloaders"):
            self.state.downloaders.CopyFrom(request.downloaders)
        if request.HasField("size"):
            self.state.size = request.size
        if request.HasField("max_size"):
            self.state.max_size = request.max_size

        # Beginning the upload is the workflow's, like every side
        # effect on the storage: this only asks for it.
        self.state.transition = Blob.State.UPLOAD
        await self._ensure_reconciling(context)

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
    async def reconcile(
        cls,
        context: WorkflowContext,
        request: ReconcileRequest,
    ) -> ReconcileResponse:
        # The one workflow a blob has: each iteration reads what the
        # storage holds and what has been asked for, does one step in
        # the storage, and records the outcome, until nothing is asked
        # for. A request only ever lands in `transition`, so one that
        # arrives while an iteration is in the storage is done by the
        # next; the storage is only ever touched here, one step at a
        # time.
        async for _ in context.loop("Reconcile"):
            # Memoized, so that a replay of this iteration takes the
            # branch its first run took, whatever the status is by now.
            state = await Blob.ref().per_iteration("Status").read(context)
            # A run is only ever scheduled with a transition asked for,
            # and each is only ever asked for from the statuses it moves
            # on from: `UPLOAD` by `Create`, and by a `RestartUpload` of
            # an uploading blob, `COMMIT` by a `Commit` of an uploading
            # blob, `DISCARD` by a `Discard` of anything not yet
            # discarded.
            match state.transition:
                case Blob.State.UPLOAD:
                    assert state.status in (
                        Blob.State.CREATED,
                        Blob.State.UPLOADING,
                    ), state.status
                    await cls._create_upload(context, state)
                case Blob.State.COMMIT:
                    assert state.status == Blob.State.UPLOADING, state.status
                    await cls._complete_upload(context, state)
                case Blob.State.DISCARD:
                    assert state.status in (
                        Blob.State.CREATED,
                        Blob.State.UPLOADING,
                        Blob.State.COMMITTED,
                    ), state.status
                    await cls._discard(context, state)
                case _:
                    raise AssertionError(
                        "Unexpected transition "
                        f"'{Blob.State.Transition.Name(state.transition)}'"
                    )

            # Whether this run is done: writes to a blob serialize, so
            # a transition asked for before this write is seen here and
            # done by the next iteration, and one asked for after it
            # finds `reconciling` cleared and schedules a run of its own.
            # Memoized with the write, so that a replay of this iteration
            # ends, or goes on, as its first run did.
            async def done(state: Blob.State) -> bool:
                if state.transition != Blob.State.NONE:
                    return False
                state.reconciling = False
                return True

            if await Blob.ref().per_iteration("Done").write(context, done):
                break
        return ReconcileResponse()

    @classmethod
    async def _create_upload(
        cls,
        context: WorkflowContext,
        state: Blob.State,
    ) -> None:

        async def create() -> str:
            # An upload the blob already has is being restarted: it is
            # aborted first, so that whatever parts it holds do not
            # sit in the storage until it drops them on its own. It
            # may be gone already, dropped by the storage, which is
            # the usual reason for a restart and why the abort
            # tolerates that.
            if state.HasField("upload_id"):
                await cls._s3().abort_multipart_upload_if_exists(
                    blob_id=context.state_id,
                    upload_id=state.upload_id,
                )
            return await cls._s3().create_multipart_upload(
                blob_id=context.state_id,
                content_type=state.content_type,
            )

        upload_id = await at_least_once("Create upload", context, create)

        # The upload begun is the one the parts go to, so any recorded
        # for an earlier one are forgotten with it. The request served
        # is cleared, and no other: a `DISCARD` asked for meanwhile
        # stays, for the next iteration, which finds the upload
        # recorded here to abort.
        async def record(state: Blob.State) -> None:
            state.upload_id = upload_id
            state.status = Blob.State.UPLOADING
            del state.parts[:]
            if state.transition == Blob.State.UPLOAD:
                state.transition = Blob.State.NONE

        await Blob.ref().per_iteration("Record upload").write(context, record)

        # The attempt that was answered with `upload_id` may not have
        # been the first to ask: an earlier one that died after the
        # storage had begun an upload but before recording it left
        # that upload behind, known to nobody. Reap such orphans once
        # the storage is sure to list them.
        await Blob.ref().per_iteration("Reap orphaned uploads").schedule(
            when=ORPHANED_UPLOAD_REAP_DELAY
        ).reap_orphaned_uploads(context)

    @classmethod
    async def _complete_upload(
        cls,
        context: WorkflowContext,
        state: Blob.State,
    ) -> None:
        expected_parts = {part.number: part for part in state.parts}
        ceiling = _size_ceiling(state)

        async def complete() -> str | CommitRefused | UploadNotFound:
            # A refusal (e.g. an ETag mismatch), and an upload the
            # storage no longer holds, are *permanent* failures,
            # answered rather than raised, so that they are memoized
            # like the ETag and recorded on the blob for the client to
            # re-upload and re-commit. Any exception is transient and
            # propagates, so the workflow retries.
            return await cls._s3().complete_multipart_upload(
                blob_id=context.state_id,
                upload_id=state.upload_id,
                content_type=state.content_type,
                expected_parts=expected_parts,
                max_size=ceiling,
            )

        outcome = await at_least_once("Complete upload", context, complete)

        # The request served is cleared, and no other: a `DISCARD` asked
        # for meanwhile stays, for the next iteration, whatever
        # completing left in the storage. Discarding always wins.
        async def record(state: Blob.State) -> None:
            if isinstance(outcome, str):
                state.status = Blob.State.COMMITTED
                state.etag = outcome
                state.ClearField("commit_failure")
            elif isinstance(outcome, CommitRefused):
                state.commit_refused.CopyFrom(outcome)
            else:
                state.upload_not_found.CopyFrom(outcome)
            if state.transition == Blob.State.COMMIT:
                state.transition = Blob.State.NONE

        await Blob.ref().per_iteration("Record outcome").write(context, record)

    @classmethod
    async def _discard(
        cls,
        context: WorkflowContext,
        state: Blob.State,
    ) -> None:
        # An upload that never completed has parked bytes that deleting
        # the object does not reach, and the ID naming that upload is
        # only known here, so abort it before the object goes. The
        # upload may be gone already, completed by a commit or dropped
        # by the bucket, which is why the abort tolerates that.
        async def discard() -> None:
            if state.HasField("upload_id"):
                await cls._s3().abort_multipart_upload_if_exists(
                    blob_id=context.state_id,
                    upload_id=state.upload_id,
                )
            await cls._s3().delete_object_if_exists(blob_id=context.state_id)

        await at_least_once("Discard bytes", context, discard)

        async def record(state: Blob.State) -> None:
            state.status = Blob.State.DISCARDED
            state.transition = Blob.State.NONE
            del state.parts[:]

        await Blob.ref().per_iteration("Record discard").write(context, record)

    @classmethod
    async def reap_orphaned_uploads(
        cls,
        context: WorkflowContext,
        request: ReapOrphanedUploadsRequest,
    ) -> ReapOrphanedUploadsResponse:
        state = await Blob.ref().read(context)
        # Scheduled by the write that recorded the upload, so there is
        # one to spare, whatever the blob has done since.
        assert state.upload_id, "scheduled before the upload was recorded"

        async def reap() -> None:
            # Every upload under the blob's key but the recorded one
            # is an orphan: begun by an attempt whose answer was lost.
            for upload_id in await cls._s3().list_multipart_uploads(
                context.state_id
            ):
                if upload_id != state.upload_id:
                    await cls._s3().abort_multipart_upload_if_exists(
                        blob_id=context.state_id,
                        upload_id=upload_id,
                    )

        await at_least_once_per_workflow(
            "Reap orphaned uploads", context, reap
        )
        return ReapOrphanedUploadsResponse()

    async def part_upload_url(
        self,
        context: ReaderContext,
        request: PartUploadUrlRequest,
    ) -> PartUploadUrlResponse:
        if self.state.status == Blob.State.CREATED:
            raise Blob.PartUploadUrlAborted(UploadNotReady())
        if (
            self.state.transition == Blob.State.DISCARD or
            self.state.status == Blob.State.DISCARDED
        ):
            raise Blob.PartUploadUrlAborted(Discarded())
        if (
            self.state.transition == Blob.State.COMMIT or
            self.state.status == Blob.State.COMMITTED
        ):
            raise Blob.PartUploadUrlAborted(AlreadyCommitted())

        # An upload URL is self-authorizing: whoever holds it can `PUT` a
        # full part into the bucket and never report it, so refusing a
        # part number here is the only place a declared
        # `size`/`max_size` can restrict how many bytes an upload
        # session may occupy: past that, `PartUploaded` and `Commit`
        # only ever see the sizes a client chose to report.
        part_size = self._s3().part_size
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

        if not 1 <= request.part_number <= max_part_number:
            raise Blob.PartUploadUrlAborted(IncompleteParts())

        return PartUploadUrlResponse(
            url_reference=self._maybe_silo_upstream_url_reference(
                self._s3().part_upload_url(
                    blob_id=context.state_id,
                    upload_id=self.state.upload_id,
                    part_number=request.part_number,
                )
            ),
        )

    async def part_uploaded(
        self,
        context: WriterContext,
        request: PartUploadedRequest,
    ) -> PartUploadedResponse:
        if self.state.status == Blob.State.CREATED:
            raise Blob.PartUploadedAborted(IncompleteParts())
        if (
            self.state.transition == Blob.State.DISCARD or
            self.state.status == Blob.State.DISCARDED
        ):
            raise Blob.PartUploadedAborted(Discarded())
        if (
            self.state.transition == Blob.State.COMMIT or
            self.state.status == Blob.State.COMMITTED
        ):
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
        if self.state.transition == Blob.State.COMMIT:
            # Idempotent: the workflow is already completing the upload.
            return CommitResponse()
        # Until the workflow has recorded the multipart upload there is
        # nothing the reported parts could have been uploaded to.
        if self.state.status == Blob.State.CREATED:
            raise Blob.CommitAborted(IncompleteParts())
        if (
            self.state.transition == Blob.State.DISCARD or
            self.state.status == Blob.State.DISCARDED
        ):
            raise Blob.CommitAborted(Discarded())
        if (
            self.state.transition == Blob.State.COMMIT or
            self.state.status == Blob.State.COMMITTED
        ):
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

        # `Reconcile` completes the upload.
        self.state.transition = Blob.State.COMMIT
        # Clear any failure of a previous commit attempt, so a client
        # watching `Info` doesn't observe the stale failure while this
        # fresh attempt is in flight.
        self.state.ClearField("commit_failure")
        await self._ensure_reconciling(context)
        return CommitResponse()

    async def restart_upload(
        self,
        context: WriterContext,
        request: RestartUploadRequest,
    ) -> RestartUploadResponse:
        if (
            self.state.transition == Blob.State.DISCARD or
            self.state.status == Blob.State.DISCARDED
        ):
            raise Blob.RestartUploadAborted(Discarded())
        if (
            self.state.transition == Blob.State.COMMIT or
            self.state.status == Blob.State.COMMITTED
        ):
            raise Blob.RestartUploadAborted(AlreadyCommitted())
        if self.state.transition == Blob.State.UPLOAD:
            # Idempotent: the workflow is already beginning an upload,
            # the blob's first or another in place of it.
            return RestartUploadResponse()
        assert self.state.status == Blob.State.UPLOADING, self.state.status

        # `Reconcile` begins the upload, and forgets the parts of the
        # one it replaces as it records it.
        self.state.transition = Blob.State.UPLOAD
        # The failure that called for the restart is about the upload
        # being replaced, so a client watching `Info` does not see it
        # against the new one.
        self.state.ClearField("commit_failure")
        await self._ensure_reconciling(context)
        return RestartUploadResponse()

    async def info(
        self,
        context: ReaderContext,
        request: InfoRequest,
    ) -> InfoResponse:
        response = InfoResponse(
            status=self.state.status,
            transition=self.state.transition,
            content_type=self.state.content_type,
            uploader_id=(
                self.state.uploader_id
                if self.state.HasField("uploader_id") else None
            ),
            bytes_uploaded=sum(part.size for part in self.state.parts),
            parts=self.state.parts,
            part_size=self._s3().part_size,
            max_parts=MAX_PARTS,
        )
        if self.state.HasField("size"):
            response.size = self.state.size
        if self.state.HasField("max_size"):
            response.max_size = self.state.max_size
        if self.state.HasField("etag"):
            response.etag = self.state.etag
        if self.state.HasField("commit_refused"):
            response.commit_refused.CopyFrom(self.state.commit_refused)
        if self.state.HasField("upload_not_found"):
            response.upload_not_found.CopyFrom(self.state.upload_not_found)
        return response

    async def download_url(
        self,
        context: ReaderContext,
        request: DownloadUrlRequest,
    ) -> DownloadUrlResponse:
        if (
            self.state.status != Blob.State.COMMITTED or
            self.state.transition == Blob.State.DISCARD
        ):
            # Not yet, or never (the blob is being discarded, or was): a
            # reactive reader is pushed the URL on commit, and `Info`
            # says which of the two this is.
            return DownloadUrlResponse(ready=False)
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
        return DownloadUrlResponse(
            ready=True,
            url_reference=self._maybe_silo_upstream_url_reference(url),
            ttl_seconds=ttl_seconds,
        )

    async def discard(
        self,
        context: WriterContext,
        request: DiscardRequest,
    ) -> DiscardResponse:
        if (
            self.state.status == Blob.State.DISCARDED or
            self.state.transition == Blob.State.DISCARD
        ):
            # Idempotent: the bytes are going, or gone.
            return DiscardResponse()
        # Supersedes a `COMMIT` still being carried out: discarding
        # always wins.
        self.state.transition = Blob.State.DISCARD
        await self._ensure_reconciling(context)
        return DiscardResponse()

    async def _ensure_reconciling(self, context: WriterContext) -> None:
        """Schedules `Reconcile` for the transition just asked for,
        unless a run is pending or running, which finds it on its next
        iteration. Writes to a blob serialize, so this and the run's
        own check of what is asked for cannot miss each other."""
        if self.state.reconciling:
            return
        self.state.reconciling = True
        await self.ref().schedule().reconcile(context)


BLOBS_LIBRARY_NAME = "reboot.std.blob.v1.blob"

# The Silo this process runs, if it runs one. One per process however
# many applications are brought up in it, since the environment it is
# published through is per process too.
_silo: Optional[SiloServer] = None


def _silo_directory() -> Path:
    """Where this application's own Silo keeps its objects: beside
    the rest of the application's state, so that whatever reclaims
    that state reclaims the blobs with it. A run that keeps no state
    across restarts keeps its blobs in a temporary directory too."""
    state_directory = os.environ.get(ENVVAR_RBT_STATE_DIRECTORY)
    if state_directory is None:
        return Path(tempfile.mkdtemp(prefix="reboot-blobs-"))
    return Path(state_directory) / _SILO_SUBDIRECTORY


class BlobLibrary(Library):
    """The blob servicer. `authorizer` replaces the default rules for
    every method of `Blob`; `None` keeps them."""
    name = BLOBS_LIBRARY_NAME

    def __init__(
        self,
        *,
        authorizer: Optional[Authorizer | AuthorizerRule] = None,
    ):
        S3BlobServicer._authorizer = (
            DEFAULT_AUTHORIZER if authorizer is None else authorizer
        )

    def servicers(self) -> list[type[Servicer]]:
        return [S3BlobServicer]

    async def pre_run(self, application: Application) -> None:
        # `pre_run` may be called more than once (e.g. a test that
        # `up`s an application after a `down`), and runs in every
        # server process of the application; a bucket configured by
        # the time it runs, by whoever runs the application or by the
        # process that started a Silo, is the bucket to use.
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
                        "Under `rbt dev run` Reboot runs a Silo for you; "
                        "`rbt serve run` needs one you provide."
                    )
                )
            await self._run_silo()

        bucket = S3Bucket.from_environment()
        if _silo is not None:
            # The application's own: nobody else makes its bucket.
            await bucket.ensure_bucket()
        S3BlobServicer._bucket = bucket
        S3BlobServicer._silo_upstream = (
            os.environ.get(ENVVAR_STD_BLOB_SILO_UPSTREAM) == "true"
        )

    async def _run_silo(self) -> None:
        """Starts this process's Silo, if it is not running yet, and
        publishes it through the environment: to this process's
        `S3Bucket`, and to the server processes it spawns, which
        inherit the environment."""
        global _silo
        if _silo is None:
            _silo = SiloServer(_silo_directory())
        await _silo.start()
        os.environ[ENVVAR_STD_BLOB_S3_ENDPOINT] = _silo.endpoint
        os.environ[ENVVAR_STD_BLOB_S3_BUCKET] = _SILO_BUCKET
        os.environ[ENVVAR_STD_BLOB_S3_REGION] = SILO_REGION
        os.environ[ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID] = _silo.access_key_id
        os.environ[ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY] = (
            _silo.secret_access_key
        )
        # An upstream of the application: the URLs its clients are
        # given must be relative to the application, on the prefix
        # `upstreams()` claims for the Silo.
        os.environ[ENVVAR_STD_BLOB_SILO_UPSTREAM] = "true"

    def upstreams(self) -> list[Upstream]:
        # The Silo this process runs is reached through the
        # application on `SILO_UPSTREAM_URL_PREFIX`, which sends
        # it the `Host` its URLs were signed for.
        if _silo is None:
            return []
        endpoint = urlparse(_silo.endpoint)
        assert endpoint.port is not None
        return [
            Upstream(
                name="blob",
                prefix=SILO_UPSTREAM_URL_PREFIX,
                port=endpoint.port,
                prefix_rewrite="/",
                host_rewrite=endpoint.netloc,
            )
        ]


def servicers() -> list[type[Blob.Servicer]]:
    return [S3BlobServicer]


def blob_library(
    *,
    authorizer: Optional[Authorizer | AuthorizerRule] = None,
) -> BlobLibrary:
    return BlobLibrary(authorizer=authorizer)
