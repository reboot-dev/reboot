"""Blob bytes as objects in an S3-compatible bucket.

Implements just the sliver of the S3 API that blobs need -- multipart
uploads (create, complete, abort), object deletion, and presigned
part-`PUT`/object-`GET` URLs -- over boto3, which carries the signing
and the wire format, so that a fix to either reaches an application
with an upgrade of botocore rather than of Reboot. boto3 is the
`reboot[std-blob]` extra, installed only by an application that keeps
blobs. Its calls are synchronous and are run in a thread: there are a
handful per blob, and the bytes themselves never pass through the
application, since clients `PUT` parts straight to presigned URLs and
download from presigned `GET` URLs. Works against AWS S3 and
S3-compatible servers such as MinIO (path-style addressing is used
throughout, which MinIO requires).
"""

import asyncio
import os
import urllib.parse
from dataclasses import dataclass
from rbt.std.blob.v1.blob_pb2 import CommitRefused
from typing import Any, Mapping, Optional, Sequence

try:
    import boto3
    import botocore.config
    from botocore.exceptions import ClientError
except ImportError as error:
    raise ImportError(
        "Blobs need boto3, which the `reboot[std-blob]` extra installs: add "
        "`reboot[std-blob]` to your dependencies, at the same version as "
        "`reboot`"
    ) from error

# The environment variables that configure the bucket: the S3 API
# endpoint (e.g. `https://s3.us-east-1.amazonaws.com`, or
# `http://127.0.0.1:9000` for a MinIO), the bucket, an optional key
# prefix within it, the region the endpoint signs for, and the
# credentials.
ENVVAR_STD_BLOB_S3_ENDPOINT = "REBOOT_STD_BLOB_S3_ENDPOINT"
ENVVAR_STD_BLOB_S3_BUCKET = "REBOOT_STD_BLOB_S3_BUCKET"
# The endpoint as the application's clients reach it, when that is not
# the one the application itself reaches, e.g. a MinIO that pods reach
# by its name on their network and the browser on a port mapped to the
# developer's machine. A SigV4 signature covers the host, so a URL is
# signed for whichever name its holder will use.
ENVVAR_STD_BLOB_S3_PUBLIC_ENDPOINT = "REBOOT_STD_BLOB_S3_PUBLIC_ENDPOINT"
ENVVAR_STD_BLOB_S3_PREFIX = "REBOOT_STD_BLOB_S3_PREFIX"
ENVVAR_STD_BLOB_S3_REGION = "REBOOT_STD_BLOB_S3_REGION"
ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID = "REBOOT_STD_BLOB_S3_ACCESS_KEY_ID"
ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY = "REBOOT_STD_BLOB_S3_SECRET_ACCESS_KEY"

# When set, a path prefix of the application's own, e.g.
# `/rbt.std.blob.v1/`, that the application forwards to the endpoint
# with the prefix removed and the `Host` header set to the endpoint's.
# The URLs minted are then relative to the application, on that
# prefix, rather than absolute URLs of the endpoint: a browser reaches
# the bucket on the origin it already reached the application by, and
# the endpoint need not be reachable by that name at all.
ENVVAR_STD_BLOB_S3_URL_PREFIX = "REBOOT_STD_BLOB_S3_URL_PREFIX"

# The part size clients are asked to upload in. Every part except the
# last must be exactly this size. At least 5 MiB, the S3 minimum part
# size.
DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024

# A SigV4 presigned URL may not outlive 7 days, which is therefore the
# longest a URL can be signed for; downloads get a generous default
# well below that.
_MAX_URL_TTL_SECONDS = 7 * 24 * 60 * 60
_DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 60
_DEFAULT_UPLOAD_TTL_SECONDS = 15 * 60

# S3's `response-*` query parameters, which set the headers an object
# is served with, by the names boto3 takes them under.
_RESPONSE_OVERRIDE_PARAMETERS = {
    "response-cache-control": "ResponseCacheControl",
    "response-content-disposition": "ResponseContentDisposition",
    "response-content-encoding": "ResponseContentEncoding",
    "response-content-language": "ResponseContentLanguage",
    "response-content-type": "ResponseContentType",
    "response-expires": "ResponseExpires",
}


