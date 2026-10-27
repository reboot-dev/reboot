"""`S3Bucket` against a stubbed boto3 client.

botocore's `Stubber` answers each call with a canned response, in
order, checking the parameters the call was made with, so that what
`S3Bucket` makes of S3's answers -- what it believes, what it refuses,
what it asks for next -- can be tested without an S3 at hand."""

import unittest
from botocore.exceptions import ClientError
from botocore.stub import Stubber
from rbt.std.blob.v1.blob_pb2 import CommitRefused
from reboot.std.blob.v1._s3 import S3Bucket, UploadedPart
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

BLOB_ID = "blob-one"
UPLOAD_ID = "upload-one"
BUCKET = "a-bucket"
KEY = "apps/an-application/blobs/blob-one"


def _bucket(
    *,
    public_endpoint: Optional[str] = None,
    url_prefix: Optional[str] = None,
) -> tuple[S3Bucket, Stubber]:
    """An `S3Bucket` and the stub that answers for S3 on its client,
    already active; the test queues the answers it expects to need."""
    s3 = S3Bucket(
        endpoint="http://s3.example",
        bucket=BUCKET,
        prefix="apps/an-application",
        region="us-east-1",
        access_key_id="an-access-key-id",
        secret_access_key="a-secret-access-key",
        public_endpoint=public_endpoint,
        url_prefix=url_prefix,
    )
    stubber = Stubber(s3._client)
    stubber.activate()
    return s3, stubber


def _list_parts_page(
    sizes: dict[int, int],
    next_marker: Optional[int] = None,
) -> dict[str, Any]:
    """One page of an S3 `ListParts` response."""
    page: dict[str, Any] = {
        "Parts": [
            {
                "PartNumber": number,
                "Size": size,
                "ETag": f'"etag-{number}"',
            } for number, size in sorted(sizes.items())
        ],
        "IsTruncated": next_marker is not None,
    }
    if next_marker is not None:
        page["NextPartNumberMarker"] = next_marker
    return page


def _list_parts(
    stubber: Stubber,
    *pages: dict[str, Any],
    upload_id: str = UPLOAD_ID,
) -> None:
    """Queues the pages `ListParts` answers with, each asked for by
    the marker the one before it ended on."""
    marker: Optional[int] = None
    for page in pages:
        expected: dict[str, Any] = {
            "Bucket": BUCKET,
            "Key": KEY,
            "UploadId": upload_id,
        }
        if marker is not None:
            expected["PartNumberMarker"] = marker
        stubber.add_response("list_parts", page, expected)
        marker = page.get("NextPartNumberMarker")


def _uploads_listed(stubber: Stubber, *uploads: tuple[str, str]) -> None:
    """Queues the `ListMultipartUploads` answer for the key's prefix:
    `(key, upload_id)` pairs, as the bucket lists them."""
    stubber.add_response(
        "list_multipart_uploads",
        {
            "Uploads": [
                {
                    "Key": key,
                    "UploadId": upload_id,
                } for key, upload_id in uploads
            ],
            "IsTruncated": False,
        },
        {"Bucket": BUCKET, "Prefix": KEY},
    )


def _aborted(stubber: Stubber, *upload_ids: str) -> None:
    for upload_id in upload_ids:
        stubber.add_response(
            "abort_multipart_upload",
            {},
            {"Bucket": BUCKET, "Key": KEY, "UploadId": upload_id},
        )


def _no_such_upload(stubber: Stubber, operation: str) -> None:
    stubber.add_client_error(
        operation, service_error_code="NoSuchUpload", http_status_code=404
    )


def _completion(
    stubber: Stubber,
    parts: list[int],
    etag: str = "the-object-etag",
) -> None:
    """Queues a `CompleteMultipartUpload` that expects exactly `parts`,
    named by the ETags `ListParts` reported for them, and the listing
    of the key's uploads that follows it, with nothing left to abort."""
    stubber.add_response(
        "complete_multipart_upload",
        {"ETag": f'"{etag}"'},
        {
            "Bucket": BUCKET,
            "Key": KEY,
            "UploadId": UPLOAD_ID,
            "MultipartUpload": {
                "Parts": [
                    {
                        "PartNumber": number,
                        "ETag": f'"etag-{number}"',
                    } for number in parts
                ],
            },
        },
    )
    _uploads_listed(stubber)


async def _complete(
    s3: S3Bucket,
    parts: list[UploadedPart],
    max_size: Optional[int] = None,
) -> str | CommitRefused:
    return await s3.complete_multipart_upload(
        blob_id=BLOB_ID,
        upload_id=UPLOAD_ID,
        content_type="application/octet-stream",
        parts=parts,
        max_size=max_size,
    )


