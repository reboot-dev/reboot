import unittest
from reboot.std.blob.v1._s3 import S3BlobStore
from reboot.std.blob.v1._store import BlobStoreError, UploadedPart
from typing import Mapping, Optional
from urllib.parse import parse_qs, urlparse

BLOB_ID = "blob-one"
UPLOAD_ID = "upload-one"


def _list_parts_body(
    sizes: dict[int, int],
    next_marker: Optional[int] = None,
) -> bytes:
    """One page of an S3 `ListParts` response."""
    parts = "".join(
        "<Part>"
        f"<PartNumber>{number}</PartNumber>"
        f"<ETag>&quot;etag-{number}&quot;</ETag>"
        f"<Size>{size}</Size>"
        "</Part>" for number, size in sorted(sizes.items())
    )
    truncated = "true" if next_marker is not None else "false"
    marker = (
        f"<NextPartNumberMarker>{next_marker}</NextPartNumberMarker>"
        if next_marker is not None else ""
    )
    return (
        "<ListPartsResult>"
        f"{parts}"
        f"<IsTruncated>{truncated}</IsTruncated>"
        f"{marker}"
        "</ListPartsResult>"
    ).encode()


class FakeS3BlobStore(S3BlobStore):
    """An `S3BlobStore` that answers from canned part data instead of
    talking to S3, so that completion can be exercised against sizes
    that do and do not match what a client reported."""

    def __init__(
        self,
        pages: list[bytes],
        *,
        upload_exists: bool = True,
        committed_etag: Optional[str] = None,
        abort_response: Optional[tuple[int, bytes]] = None,
        head_status: Optional[int] = None,
        list_parts_response: Optional[tuple[int, bytes]] = None,
        public_endpoint: Optional[str] = None,
        url_prefix: Optional[str] = None,
    ):
        super().__init__(
            endpoint="http://s3.example",
            bucket="a-bucket",
            prefix="apps/an-application",
            region="us-east-1",
            access_key_id="an-access-key-id",
            secret_access_key="a-secret-access-key",
            public_endpoint=public_endpoint,
            url_prefix=url_prefix,
        )
        self._pages = list(pages)
        # Whether S3 still knows the multipart session. A completed
        # one is consumed, so `ListParts` answers `NoSuchUpload`.
        self._upload_exists = upload_exists
        # The ETag of an object already in the bucket, if any.
        self._committed_etag = committed_etag
        # Failures to inject, each standing for a way S3 can answer
        # that is neither success nor "the thing is not there".
        self._abort_response = abort_response
        self._head_status = head_status
        self._list_parts_response = list_parts_response
        self.methods: list[str] = []
        self.completion_payloads: list[bytes] = []
        self.aborted_upload_ids: list[str] = []
        self.deleted_object = False

    async def _request_with_headers(
        self,
        *,
        method: str,
        path: str,
        query: dict[str, str],
        payload: bytes = b"",
        headers: Optional[dict[str, str]] = None,
    ) -> tuple[int, bytes, Mapping[str, str]]:
        self.methods.append(method)
        if method == "GET":
            if self._list_parts_response is not None:
                status, body = self._list_parts_response
                return status, body, {}
            if not self._upload_exists:
                return (
                    404,
                    b"<Error><Code>NoSuchUpload</Code></Error>",
                    {},
                )
            return 200, self._pages.pop(0), {}
        if method == "HEAD":
            if self._head_status is not None:
                return self._head_status, b"", {}
            if self._committed_etag is None:
                return 404, b"", {}
            # Header case is a server's to choose -- MinIO answers
            # `Etag` where S3 answers `ETag` -- and the store leans on
            # aiohttp's case-insensitive mapping to bridge that. This
            # fake replaces the request method wholesale, so it cannot
            # exercise that; the `Mapping` return annotation on
            # `_request_with_headers` is what stops the real one being
            # flattened into a case-sensitive `dict`.
            return 200, b"", {"ETag": f'"{self._committed_etag}"'}
        if method == "POST":
            self.completion_payloads.append(payload)
            return 200, (
                b"<CompleteMultipartUploadResult>"
                b"<ETag>&quot;the-object-etag&quot;</ETag>"
                b"</CompleteMultipartUploadResult>"
            ), {}
        if method == "DELETE":
            upload_id = query.get("uploadId")
            if upload_id is None:
                self.deleted_object = True
                return 204, b"", {}
            self.aborted_upload_ids.append(upload_id)
            if self._abort_response is not None:
                status, body = self._abort_response
                return status, body, {}
            return 204, b"", {}
        raise AssertionError(f"unexpected {method} request")

    @property
    def aborted(self) -> bool:
        return len(self.aborted_upload_ids) > 0


