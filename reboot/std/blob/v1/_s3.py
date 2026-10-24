"""The S3 blob store: blob bytes as objects in an S3-compatible
bucket.

Implements just the sliver of the S3 API that blobs need -- multipart
uploads (create, complete, abort), object deletion, and presigned
part-`PUT`/object-`GET` URLs -- over `aiohttp` with hand-rolled SigV4
signing. Works against AWS S3 and S3-compatible stores such as MinIO
(path-style addressing is used throughout, which MinIO requires).

Signing is hand-rolled rather than delegated to an AWS SDK
deliberately: the natural SDK (`boto3`) is synchronous, and its async
wrappers pin exact `botocore` versions that conflict easily with other
dependencies; the API surface needed here is a small, frozen sliver
(SigV4 has not changed since 2014); credentials must come from exactly
the configured environment, never an SDK's ambient provider chain; and
a URL has to be signable for a path other than the one it is served
at (see `url_prefix` below), which no SDK offers.

Uploads map 1:1 onto S3 multipart uploads: clients `PUT` parts
directly to presigned URLs and download directly from presigned `GET`
URLs, so bytes never pass through the application.
"""

import aiohttp
import datetime
import hashlib
import hmac
import os
import urllib.parse
import xml.etree.ElementTree
from dataclasses import dataclass
from reboot.std.blob.v1._store import (
    DEFAULT_PART_SIZE_BYTES,
    BlobStoreError,
    UploadedPart,
)
from typing import Mapping, Optional, Sequence

# The environment variables that configure the store: the S3 API
# endpoint (e.g. `https://s3.us-east-1.amazonaws.com`, or
# `http://127.0.0.1:9000` for a MinIO), the bucket, an optional key
# prefix within it, the region the endpoint signs for, and the
# credentials.
ENVVAR_BLOB_S3_ENDPOINT = "REBOOT_BLOB_S3_ENDPOINT"
ENVVAR_BLOB_S3_BUCKET = "REBOOT_BLOB_S3_BUCKET"
# The endpoint as the application's clients reach it, when that is not
# the one the application itself reaches, e.g. a MinIO that pods reach
# by its name on their network and the browser on a port mapped to the
# developer's machine. A SigV4 signature covers the host, so a URL is
# signed for whichever name its holder will use.
ENVVAR_BLOB_S3_PUBLIC_ENDPOINT = "REBOOT_BLOB_S3_PUBLIC_ENDPOINT"
ENVVAR_BLOB_S3_PREFIX = "REBOOT_BLOB_S3_PREFIX"
ENVVAR_BLOB_S3_REGION = "REBOOT_BLOB_S3_REGION"
ENVVAR_BLOB_S3_ACCESS_KEY_ID = "REBOOT_BLOB_S3_ACCESS_KEY_ID"
ENVVAR_BLOB_S3_SECRET_ACCESS_KEY = "REBOOT_BLOB_S3_SECRET_ACCESS_KEY"

# When set, a path prefix of the application's own, e.g.
# `/rbt.std.blob.v1/`, that the application forwards to the endpoint
# with the prefix removed and the `Host` header set to the endpoint's.
# The URLs the store mints are then relative to the application, on
# that prefix, rather than absolute URLs of the endpoint: a browser
# reaches the store on the origin it already reached the application
# by, and the endpoint need not be reachable by that name at all.
ENVVAR_BLOB_S3_URL_PREFIX = "REBOOT_BLOB_S3_URL_PREFIX"

_UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

# A SigV4 presigned URL may not outlive 7 days, which is therefore the
# longest this store can sign for; downloads get a generous default
# well below that.
_MAX_URL_TTL_SECONDS = 7 * 24 * 60 * 60
_DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 60
_DEFAULT_UPLOAD_TTL_SECONDS = 15 * 60

# How long a call to S3 may go without a sign of life before it is
# given up as lost: connecting, and then between one byte of the
# response and the next. Bounded per read rather than in total so that
# a `CompleteMultipartUpload` of a large object, which S3 keeps alive
# with whitespace while it assembles the parts, can take the minutes
# it needs, while a connection that has silently died is reported
# within seconds and left to the caller to retry.
_S3_TIMEOUT = aiohttp.ClientTimeout(sock_connect=10, sock_read=30)