class TestS3Completion(unittest.IsolatedAsyncioTestCase):
    """Completion must believe `ListParts` rather than the client.

    Parts are uploaded straight to presigned URLs, so the sizes the
    client reports are unverifiable anywhere else; `ListParts` is the
    only ground truth about what S3 holds."""

    async def test_matching_sizes_complete(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 300}))
        _completion(stubber, [1, 2])

        etag = await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        self.assertEqual("the-object-etag", etag)
        stubber.assert_no_pending_responses()

    async def test_a_part_smaller_than_reported_is_refused(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 100}))

        refused = await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("part 2 was reported as 300 bytes", refused.reason)

    async def test_a_part_larger_than_reported_is_refused(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 900}))

        refused = await _complete(
            s3, [UploadedPart(number=1, etag="etag-1", size=700)]
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("part 1 was reported as 700 bytes", refused.reason)

    async def test_a_part_that_was_never_uploaded_is_refused(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700}))

        refused = await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn(
            "part 2 was reported but never uploaded", refused.reason
        )

    async def test_sizes_are_read_across_every_page(self) -> None:
        # A part on the second page is as uploaded as one on the first.
        s3, stubber = _bucket()
        _list_parts(
            stubber,
            _list_parts_page({1: 700}, next_marker=1),
            _list_parts_page({2: 300}),
        )
        _completion(stubber, [1, 2])

        await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
        )

        stubber.assert_no_pending_responses()

    async def test_max_size_ignores_a_part_left_behind(self) -> None:
        # Part 3 is in S3 from an abandoned attempt; the client asks
        # to complete parts 1 and 2 only, and S3 discards the rest.
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 300, 3: 500}))
        _completion(stubber, [1, 2])

        await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
            max_size=1000,
        )

        stubber.assert_no_pending_responses()

    async def test_max_size_counts_the_parts_being_completed(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 300}))

        refused = await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
            max_size=999,
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("over the maximum", refused.reason)

    async def test_a_completed_upload_returns_the_committed_etag(
        self,
    ) -> None:
        # A retry after a crash finds the upload consumed and the
        # object in place: the commit succeeded, so say so.
        s3, stubber = _bucket()
        _no_such_upload(stubber, "list_parts")
        stubber.add_response(
            "head_object",
            {"ETag": '"the-object-etag"'},
            {"Bucket": BUCKET, "Key": KEY},
        )
        _uploads_listed(stubber)

        etag = await _complete(
            s3, [UploadedPart(number=1, etag="etag-1", size=700)]
        )

        self.assertEqual("the-object-etag", etag)
        stubber.assert_no_pending_responses()

    async def test_a_completion_aborts_the_strays(self) -> None:
        # An upload whose creation answered after the attempt that
        # made it died is in the bucket under this key and known to
        # nobody; completing the blob is where it is reclaimed. Another
        # blob's upload, which the prefix also matches, is left alone.
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700}))
        stubber.add_response(
            "complete_multipart_upload",
            {"ETag": '"the-object-etag"'},
            {
                "Bucket": BUCKET,
                "Key": KEY,
                "UploadId": UPLOAD_ID,
                "MultipartUpload": {
                    "Parts": [{"PartNumber": 1, "ETag": '"etag-1"'}],
                },
            },
        )
        _uploads_listed(
            stubber, (KEY, "upload-stray"), (KEY + "-other", "upload-theirs")
        )
        _aborted(stubber, "upload-stray")

        await _complete(s3, [UploadedPart(number=1, etag="etag-1", size=700)])

        stubber.assert_no_pending_responses()

    async def test_a_vanished_upload_with_no_object_is_permanent(
        self,
    ) -> None:
        # The upload expired without ever being completed: nothing
        # can bring it back, so a workflow must not keep retrying.
        s3, stubber = _bucket()
        _no_such_upload(stubber, "list_parts")
        stubber.add_client_error(
            "head_object", service_error_code="404", http_status_code=404
        )

        refused = await _complete(
            s3, [UploadedPart(number=1, etag="etag-1", size=700)]
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("expired before it was committed", refused.reason)

    async def test_max_size_allows_an_upload_that_fits(self) -> None:
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 300}))
        _completion(stubber, [1, 2])

        await _complete(
            s3,
            [
                UploadedPart(number=1, etag="etag-1", size=700),
                UploadedPart(number=2, etag="etag-2", size=300),
            ],
            max_size=1000,
        )

        stubber.assert_no_pending_responses()

    async def test_a_completion_s3_rejects_is_refused(self) -> None:
        # S3 checks the ETags itself: a part whose bytes changed since
        # `ListParts` fails the completion with `InvalidPart`, which
        # the client can repair, so it is a refusal rather than a
        # fault.
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700}))
        stubber.add_client_error(
            "complete_multipart_upload",
            service_error_code="InvalidPart",
            http_status_code=400,
        )

        refused = await _complete(
            s3, [UploadedPart(number=1, etag="etag-1", size=700)]
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("InvalidPart", refused.reason)


class TestS3Urls(unittest.TestCase):

    def test_an_explicit_zero_ttl_is_honoured(self) -> None:
        # Zero is a TTL a caller asked for, not an absent one.
        s3, _ = _bucket()

        _, ttl = s3.download_url(blob_id=BLOB_ID, ttl_seconds=0)

        self.assertEqual(0, ttl)

    def test_no_ttl_falls_back_to_the_default(self) -> None:
        s3, _ = _bucket()

        _, ttl = s3.download_url(blob_id=BLOB_ID)

        self.assertGreater(ttl, 0)

    def test_urls_are_absolute_without_a_prefix(self) -> None:
        s3, _ = _bucket()

        url, _ = s3.download_url(blob_id=BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("http", parsed.scheme)
        self.assertEqual("s3.example", parsed.netloc)
        self.assertEqual(f"/{BUCKET}/{KEY}", parsed.path)
        self.assertIn("X-Amz-Signature", parse_qs(parsed.query))

    def test_urls_name_the_public_endpoint(self) -> None:
        # The application reaches the bucket by one name and its
        # clients by another: the URLs are theirs, so they carry the
        # name they will use, and are signed for it.
        s3, _ = _bucket(public_endpoint="http://localhost:9000")

        url, _ = s3.download_url(blob_id=BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("localhost:9000", parsed.netloc)
        self.assertEqual(f"/{BUCKET}/{KEY}", parsed.path)

    def test_urls_are_relative_on_the_prefix(self) -> None:
        # With a prefix the application forwards to the bucket, a URL
        # names the application rather than the bucket: the same path
        # and query, which the forwarding sends on to the bucket as
        # signed, behind the prefix.
        s3, _ = _bucket(url_prefix="/rbt.std.blob.v1/")

        url, _ = s3.download_url(blob_id=BLOB_ID)

        parsed = urlparse(url)
        self.assertEqual("", parsed.scheme)
        self.assertEqual("", parsed.netloc)
        self.assertEqual(f"/rbt.std.blob.v1/{BUCKET}/{KEY}", parsed.path)
        self.assertIn("X-Amz-Signature", parse_qs(parsed.query))

    def test_response_overrides_are_signed(self) -> None:
        # The overrides decide how the bytes are served, so they must
        # be in the signed query: a holder of the URL can then no more
        # change them than change which bytes are served.
        s3, _ = _bucket()

        url, _ = s3.download_url(
            blob_id=BLOB_ID,
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

    def test_part_urls_name_the_part_and_upload(self) -> None:
        s3, _ = _bucket()

        url = s3.part_upload_url(
            blob_id=BLOB_ID, upload_id=UPLOAD_ID, part_number=7
        )

        query = parse_qs(urlparse(url).query)
        self.assertEqual(["7"], query["partNumber"])
        self.assertEqual([UPLOAD_ID], query["uploadId"])
        self.assertIn("X-Amz-Signature", query)


class TestS3Delete(unittest.IsolatedAsyncioTestCase):

    async def test_known_uploads_are_aborted_before_the_object(self) -> None:
        # The stub answers in order, so this also checks the order.
        s3, stubber = _bucket()
        _uploads_listed(stubber)
        _aborted(stubber, "upload-one", "upload-two")
        stubber.add_response(
            "delete_object", {}, {"Bucket": BUCKET, "Key": KEY}
        )

        await s3.delete_object(
            blob_id=BLOB_ID, upload_ids=["upload-one", "upload-two"]
        )

        stubber.assert_no_pending_responses()

    async def test_delete_aborts_the_uploads_the_bucket_lists_too(
        self,
    ) -> None:
        # The recorded upload is aborted once, however the listing
        # names it; one the control plane never recorded is aborted
        # from the listing; another blob's is left alone.
        s3, stubber = _bucket()
        _uploads_listed(
            stubber,
            (KEY, "upload-one"),
            (KEY, "upload-stray"),
            (KEY + "-other", "upload-theirs"),
        )
        _aborted(stubber, "upload-one", "upload-stray")
        stubber.add_response(
            "delete_object", {}, {"Bucket": BUCKET, "Key": KEY}
        )

        await s3.delete_object(blob_id=BLOB_ID, upload_ids=["upload-one"])

        stubber.assert_no_pending_responses()

    async def test_delete_without_uploads_only_removes_the_object(
        self,
    ) -> None:
        s3, stubber = _bucket()
        _uploads_listed(stubber)
        stubber.add_response(
            "delete_object", {}, {"Bucket": BUCKET, "Key": KEY}
        )

        await s3.delete_object(blob_id=BLOB_ID)

        stubber.assert_no_pending_responses()


class TestS3CompletionNamesWhatS3Holds(unittest.IsolatedAsyncioTestCase):
    """The completion names the parts by the ETags S3 reported, never
    by the ones the client sent."""

    async def test_a_misreported_etag_never_reaches_the_completion(
        self,
    ) -> None:
        # A client's ETag that does not match S3's is refused before
        # any completion is attempted; an unexpected call would fail
        # the stub.
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700, 2: 600}))

        refused = await _complete(
            s3,
            [UploadedPart(number=1, etag="not-etag-1", size=700)],
            max_size=1000,
        )

        assert isinstance(refused, CommitRefused)
        self.assertIn("does not match what was uploaded", refused.reason)
        stubber.assert_no_pending_responses()

    async def test_the_completion_carries_the_etags_s3_reported(
        self,
    ) -> None:
        # The client's quoting is its own; the completion is checked
        # by the stub to carry S3's ETag for the part.
        s3, stubber = _bucket()
        _list_parts(stubber, _list_parts_page({1: 700}))
        _completion(stubber, [1])

        await _complete(s3, [UploadedPart(number=1, etag='"etag-1"', size=700)])

        stubber.assert_no_pending_responses()


class TestS3FailuresAreNotAnswers(unittest.IsolatedAsyncioTestCase):
    """A call that failed has not told us anything.

    Each of these once produced a confident wrong answer: bytes
    reported deleted that were still stored, or a permanent
    client-facing error raised for a transient fault."""

    async def test_a_failed_abort_fails_the_delete(self) -> None:
        # Reporting the blob deleted here would be reporting bytes
        # gone that are still stored, still billable, and still
        # reachable through any presigned part URL outstanding. No
        # `DeleteObject` is queued: one would fail the stub.
        s3, stubber = _bucket()
        _uploads_listed(stubber)
        stubber.add_client_error(
            "abort_multipart_upload",
            service_error_code="InternalError",
            http_status_code=500,
        )

        with self.assertRaises(ClientError) as caught:
            await s3.delete_object(blob_id=BLOB_ID, upload_ids=["upload-one"])

        self.assertIn("AbortMultipartUpload", str(caught.exception))

    async def test_an_abort_of_a_vanished_upload_succeeds(self) -> None:
        # Already gone is the state being asked for.
        s3, stubber = _bucket()
        _uploads_listed(stubber)
        _no_such_upload(stubber, "abort_multipart_upload")
        stubber.add_response(
            "delete_object", {}, {"Bucket": BUCKET, "Key": KEY}
        )

        await s3.delete_object(blob_id=BLOB_ID, upload_ids=["upload-one"])

        stubber.assert_no_pending_responses()

    async def test_a_head_failure_is_not_read_as_absence(self) -> None:
        # The upload is gone, so completion asks whether the object
        # was committed. A 503 is not an answer to that, and treating
        # it as "no" would tell the client to re-upload bytes that may
        # already be committed.
        s3, stubber = _bucket()
        _no_such_upload(stubber, "list_parts")
        stubber.add_client_error(
            "head_object",
            service_error_code="ServiceUnavailable",
            http_status_code=503,
        )

        with self.assertRaises(ClientError) as caught:
            await _complete(
                s3, [UploadedPart(number=1, etag="etag-1", size=700)]
            )

        self.assertIn("HeadObject", str(caught.exception))

    async def test_a_404_that_is_not_nosuchupload_is_not_a_vanished_upload(
        self,
    ) -> None:
        # A missing bucket answers 404 too. Reading that as a consumed
        # multipart upload would report a configuration fault as a
        # permanent, client-fixable upload error.
        s3, stubber = _bucket()
        stubber.add_client_error(
            "list_parts",
            service_error_code="NoSuchBucket",
            http_status_code=404,
        )

        with self.assertRaises(ClientError) as caught:
            await _complete(
                s3, [UploadedPart(number=1, etag="etag-1", size=700)]
            )

        self.assertIn("ListParts", str(caught.exception))


class TestS3Bucket(unittest.IsolatedAsyncioTestCase):

    async def test_a_bucket_already_owned_is_the_bucket_asked_for(
        self,
    ) -> None:
        s3, stubber = _bucket()
        stubber.add_client_error(
            "create_bucket",
            service_error_code="BucketAlreadyOwnedByYou",
            http_status_code=409,
        )

        await s3.ensure_bucket()

        stubber.assert_no_pending_responses()


if __name__ == "__main__":
    unittest.main()