class TestS3Completion(unittest.IsolatedAsyncioTestCase):
    """Completion must believe `ListParts` rather than the client.

    Parts are uploaded straight to presigned URLs, so the sizes the
    client reports through `PartUploaded` are unverifiable anywhere
    else, and a blob's recorded size is whatever completion
    accepts."""

    async def test_matching_sizes_complete(self) -> None:
        store = FakeS3BlobStore([_list_parts_body({1: 700, 2: 300})])

        etag = await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        self.assertEqual("the-object-etag", etag)
        self.assertFalse(store.aborted)

    async def test_a_part_smaller_than_reported_is_refused(self) -> None:
        # The client claims a part it did not fully upload, which
        # without a check would be recorded as the blob's size.
        store = FakeS3BlobStore([_list_parts_body({1: 5})])

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag="etag-1", size=1000)],
            )

        self.assertIn("size mismatch", str(caught.exception))
        self.assertIn("uploaded 5 bytes but 1000", str(caught.exception))
        # The session survives, so the client can replace the part
        # and commit again.
        self.assertFalse(store.aborted)

    async def test_a_part_larger_than_reported_is_refused(self) -> None:
        # The mirror image: understating a part would under-report the
        # blob's size while the bytes are stored all the same.
        store = FakeS3BlobStore([_list_parts_body({1: 1000})])

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag="etag-1", size=5)],
            )

        self.assertIn("size mismatch", str(caught.exception))
        self.assertFalse(store.aborted)

    async def test_a_part_that_was_never_uploaded_is_refused(self) -> None:
        store = FakeS3BlobStore([_list_parts_body({1: 700})])

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[
                    UploadedPart(number=1, etag="etag-1", size=700),
                    UploadedPart(number=2, etag="etag-2", size=300),
                ],
            )

        self.assertIn("part 2 was never uploaded", str(caught.exception))
        self.assertFalse(store.aborted)

    async def test_sizes_are_read_across_every_page(self) -> None:
        # A `ListParts` page carries at most a thousand parts, so an
        # upload at the limit is only fully described by all of them.
        store = FakeS3BlobStore(
            [
                _list_parts_body({1: 700}, next_marker=1),
                _list_parts_body({2: 300}),
            ]
        )

        etag = await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        self.assertEqual("the-object-etag", etag)

    async def test_max_size_ignores_a_part_left_behind(self) -> None:
        # S3 discards the parts a completion does not name, so they
        # are not part of the committed object and must not count
        # against its maximum.
        store = FakeS3BlobStore([_list_parts_body({1: 700, 2: 600})])

        etag = await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[UploadedPart(number=1, etag="etag-1", size=700)],
            max_size=1000,
        )

        self.assertEqual("the-object-etag", etag)
        self.assertFalse(store.aborted)

    async def test_max_size_counts_the_parts_being_completed(self) -> None:
        store = FakeS3BlobStore([_list_parts_body({1: 700, 2: 600})])

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[
                    UploadedPart(number=1, etag="etag-1", size=700),
                    UploadedPart(number=2, etag="etag-2", size=600),
                ],
                max_size=1000,
            )

        self.assertIn("exceeds the maximum", str(caught.exception))
        self.assertFalse(store.aborted)

    async def test_a_completed_upload_returns_the_committed_etag(
        self,
    ) -> None:
        # Completing consumes the multipart session, so a retry that
        # arrives after one succeeded finds no parts to list. The
        # object is in the bucket and already passed these checks on
        # the way in, so its ETag is the answer rather than an error.
        store = FakeS3BlobStore(
            [],
            upload_exists=False,
            committed_etag="the-object-etag",
        )

        etag = await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[UploadedPart(number=1, etag="etag-1", size=700)],
        )

        self.assertEqual("the-object-etag", etag)
        self.assertFalse(store.aborted)

    async def test_a_vanished_upload_with_no_object_is_permanent(
        self,
    ) -> None:
        # Nothing was committed and the session is gone, so retrying
        # can never succeed: a `BlobStoreError` says so, where the
        # `RuntimeError` the control plane treats as transient would
        # have it retry forever.
        store = FakeS3BlobStore([], upload_exists=False)

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag="etag-1", size=700)],
            )

        self.assertIn("no longer exists", str(caught.exception))

    async def test_max_size_allows_an_upload_that_fits(self) -> None:
        store = FakeS3BlobStore([_list_parts_body({1: 700})])

        etag = await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[UploadedPart(number=1, etag="etag-1", size=700)],
            max_size=1000,
        )

        self.assertEqual("the-object-etag", etag)
        self.assertFalse(store.aborted)