class S3NotConfigured(RuntimeError):
    """Raised when the environment names no S3 store to keep blobs
    in."""


def _quote_etag(etag: str) -> str:
    return '"' + etag.strip('"') + '"'


def _uri_encode(value: str, *, encode_slash: bool = True) -> str:
    safe = "" if encode_slash else "/"
    return urllib.parse.quote(value, safe=safe)


def _signing_host(parsed: urllib.parse.ParseResult) -> str:
    """The `Host` header value to sign: the netloc with an explicit
    default port stripped, because HTTP clients (and browsers, for
    presigned URLs) drop `:443`/`:80` before sending, which would
    otherwise diverge from the signed value and yield
    `SignatureDoesNotMatch`."""
    host = parsed.netloc
    if parsed.scheme == "https" and host.endswith(":443"):
        return host[:-len(":443")]
    if parsed.scheme == "http" and host.endswith(":80"):
        return host[:-len(":80")]
    return host


class SigV4Signer:
    """Computes AWS Signature Version 4 signatures, both header-based
    (for API calls) and query-based (for presigned URLs). Defaults to
    the S3 service but signs for any AWS query API (e.g. IAM)."""

    def __init__(
        self,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        service: str = "s3",
    ):
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._service = service

    def _signing_key(self, date: str) -> bytes:

        def sign(key: bytes, message: str) -> bytes:
            return hmac.new(key, message.encode(), hashlib.sha256).digest()

        key = sign(f"AWS4{self._secret_access_key}".encode(), date)
        key = sign(key, self._region)
        key = sign(key, self._service)
        return sign(key, "aws4_request")

    def _scope(self, date: str) -> str:
        return f"{date}/{self._region}/{self._service}/aws4_request"

    def _signature(
        self,
        *,
        method: str,
        path: str,
        query: dict[str, str],
        headers: dict[str, str],
        payload_hash: str,
        timestamp: str,
        date: str,
    ) -> str:
        canonical_query = "&".join(
            f"{_uri_encode(key)}={_uri_encode(value)}"
            for key, value in sorted(query.items())
        )
        signed_headers = ";".join(
            header.lower() for header in sorted(headers, key=str.lower)
        )
        canonical_headers = "".join(
            f"{header.lower()}:{value.strip()}\n" for header, value in
            sorted(headers.items(), key=lambda h: h[0].lower())
        )
        canonical_request = "\n".join(
            [
                method,
                _uri_encode(path, encode_slash=False),
                canonical_query,
                canonical_headers,
                signed_headers,
                payload_hash,
            ]
        )
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                timestamp,
                self._scope(date),
                hashlib.sha256(canonical_request.encode()).hexdigest(),
            ]
        )
        return hmac.new(
            self._signing_key(date),
            string_to_sign.encode(),
            hashlib.sha256,
        ).hexdigest()

    def sign_headers(
        self,
        *,
        method: str,
        host: str,
        path: str,
        query: dict[str, str],
        payload: bytes,
    ) -> dict[str, str]:
        """Returns the headers (including `Authorization`) for an S3
        API call."""
        now = datetime.datetime.now(datetime.timezone.utc)
        timestamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")
        payload_hash = hashlib.sha256(payload).hexdigest()
        headers = {
            "Host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": timestamp,
        }
        signature = self._signature(
            method=method,
            path=path,
            query=query,
            headers=headers,
            payload_hash=payload_hash,
            timestamp=timestamp,
            date=date,
        )
        signed_headers = ";".join(
            header.lower() for header in sorted(headers, key=str.lower)
        )
        headers["Authorization"] = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self._access_key_id}/{self._scope(date)}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )
        # `Host` is set by the HTTP client itself.
        del headers["Host"]
        return headers

    def presign(
        self,
        *,
        method: str,
        host: str,
        path: str,
        query: dict[str, str],
        ttl_seconds: int,
    ) -> str:
        """Returns the path and query of a presigned request for
        `method` on `path`, signed for the `Host` header `host`:
        `{path}?{query}`, for the caller to put a scheme and host (or
        a prefix of its own) in front of."""
        now = datetime.datetime.now(datetime.timezone.utc)
        timestamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")
        query = dict(query)
        query.update(
            {
                "X-Amz-Algorithm":
                    "AWS4-HMAC-SHA256",
                "X-Amz-Credential":
                    f"{self._access_key_id}/{self._scope(date)}",
                "X-Amz-Date":
                    timestamp,
                "X-Amz-Expires":
                    str(ttl_seconds),
                "X-Amz-SignedHeaders":
                    "host",
            }
        )
        signature = self._signature(
            method=method,
            path=path,
            query=query,
            headers={"Host": host},
            payload_hash=_UNSIGNED_PAYLOAD,
            timestamp=timestamp,
            date=date,
        )
        query["X-Amz-Signature"] = signature
        query_string = "&".join(
            f"{_uri_encode(key)}={_uri_encode(value)}"
            for key, value in sorted(query.items())
        )
        return f"{_uri_encode(path, encode_slash=False)}?{query_string}"