class S3NotConfigured(RuntimeError):
    """Raised when the environment names no S3 to keep blobs in."""


@dataclass(frozen=True)
class UploadedPart:
    """One part of a multipart upload, as reported by the client."""
    number: int
    etag: str
    size: int


@dataclass(frozen=True)
class _RealPart:
    """One part as S3 reports it, as opposed to as a client claims
    it."""

    size: int
    etag: str


def _quote_etag(etag: str) -> str:
    return '"' + etag.strip('"') + '"'


def _error_code(error: ClientError) -> str:
    """The S3 error code a failed call answered with, e.g.
    `NoSuchUpload`, or the HTTP status as a string for an answer
    that carried no body, as a `HeadObject` 404 does."""
    return str(error.response.get("Error", {}).get("Code", ""))


def _status(error: ClientError) -> int:
    return int(
        error.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)
    )


class S3Bucket:
    """An S3-compatible bucket and how to reach it, holding blobs as
    objects under `{prefix}/blobs/{blob_id}`."""

    def __init__(
        self,
        *,
        endpoint: str,
        bucket: str,
        prefix: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        public_endpoint: Optional[str] = None,
        url_prefix: Optional[str] = None,
    ):
        self._endpoint = endpoint.rstrip("/")
        self._public_endpoint = (
            public_endpoint.rstrip("/")
            if public_endpoint is not None else self._endpoint
        )
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._url_prefix = (
            url_prefix.rstrip("/") if url_prefix is not None else None
        )
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        # Built on first use: a client loads S3's service model, which
        # takes long enough to keep out of a constructor.
        self._clients: dict[str, Any] = {}

    @classmethod
    def from_environment(cls) -> "S3Bucket":
        """The bucket the `REBOOT_STD_BLOB_S3_*` environment variables
        configure. Raises `S3NotConfigured` when they name none."""
        endpoint = os.environ.get(ENVVAR_STD_BLOB_S3_ENDPOINT)
        if not endpoint:
            raise S3NotConfigured(
                f"'{ENVVAR_STD_BLOB_S3_ENDPOINT}' is not set; blobs need an "
                "S3-compatible bucket to keep their bytes in"
            )
        missing = [
            name for name in (
                ENVVAR_STD_BLOB_S3_BUCKET,
                ENVVAR_STD_BLOB_S3_REGION,
                ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID,
                ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY,
            ) if not os.environ.get(name)
        ]
        if missing:
            raise S3NotConfigured(
                f"'{ENVVAR_STD_BLOB_S3_ENDPOINT}' is set but "
                f"{', '.join(repr(name) for name in missing)} "
                f"{'is' if len(missing) == 1 else 'are'} not"
            )
        return cls(
            endpoint=endpoint,
            bucket=os.environ[ENVVAR_STD_BLOB_S3_BUCKET],
            prefix=os.environ.get(ENVVAR_STD_BLOB_S3_PREFIX, ""),
            region=os.environ[ENVVAR_STD_BLOB_S3_REGION],
            access_key_id=os.environ[ENVVAR_STD_BLOB_S3_ACCESS_KEY_ID],
            secret_access_key=os.environ[ENVVAR_STD_BLOB_S3_SECRET_ACCESS_KEY],
            public_endpoint=(
                os.environ.get(ENVVAR_STD_BLOB_S3_PUBLIC_ENDPOINT) or None
            ),
            url_prefix=os.environ.get(ENVVAR_STD_BLOB_S3_URL_PREFIX) or None,
        )

    @property
    def part_size(self) -> int:
        """Returns the part size clients must upload in, in bytes:
        every part but the last is exactly this size.

        Idempotency: a constant of the bucket."""
        return DEFAULT_PART_SIZE_BYTES

    @property
    def endpoint(self) -> str:
        return self._endpoint

    @property
    def url_prefix(self) -> Optional[str]:
        return self._url_prefix

    def _key(self, blob_id: str) -> str:
        if self._prefix:
            return f"{self._prefix}/blobs/{blob_id}"
        return f"blobs/{blob_id}"

    def _client_for(self, endpoint: str) -> Any:
        """A boto3 S3 client for `endpoint`, made once per endpoint.
        Signed for the host in `endpoint`, as the URLs it presigns
        are."""
        client = self._clients.get(endpoint)
        if client is None:
            client = boto3.client(
                "s3",
                endpoint_url=endpoint,
                region_name=self._region,
                aws_access_key_id=self._access_key_id,
                aws_secret_access_key=self._secret_access_key,
                config=botocore.config.Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                    # boto3 adds integrity checksums to requests and
                    # checks them on responses wherever S3 supports
                    # it, which S3-compatible servers do not all
                    # accept; nothing here needs them.
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                ),
            )
            self._clients[endpoint] = client
        return client

    @property
    def _client(self) -> Any:
        """The client that makes the API calls, on the endpoint."""
        return self._client_for(self._endpoint)

    def _presign(
        self,
        *,
        operation: str,
        method: str,
        params: dict[str, Any],
        ttl_seconds: int,
    ) -> str:
        """A URL for `operation` on `params`. With a `url_prefix`, a
        URL relative to the application on that prefix, signed for
        the endpoint's host, which the application forwards it to with
        that same `Host`; otherwise an absolute URL of the public
        endpoint, signed for its host."""
        if self._url_prefix is not None:
            signed = urllib.parse.urlsplit(
                self._client.generate_presigned_url(
                    operation,
                    Params=params,
                    ExpiresIn=ttl_seconds,
                    HttpMethod=method,
                )
            )
            return f"{self._url_prefix}{signed.path}?{signed.query}"
        return self._client_for(self._public_endpoint).generate_presigned_url(
            operation,
            Params=params,
            ExpiresIn=ttl_seconds,
            HttpMethod=method,
        )

    async def ensure_bucket(self) -> None:
        """Creates the bucket if it does not exist. For a MinIO the
        application runs itself; a bucket elsewhere is made by whoever
        owns it."""
        try:
            await asyncio.to_thread(
                self._client.create_bucket, Bucket=self._bucket
            )
        except ClientError as error:
            # S3 answers a bucket the same owner already has with 409
            # `BucketAlreadyOwnedByYou` (and MinIO, in the one region
            # it has, likewise); both are the state being asked for.
            if _error_code(error) != "BucketAlreadyOwnedByYou":
                raise

    async def create_multipart_upload(
        self,
        *,
        blob_id: str,
        content_type: str,
    ) -> str:
        """Returns the upload ID of a new multipart upload for the
        blob, under which its parts are written until
        `complete_multipart_upload` finishes the object from them.

        `blob_id`: the blob the upload is for; the object's key is
        derived from it.

        `content_type`: the MIME type the object is served with once
        committed.

        Idempotency: not idempotent. Every call begins a new multipart
        upload and returns a new upload ID, so a caller that may
        repeat the call records the ID it was given before acting on
        it. An upload a lost answer orphaned is reclaimed by the next
        `complete_multipart_upload` or `delete_object` for the blob,
        which abort every upload the bucket lists for its key."""
        response = await asyncio.to_thread(
            self._client.create_multipart_upload,
            Bucket=self._bucket,
            Key=self._key(blob_id),
            ContentType=content_type,
        )
        return str(response["UploadId"])

    def part_upload_url(
        self,
        *,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        """Returns a URL to `PUT` one part's bytes to, whose response
        carries the part's ETag: absolute, or relative to the
        application when the application forwards it to the bucket.

        `blob_id`: the blob the part belongs to.

        `upload_id`: the multipart upload, from
        `create_multipart_upload`, the part is written under.

        `part_number`: the part's 1-based number within the object.

        Idempotency: idempotent, keyed by `(blob_id, upload_id,
        part_number)`. Minting a URL changes nothing in the bucket,
        and every URL minted for the same key admits the same `PUT`;
        two differ only in when they were signed and so when they
        expire."""
        return self._presign(
            operation="upload_part",
            method="PUT",
            params={
                "Bucket": self._bucket,
                "Key": self._key(blob_id),
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ttl_seconds=_DEFAULT_UPLOAD_TTL_SECONDS,
        )

    async def complete_multipart_upload(
        self,
        *,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: Sequence[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str | CommitRefused:
        """Returns the ETag of the object finished from `parts`, after
        checking each part as the client reported it against what the
        bucket actually holds for it, or a `CommitRefused` for a
        commit that can never succeed as reported: a part never
        uploaded, or whose size or ETag differs from what was
        reported, or a total over `max_size`; the multipart upload
        survives such a refusal, so that the client can replace the
        part and commit again. A transient failure (e.g. a network
        error) is raised as its original exception type instead.

        `blob_id`: the blob being committed.

        `upload_id`: the multipart upload, from
        `create_multipart_upload`, whose parts make up the object.

        `content_type`: the MIME type the object is served with.

        `parts`: exactly the parts the object is made of, as the
        client reported them; a part written to the upload but not
        listed here is not in the object.

        `max_size`: the most bytes the parts may add up to, or `None`
        for no limit.

        Idempotency: idempotent, keyed by `(blob_id, upload_id)`.
        Completing a multipart upload consumes it, and committing a
        blob whose upload has already been completed returns the
        committed object's ETag -- whatever `parts` says, since what
        the object is made of was decided by the call that completed
        it. Either way, every other upload the bucket lists for the
        key is aborted before returning: one a lost answer to
        `create_multipart_upload` orphaned would otherwise park its
        bytes for as long as the bucket's lifecycle rule allows."""
        # The client uploads its bytes straight to presigned URLs, so
        # the sizes it reports are unverifiable anywhere else:
        # `ListParts` is the only ground truth about what S3 actually
        # holds. Check every reported size against it, so that a
        # blob's recorded size is what was stored rather than whatever
        # was claimed. The ETags are checked too, by S3 itself, which
        # fails the completion below with `InvalidPart`.
        real_parts = await self._list_part_sizes(blob_id, upload_id)
        if real_parts is None:
            # The upload is gone. Either a previous attempt completed
            # it, in which case the object is in the bucket and passed
            # these same checks on the way in, or it expired without
            # ever being completed. The first is the crash-and-retry
            # the control plane is built for; the second is permanent,
            # and saying so stops a workflow retrying an upload that
            # can never come back.
            etag = await self._head_object_etag(blob_id)
            if etag is not None:
                return await self._completed(blob_id, etag)
            return CommitRefused(
                reason="the upload expired before it was committed, so "
                "this blob can no longer be committed; create a new blob "
                "and upload again"
            )

        for part in parts:
            real = real_parts.get(part.number)
            if real is None:
                return CommitRefused(
                    reason=f"part {part.number} was reported but never "
                    "uploaded; upload it and commit again"
                )
            if real.size != part.size:
                return CommitRefused(
                    reason=f"part {part.number} was reported as {part.size} "
                    f"bytes but {real.size} were uploaded; upload it again "
                    "and commit again"
                )
            if real.etag != part.etag.strip('"'):
                return CommitRefused(
                    reason=f"part {part.number} was reported with an ETag "
                    "that does not match what was uploaded; upload it again "
                    "and commit again"
                )

        # Measured over the parts being completed, which are what
        # the object will consist of -- S3 discards the rest. Counting
        # a stale part left by an abandoned attempt would fail an
        # upload here that the client never asked to be completed.
        #
        # Neither this nor the per-part checks above abort the
        # upload. A blob whose commit fails goes back to `UPLOADING`
        # still holding this upload ID, so a client can replace the
        # offending part and commit again; aborting would leave that
        # ID naming an upload S3 has destroyed and every retry would
        # fail with `NoSuchUpload`. The bucket's lifecycle rule reaps
        # an upload nobody returns to.
        if max_size is not None:
            total = sum(real_parts[part.number].size for part in parts)
            if total > max_size:
                return CommitRefused(
                    reason=f"the parts add up to {total} bytes, over the "
                    f"maximum of {max_size}"
                )

        # Named by the ETags S3 reported, never by the ones the client
        # sent: what S3 holds is what is being completed.
        try:
            response = await asyncio.to_thread(
                self._client.complete_multipart_upload,
                Bucket=self._bucket,
                Key=self._key(blob_id),
                UploadId=upload_id,
                MultipartUpload={
                    "Parts": [
                        {
                            "PartNumber": part.number,
                            "ETag": _quote_etag(real_parts[part.number].etag),
                        } for part in
                        sorted(parts, key=lambda part: part.number)
                    ],
                },
            )
        except ClientError as error:
            code = _error_code(error)
            if code in ("InvalidPart", "InvalidPartOrder", "EntityTooSmall"):
                return CommitRefused(
                    reason="the parts could not be assembled as reported "
                    f"({code}); upload them again and commit again"
                )
            if code == "NoSuchUpload":
                # A prior attempt already completed this upload (the
                # multipart upload no longer exists) but its result
                # wasn't memoized before a crash/retry. Treat the
                # already-finalized object as the success.
                etag = await self._head_object_etag(blob_id)
                if etag is not None:
                    return await self._completed(blob_id, etag)
            raise
        return await self._completed(
            blob_id,
            str(response["ETag"]).strip('"'),
        )

    async def _completed(self, blob_id: str, etag: str) -> str:
        """Returns `etag`, once every multipart upload still listed for
        the committed object's key is aborted: the completed one is
        already consumed, so whatever remains was orphaned."""
        await self._abort_uploads(blob_id, ())
        return etag

    async def _list_uploads(self, blob_id: str) -> list[str]:
        """Returns the IDs of every in-progress multipart upload for the
        blob's key, per `ListMultipartUploads` (paginated)."""
        key = self._key(blob_id)
        uploads: list[str] = []
        arguments: dict[str, Any] = {"Bucket": self._bucket, "Prefix": key}
        while True:
            response = await asyncio.to_thread(
                self._client.list_multipart_uploads, **arguments
            )
            uploads.extend(
                str(upload["UploadId"])
                for upload in response.get("Uploads", [])
                # A prefix also matches longer keys, which are other
                # blobs' uploads.
                if upload.get("Key") == key
            )
            if not response.get("IsTruncated"):
                return uploads
            arguments["KeyMarker"] = response["NextKeyMarker"]
            arguments["UploadIdMarker"] = response["NextUploadIdMarker"]

    async def _abort_uploads(
        self,
        blob_id: str,
        known: Sequence[str],
    ) -> None:
        """Aborts the uploads in `known` and every other in-progress
        multipart upload for the blob's key."""
        uploads = list(known)
        uploads.extend(
            upload for upload in await self._list_uploads(blob_id)
            if upload not in uploads
        )
        for upload_id in uploads:
            await self._abort(blob_id, upload_id)

    async def _head_object_etag(self, blob_id: str) -> Optional[str]:
        """Returns the committed object's ETag, or `None` if it does
        not exist."""
        try:
            response = await asyncio.to_thread(
                self._client.head_object,
                Bucket=self._bucket,
                Key=self._key(blob_id),
            )
        except ClientError as error:
            # Only a 404 means "not there". Any other failure is this
            # client being unable to find out, and answering `None` to
            # that would turn a transient outage into a permanent,
            # client-facing upload error.
            if _status(error) == 404:
                return None
            raise
        return str(response["ETag"]).strip('"')

    async def _list_part_sizes(
        self,
        blob_id: str,
        upload_id: str,
    ) -> Optional[dict[int, _RealPart]]:
        """What S3 holds for every part of this upload, keyed by part
        number, per its `ListParts` (paginated).

        `None` when the upload no longer exists, which is what a
        completed upload looks like: a prior `CompleteMultipartUpload`
        consumes it, so a retry that arrives after one succeeded finds
        nothing to list."""
        parts: dict[int, _RealPart] = {}
        arguments: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": self._key(blob_id),
            "UploadId": upload_id,
        }
        while True:
            try:
                response = await asyncio.to_thread(
                    self._client.list_parts, **arguments
                )
            except ClientError as error:
                # Only `NoSuchUpload` means the upload is gone. A bare
                # 404 is not enough: a missing bucket or a misrouted
                # endpoint answers 404 too, and treating those as a
                # vanished upload would report a configuration fault
                # as a permanent, client-fixable error.
                if _error_code(error) == "NoSuchUpload":
                    return None
                raise
            for part in response.get("Parts", []):
                parts[int(part["PartNumber"])] = _RealPart(
                    size=int(part["Size"]),
                    etag=str(part["ETag"]).strip('"'),
                )
            if not response.get("IsTruncated"):
                return parts
            arguments["PartNumberMarker"] = response["NextPartNumberMarker"]

    async def _abort(self, blob_id: str, upload_id: str) -> None:
        """Aborts an in-progress multipart upload.

        An upload that is already gone is the state being asked for,
        so it counts as success; anything else is raised, because a
        caller that goes on to report the blob deleted would be
        reporting bytes gone that are still stored and still reachable
        through whatever presigned part URLs are outstanding."""
        try:
            await asyncio.to_thread(
                self._client.abort_multipart_upload,
                Bucket=self._bucket,
                Key=self._key(blob_id),
                UploadId=upload_id,
            )
        except ClientError as error:
            if _error_code(error) != "NoSuchUpload":
                raise

    def download_url(
        self,
        *,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
        response_overrides: Optional[Mapping[str, str]] = None,
    ) -> tuple[str, int]:
        """Returns a URL to `GET` the committed blob's bytes from, and
        how many seconds it is valid for: the `ttl_seconds` asked for,
        capped by how far ahead a URL can be signed.

        `blob_id`: the blob whose bytes the URL serves.

        `ttl_seconds`: how long the URL should stay valid, or `None`
        for the default.

        `response_overrides`: S3's `response-*` query parameters,
        which set the headers the bytes are served with; part of the
        signed URL, so the holder cannot change them.

        Idempotency: idempotent, keyed by `(blob_id, ttl_seconds,
        response_overrides)`. Minting a URL changes nothing in the
        bucket, and every URL minted for the same key serves the same
        bytes the same way; two differ only in when they were signed
        and so when they expire."""
        ttl = min(
            _DEFAULT_DOWNLOAD_TTL_SECONDS
            if ttl_seconds is None else ttl_seconds,
            _MAX_URL_TTL_SECONDS,
        )
        params: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": self._key(blob_id),
        }
        # The overrides travel in the signed query, so a holder of the
        # URL can no more change how the bytes are served than which
        # bytes are served.
        for name, value in (response_overrides or {}).items():
            params[_RESPONSE_OVERRIDE_PARAMETERS[name]] = value
        url = self._presign(
            operation="get_object",
            method="GET",
            params=params,
            ttl_seconds=ttl,
        )
        return url, ttl

    async def delete_object(
        self,
        *,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        """Returns once the blob's object, if any, and the multipart
        uploads named are gone from the bucket.

        `blob_id`: the blob whose bytes are removed.

        `upload_ids`: the multipart uploads, from
        `create_multipart_upload`, that the caller recorded; aborted
        whether or not the bucket's listing shows them, along with
        every other in-progress upload for the key, since bytes an
        unfinished upload has parked are not part of the object and
        deleting the object does not reach them.

        Idempotency: idempotent, keyed by `blob_id`. Deleting an
        absent object and aborting an absent upload both succeed, so a
        repeated call finds the state it was asked for and changes
        nothing."""
        # Bytes an unfinished upload has parked are not part of the
        # object, so deleting the object leaves them behind, billable
        # and reachable through any presigned part URL still in a
        # client's hands. Abort every upload for the key first: the
        # ones the control plane recorded, and any it never learned of
        # because the answer that named it was lost.
        #
        # Aborting an upload that is already gone answers 404, which
        # is the state being asked for, so this stays idempotent.
        await self._abort_uploads(blob_id, upload_ids)

        # Deleting a nonexistent object is a successful no-op in S3
        # (204), which makes this idempotent by construction.
        await asyncio.to_thread(
            self._client.delete_object,
            Bucket=self._bucket,
            Key=self._key(blob_id),
        )