class TestS3Urls(unittest.TestCase):

    def test_an_explicit_zero_ttl_is_honoured(self) -> None:
        # Zero is a TTL a caller asked for, not an absent one.
        store = FakeS3BlobStore([])

        _, ttl = store.download_url(BLOB_ID, ttl_seconds=0)

        self.assertEqual(0, ttl)

    def test_no_ttl_falls_back_to_the_default(self) -> None:
        store = FakeS3BlobStore([])

        _, ttl = store.download_url(BLOB_ID)

        self.assertGreater(ttl, 0)

    def test_urls_are_absolute_without_a_prefix(self) -> None:
        store = FakeS3BlobStore([])

        url, _ = store.download_url(BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("http", parsed.scheme)
        self.assertEqual("s3.example", parsed.netloc)
        self.assertEqual(
            "/a-bucket/apps/an-application/blobs/blob-one", parsed.path
        )
        self.assertIn("X-Amz-Signature", parse_qs(parsed.query))

    def test_urls_name_the_public_endpoint(self) -> None:
        # The application reaches the store by one name and its
        # clients by another: the URLs are theirs, so they carry the
        # name they will use, and are signed for it.
        store = FakeS3BlobStore([], public_endpoint="http://localhost:9000")

        url, _ = store.download_url(BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("localhost:9000", parsed.netloc)
        self.assertEqual(
            "/a-bucket/apps/an-application/blobs/blob-one", parsed.path
        )

    def test_urls_are_relative_on_the_prefix(self) -> None:
        # With a prefix the application forwards to the store, a URL
        # names the application rather than the store: the same path
        # and query, which the forwarding sends on to the store as
        # signed, behind the prefix.
        store = FakeS3BlobStore([], url_prefix="/__/blob/")

        url, _ = store.download_url(BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("", parsed.scheme)
        self.assertEqual("", parsed.netloc)
        self.assertEqual(
            "/__/blob/a-bucket/apps/an-application/blobs/blob-one",
            parsed.path,
        )
        self.assertIn("X-Amz-Signature", parse_qs(parsed.query))

    def test_response_overrides_are_signed(self) -> None:
        # The overrides decide how the bytes are served, so they must
        # be in the signed query: a holder of the URL can then no more
        # change them than change which bytes are served.
        store = FakeS3BlobStore([])

        url, _ = store.download_url(
            BLOB_ID,
            response_overrides={
                "response-content-type": "application/octet-stream",
                "response-content-disposition": "attachment",
            },
        )

        query = parse_qs(urlparse(url).query)
        self.assertEqual(
            ["application/octet-stream"], query["response-content-type"]
        )
        self.assertEqual(["attachment"], query["response-content-disposition"])
        self.assertIn("X-Amz-Signature", query)

    def test_part_urls_name_the_part_and_session(self) -> None:
        store = FakeS3BlobStore([])

        url = store.part_upload_url(BLOB_ID, UPLOAD_ID, 7)

        query = parse_qs(urlparse(url).query)
        self.assertEqual(["7"], query["partNumber"])
        self.assertEqual([UPLOAD_ID], query["uploadId"])
        self.assertIn("X-Amz-Signature", query)


class TestS3Delete(unittest.IsolatedAsyncioTestCase):

    async def test_known_uploads_are_aborted_before_the_object(self) -> None:
        # An unfinished upload's parts are not part of the object, so
        # deleting the object alone would leave them billable and
        # still reachable through any presigned part URL outstanding.
        store = FakeS3BlobStore([])

        await store.delete(BLOB_ID, upload_ids=["upload-one", "upload-two"])

        self.assertEqual(
            ["upload-one", "upload-two"], store.aborted_upload_ids
        )
        self.assertTrue(store.deleted_object)

    async def test_delete_without_uploads_only_removes_the_object(
        self,
    ) -> None:
        store = FakeS3BlobStore([])

        await store.delete(BLOB_ID)

        self.assertEqual([], store.aborted_upload_ids)
        self.assertTrue(store.deleted_object)


class TestS3CompletionBody(unittest.IsolatedAsyncioTestCase):
    """The completion document is built from what S3 reported, never
    from what the client sent."""

    async def test_a_crafted_etag_cannot_inject_parts(self) -> None:
        # The attack: report only part 1, but with an ETag that closes
        # its own element and appends a second `<Part>`. Every check
        # above iterates the parts the client *asked* to complete, so
        # an injected one would be committed by S3 having been sized
        # by nobody -- defeating `max_size` and under-recording what
        # was stored.
        forged = (
            'etag-1"</ETag></Part>'
            "<Part><PartNumber>2</PartNumber><ETag>\"etag-2"
        )
        store = FakeS3BlobStore([_list_parts_body({1: 700, 2: 600})])

        with self.assertRaises(BlobStoreError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag=forged, size=700)],
                max_size=1000,
            )

        self.assertIn("ETag mismatch", str(caught.exception))
        self.assertEqual([], store.completion_payloads)

    async def test_the_body_carries_the_etags_s3_reported(self) -> None:
        store = FakeS3BlobStore([_list_parts_body({1: 700})])

        await store.commit(
            blob_id=BLOB_ID,
            upload_id=UPLOAD_ID,
            content_type="application/octet-stream",
            parts=[UploadedPart(number=1, etag='"etag-1"', size=700)],
        )

        self.assertEqual(1, len(store.completion_payloads))
        self.assertEqual(
            b"<CompleteMultipartUpload><Part><PartNumber>1</PartNumber>"
            b'<ETag>"etag-1"</ETag></Part></CompleteMultipartUpload>',
            store.completion_payloads[0],
        )


class TestS3FailuresAreNotAnswers(unittest.IsolatedAsyncioTestCase):
    """A call that failed has not told us anything.

    Each of these once produced a confident wrong answer: bytes
    reported deleted that were still stored, or a permanent
    client-facing error raised for a transient fault."""

    async def test_a_failed_abort_fails_the_delete(self) -> None:
        # Reporting the blob deleted here would be reporting bytes
        # gone that are still stored, still billable, and still
        # reachable through any presigned part URL outstanding.
        store = FakeS3BlobStore(
            [],
            abort_response=(500, b"<Error><Code>InternalError</Code></Error>"),
        )

        with self.assertRaises(RuntimeError) as caught:
            await store.delete(BLOB_ID, upload_ids=["upload-one"])

        self.assertIn("AbortMultipartUpload failed", str(caught.exception))
        self.assertFalse(store.deleted_object)

    async def test_an_abort_of_a_vanished_upload_succeeds(self) -> None:
        # Already gone is the state being asked for.
        store = FakeS3BlobStore(
            [],
            abort_response=(404, b"<Error><Code>NoSuchUpload</Code></Error>"),
        )

        await store.delete(BLOB_ID, upload_ids=["upload-one"])

        self.assertTrue(store.deleted_object)

    async def test_a_head_failure_is_not_read_as_absence(self) -> None:
        # The upload is gone, so completion asks whether the object
        # was committed. A 503 is not an answer to that, and treating
        # it as "no" would tell the client to re-upload bytes that may
        # already be committed.
        store = FakeS3BlobStore([], upload_exists=False, head_status=503)

        with self.assertRaises(RuntimeError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag="etag-1", size=700)],
            )

        self.assertIn("HeadObject failed", str(caught.exception))

    async def test_a_404_that_is_not_nosuchupload_is_not_a_vanished_upload(
        self,
    ) -> None:
        # A missing bucket answers 404 too. Reading that as a consumed
        # multipart session would report a configuration fault as a
        # permanent, client-fixable upload error.
        store = FakeS3BlobStore(
            [],
            list_parts_response=(
                404, b"<Error><Code>NoSuchBucket</Code></Error>"
            ),
        )

        with self.assertRaises(RuntimeError) as caught:
            await store.commit(
                blob_id=BLOB_ID,
                upload_id=UPLOAD_ID,
                content_type="application/octet-stream",
                parts=[UploadedPart(number=1, etag="etag-1", size=700)],
            )

        self.assertIn("ListParts failed", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