@dataclass(frozen=True)
class _RealPart:
    """One part as S3 reports it, as opposed to as a client claims
    it."""

    size: int
    etag: str


def _is_no_such_upload(status: int, body: bytes) -> bool:
    """Whether a response says this multipart upload does not exist.

    A bare 404 is not enough: a missing bucket or a misrouted endpoint
    answers 404 too, and treating those as a vanished upload would
    report a configuration fault as a permanent, client-fixable
    error."""
    return status == 404 and b"NoSuchUpload" in body


class S3BlobStore:
    """Stores blob bytes as objects in an S3-compatible bucket, under
    `{prefix}/blobs/{blob_id}`."""

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
        self._signer = SigV4Signer(region, access_key_id, secret_access_key)

    @classmethod
    def from_environment(cls) -> "S3BlobStore":
        """The store the `REBOOT_BLOB_S3_*` environment variables
        configure. Raises `S3NotConfigured` when they name none."""
        endpoint = os.environ.get(ENVVAR_BLOB_S3_ENDPOINT)
        if not endpoint:
            raise S3NotConfigured(
                f"'{ENVVAR_BLOB_S3_ENDPOINT}' is not set; blobs need an "
                "S3-compatible store to keep their bytes in"
            )
        missing = [
            name for name in (
                ENVVAR_BLOB_S3_BUCKET,
                ENVVAR_BLOB_S3_REGION,
                ENVVAR_BLOB_S3_ACCESS_KEY_ID,
                ENVVAR_BLOB_S3_SECRET_ACCESS_KEY,
            ) if not os.environ.get(name)
        ]
        if missing:
            raise S3NotConfigured(
                f"'{ENVVAR_BLOB_S3_ENDPOINT}' is set but "
                f"{', '.join(repr(name) for name in missing)} "
                f"{'is' if len(missing) == 1 else 'are'} not"
            )
        return cls(
            endpoint=endpoint,
            bucket=os.environ[ENVVAR_BLOB_S3_BUCKET],
            prefix=os.environ.get(ENVVAR_BLOB_S3_PREFIX, ""),
            region=os.environ[ENVVAR_BLOB_S3_REGION],
            access_key_id=os.environ[ENVVAR_BLOB_S3_ACCESS_KEY_ID],
            secret_access_key=os.environ[ENVVAR_BLOB_S3_SECRET_ACCESS_KEY],
            public_endpoint=(
                os.environ.get(ENVVAR_BLOB_S3_PUBLIC_ENDPOINT) or None
            ),
            url_prefix=os.environ.get(ENVVAR_BLOB_S3_URL_PREFIX) or None,
        )

    @property
    def part_size(self) -> int:
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

    def _path(self, blob_id: str) -> str:
        return f"/{self._bucket}/{self._key(blob_id)}"

    def _host(self) -> str:
        return _signing_host(urllib.parse.urlparse(self._endpoint))

    def _presign(
        self,
        *,
        method: str,
        path: str,
        query: dict[str, str],
        ttl_seconds: int,
    ) -> str:
        """A URL for `method` on `path`. With a `url_prefix`, a URL
        relative to the application on that prefix, signed for the
        endpoint's host, which the application forwards it to with
        that same `Host`; otherwise an absolute URL of the public
        endpoint, signed for its host."""
        if self._url_prefix is not None:
            signed = self._signer.presign(
                method=method,
                host=self._host(),
                path=path,
                query=query,
                ttl_seconds=ttl_seconds,
            )
            return f"{self._url_prefix}{signed}"
        parsed = urllib.parse.urlparse(self._public_endpoint)
        host = _signing_host(parsed)
        signed = self._signer.presign(
            method=method,
            host=host,
            path=path,
            query=query,
            ttl_seconds=ttl_seconds,
        )
        return f"{parsed.scheme}://{host}{signed}"

    async def _request(
        self,
        *,
        method: str,
        path: str,
        query: dict[str, str],
        payload: bytes = b"",
        headers: Optional[dict[str, str]] = None,
    ) -> tuple[int, bytes]:
        status, body, _ = await self._request_with_headers(
            method=method,
            path=path,
            query=query,
            payload=payload,
            headers=headers,
        )
        return status, body

    async def _request_with_headers(
        self,
        *,
        method: str,
        path: str,
        query: dict[str, str],
        payload: bytes = b"",
        headers: Optional[dict[str, str]] = None,
    ) -> tuple[int, bytes, Mapping[str, str]]:
        request_headers = self._signer.sign_headers(
            method=method,
            host=self._host(),
            path=path,
            query=query,
            payload=payload,
        )
        if headers is not None:
            request_headers.update(headers)
        url = f"{self._endpoint}{_uri_encode(path, encode_slash=False)}"
        if query:
            url += "?" + urllib.parse.urlencode(sorted(query.items()))
        async with aiohttp.ClientSession(timeout=_S3_TIMEOUT) as session:
            async with session.request(
                method,
                url,
                data=payload,
                headers=request_headers,
            ) as response:
                return (
                    response.status,
                    await response.read(),
                    # Not `dict(...)`: aiohttp's mapping is
                    # case-insensitive, and header case is a server's
                    # to choose. MinIO answers `Etag`, S3 `ETag`, and
                    # flattening here would make a committed object
                    # look absent to whichever caller guessed wrong.
                    response.headers,
                )

    async def ensure_bucket(self) -> None:
        """Creates the bucket if it does not exist. For a store the
        application runs itself; a bucket elsewhere is made by whoever
        owns it."""
        status, body = await self._request(
            method="PUT",
            path=f"/{self._bucket}",
            query={},
        )
        # S3 answers a bucket the same owner already has with 409
        # `BucketAlreadyOwnedByYou` (and MinIO, in the one region it
        # has, likewise); both are the state being asked for.
        if status == 200 or (
            status == 409 and b"BucketAlreadyOwnedByYou" in body
        ):
            return
        raise RuntimeError(
            f"S3 CreateBucket failed ({status}): "
            f"{body.decode(errors='replace')}"
        )

    async def create(self, blob_id: str, content_type: str) -> str:
        status, body = await self._request(
            method="POST",
            path=self._path(blob_id),
            query={"uploads": ""},
            headers={"Content-Type": content_type},
        )
        if status != 200:
            raise RuntimeError(
                f"S3 CreateMultipartUpload failed ({status}): "
                f"{body.decode(errors='replace')}"
            )
        root = xml.etree.ElementTree.fromstring(body)
        upload_id = root.findtext("{*}UploadId") or root.findtext("UploadId")
        if upload_id is None:
            raise RuntimeError(
                "S3 CreateMultipartUpload response is missing an "
                f"`UploadId`: {body.decode(errors='replace')}"
            )
        return upload_id

    def part_upload_url(
        self,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        return self._presign(
            method="PUT",
            path=self._path(blob_id),
            query={
                "partNumber": str(part_number),
                "uploadId": upload_id,
            },
            ttl_seconds=_DEFAULT_UPLOAD_TTL_SECONDS,
        )

    async def commit(
        self,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: Sequence[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str:
        # The client uploads its bytes straight to presigned URLs, so
        # the sizes it reports are unverifiable anywhere else:
        # `ListParts` is the only ground truth about what S3 actually
        # holds. Check every reported size against it, so that a
        # blob's recorded size is what was stored rather than whatever
        # was claimed. The ETags are checked too, by S3 itself, which
        # fails the completion below with `InvalidPart`.
        real_parts = await self._list_part_sizes(blob_id, upload_id)
        if real_parts is None:
            # The session is gone. Either a previous attempt completed
            # it, in which case the object is in the bucket and passed
            # these same checks on the way in, or it expired without
            # ever being completed. The first is the crash-and-retry
            # the control plane is built for; the second is permanent,
            # and saying so stops a workflow retrying an upload that
            # can never come back.
            etag = await self._head_object_etag(blob_id)
            if etag is not None:
                return etag
            raise BlobStoreError(
                f"upload '{upload_id}' no longer exists and no object "
                f"was committed for blob '{blob_id}'"
            )

        for part in parts:
            real = real_parts.get(part.number)
            if real is None:
                raise BlobStoreError(f"part {part.number} was never uploaded")
            if real.size != part.size:
                raise BlobStoreError(
                    f"part {part.number} size mismatch: uploaded "
                    f"{real.size} bytes but {part.size} were reported "
                    "via `PartUploaded`"
                )
            if real.etag != part.etag.strip('"'):
                raise BlobStoreError(
                    f"part {part.number} ETag mismatch: the uploaded "
                    "bytes do not match what was reported via "
                    "`PartUploaded`"
                )

        # Measured over the parts being completed, which are what
        # the object will consist of -- S3 discards the rest. Counting
        # a stale part left by an abandoned attempt would fail an
        # upload here that the client never asked to be completed.
        #
        # Neither this nor the per-part checks above abort the
        # session. A blob whose commit fails goes back to `UPLOADING`
        # still holding this upload ID, so a client can replace the
        # offending part and commit again; aborting would leave that
        # ID naming a session S3 has destroyed and every retry would
        # fail with `NoSuchUpload`. The bucket's lifecycle rule reaps
        # a session nobody returns to.
        if max_size is not None:
            total = sum(real_parts[part.number].size for part in parts)
            if total > max_size:
                raise BlobStoreError(
                    f"uploaded {total} bytes exceeds the maximum of "
                    f"{max_size}"
                )

        # Built from the ETags S3 reported, never from the ones the
        # client sent. A client-supplied value reaching this document
        # unescaped could close the element it sits in and append
        # `<Part>` elements of its own -- parts that none of the checks
        # above ever saw, since those iterate what the client asked to
        # complete. S3 would commit an object larger than `max_size`
        # allows and larger than the size recorded for it.
        payload_parts = "".join(
            "<Part>"
            f"<PartNumber>{part.number}</PartNumber>"
            f"<ETag>{_quote_etag(real_parts[part.number].etag)}</ETag>"
            "</Part>" for part in sorted(parts, key=lambda part: part.number)
        )
        payload = (
            "<CompleteMultipartUpload>"
            f"{payload_parts}"
            "</CompleteMultipartUpload>"
        ).encode()
        status, body = await self._request(
            method="POST",
            path=self._path(blob_id),
            query={"uploadId": upload_id},
            payload=payload,
        )
        text = body.decode(errors="replace")
        # S3 reports some completion failures with HTTP 200 and an
        # `<Error>` document in the body, so check the body either way.
        if status != 200 or "<Error>" in text:
            if "InvalidPart" in text or "EntityTooSmall" in text:
                raise BlobStoreError(
                    f"S3 CompleteMultipartUpload rejected ({status}): {text}"
                )
            if "NoSuchUpload" in text:
                # A prior attempt already completed this upload (the
                # multipart session no longer exists) but its result
                # wasn't memoized before a crash/retry. Treat the
                # already-finalized object as the success.
                etag = await self._head_object_etag(blob_id)
                if etag is not None:
                    return etag
            raise RuntimeError(
                f"S3 CompleteMultipartUpload failed ({status}): {text}"
            )
        root = xml.etree.ElementTree.fromstring(body)
        etag = root.findtext("{*}ETag") or root.findtext("ETag")
        if etag is None:
            raise RuntimeError(
                "S3 CompleteMultipartUpload response is missing an "
                f"`ETag`: {text}"
            )
        return etag.strip('"')

    async def _head_object_etag(self, blob_id: str) -> Optional[str]:
        """Returns the committed object's ETag, or `None` if it does
        not exist."""
        status, _, headers = await self._request_with_headers(
            method="HEAD",
            path=self._path(blob_id),
            query={},
        )
        # Only a 404 means "not there". Any other failure is this store
        # being unable to find out, and answering `None` to that would
        # turn a transient outage into a permanent, client-facing
        # upload error.
        if status == 404:
            return None
        if status != 200:
            raise RuntimeError(f"S3 HeadObject failed ({status})")
        etag = headers.get("ETag")
        return etag.strip('"') if etag is not None else None

    async def _list_part_sizes(
        self,
        blob_id: str,
        upload_id: str,
    ) -> Optional[dict[int, _RealPart]]:
        """What S3 holds for every part of this upload, keyed by part
        number, per its `ListParts` (paginated).

        `None` when the upload no longer exists, which is what a
        completed session looks like: a prior `CompleteMultipartUpload`
        consumes it, so a retry that arrives after one succeeded finds
        nothing to list."""
        parts: dict[int, _RealPart] = {}
        marker: Optional[str] = None
        while True:
            query = {"uploadId": upload_id}
            if marker is not None:
                query["part-number-marker"] = marker
            status, body = await self._request(
                method="GET",
                path=self._path(blob_id),
                query=query,
            )
            if _is_no_such_upload(status, body):
                return None
            if status != 200:
                raise RuntimeError(
                    f"S3 ListParts failed ({status}): "
                    f"{body.decode(errors='replace')}"
                )
            root = xml.etree.ElementTree.fromstring(body)
            for part in root.iterfind(".//{*}Part"):
                number = part.findtext("{*}PartNumber")
                size = part.findtext("{*}Size")
                etag = part.findtext("{*}ETag")
                if number is None or size is None or etag is None:
                    continue
                parts[int(number)] = _RealPart(
                    size=int(size),
                    etag=etag.strip('"'),
                )
            truncated = root.findtext("{*}IsTruncated") or "false"
            if truncated.lower() != "true":
                return parts
            marker = root.findtext("{*}NextPartNumberMarker")

    async def _abort(self, blob_id: str, upload_id: str) -> None:
        """Aborts an in-progress multipart upload.

        An upload that is already gone is the state being asked for,
        so it counts as success; anything else is raised, because a
        caller that goes on to report the blob deleted would be
        reporting bytes gone that are still stored and still reachable
        through whatever presigned part URLs are outstanding."""
        status, body = await self._request(
            method="DELETE",
            path=self._path(blob_id),
            query={"uploadId": upload_id},
        )
        if status in (200, 204) or _is_no_such_upload(status, body):
            return
        raise RuntimeError(
            f"S3 AbortMultipartUpload failed ({status}): "
            f"{body.decode(errors='replace')}"
        )

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
        response_overrides: Optional[Mapping[str, str]] = None,
    ) -> tuple[str, int]:
        ttl = min(
            _DEFAULT_DOWNLOAD_TTL_SECONDS
            if ttl_seconds is None else ttl_seconds,
            _MAX_URL_TTL_SECONDS,
        )
        # The overrides travel in the signed query, so a holder of the
        # URL can no more change how the bytes are served than which
        # bytes are served.
        url = self._presign(
            method="GET",
            path=self._path(blob_id),
            query=dict(response_overrides or {}),
            ttl_seconds=ttl,
        )
        return url, ttl

    async def delete(
        self,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        # Bytes an unfinished upload has parked are not part of the
        # object, so deleting the object leaves them behind, billable
        # and reachable through any presigned part URL still in a
        # client's hands. Abort the sessions the control plane knows
        # about first; the bucket's lifecycle rule remains the backstop
        # for one it has forgotten.
        #
        # Aborting an upload that is already gone answers 404, which
        # is the state being asked for, so this stays idempotent.
        for upload_id in upload_ids:
            await self._abort(blob_id, upload_id)

        # Deleting a nonexistent object is a successful no-op in S3
        # (204), which makes this idempotent by construction.
        status, body = await self._request(
            method="DELETE",
            path=self._path(blob_id),
            query={},
        )
        if status not in (200, 204):
            raise RuntimeError(
                f"S3 DeleteObject failed ({status}): "
                f"{body.decode(errors='replace')}"
            )
