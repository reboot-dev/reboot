import aiohttp
import asyncio
import hashlib
import tempfile
import threading
import unittest
from rbt.std.blob.v1.blob_rbt import (
    Blob,
    Downloaders,
    IncompleteParts,
    InfoResponse,
    NotCommitted,
    SizeMismatch,
)
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.std.blob.v1._store import (
    DEFAULT_PART_SIZE_BYTES,
    BlobStoreError,
    FilesystemBlobStore,
    UploadedPart,
    _encode_blob_id,
)
from reboot.std.blob.v1.blob import blob_library
from unittest import mock

# How long the completion/`PUT` handshake waits before giving up,
# generous because it only ever elapses when the test is already
# failing.
_RACE_TIMEOUT_SECONDS = 10


class TestBlobs(unittest.IsolatedAsyncioTestCase):
    """Exercises the `Blob` control plane against the filesystem data
    plane that the `Reboot` test harness runs, through the same
    reverse-proxied byte routes an application serves under
    `rbt dev run`."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(libraries=[blob_library()]),
            local_envoy=True,
        )

        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )
        self.external_context = self.rbt.create_external_context(
            name=f"test-external-{self.id()}",
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _instructions(self, blob, part_numbers: list[int]):
        """Fetches upload instructions, waiting for the `BeginUpload`
        workflow to have provisioned the upload session."""
        while True:
            response = await blob.get_part_upload_instructions(
                self.context,
                part_numbers=part_numbers,
            )
            if response.ready:
                return response
            await asyncio.sleep(0.05)

    async def _put(self, url: str, data: bytes) -> str:
        """`PUT`s bytes to a (possibly relative) data-plane URL and
        returns the response's ETag."""
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.put(url, data=data) as response:
                if response.status != 200:
                    self.fail(
                        f"PUT failed ({response.status}): "
                        f"{await response.text()}"
                    )
                return response.headers["ETag"].strip('"')

    async def _put_returning_status(self, url: str, data: bytes) -> int:
        """`PUT`s bytes and returns the status, for the cases where a
        refusal is the expected outcome."""
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.put(url, data=data) as response:
                return response.status

    async def _upload(self, blob, data: bytes) -> None:
        """Uploads `data` in data-plane-sized parts and reports each
        part, exactly as the browser SDK does."""
        part_size = (await self._instructions(blob, [])).part_size
        parts = [
            data[offset:offset + part_size]
            for offset in range(0, len(data), part_size)
        ] or [b""]
        instructions = await self._instructions(
            blob, list(range(1,
                             len(parts) + 1))
        )
        for instruction, part in zip(instructions.instructions, parts):
            etag = await self._put(instruction.url, part)
            await blob.part_uploaded(
                self.context,
                part_number=instruction.part_number,
                etag=etag,
                size=len(part),
            )

    async def _wait_until_status(self, blob, statuses) -> InfoResponse:
        while True:
            info = await blob.info(self.context)
            if info.status in statuses:
                return info
            await asyncio.sleep(0.05)

    async def _download(self, blob) -> tuple[bytes, str]:
        """Downloads the blob's bytes via its download URL, returning
        the bytes and the response's content type."""
        url = (await blob.get_download_url(self.context)).url
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    self.fail(
                        f"GET failed ({response.status}): "
                        f"{await response.text()}"
                    )
                return await response.read(), response.content_type

    async def test_upload_and_download(self) -> None:
        # 2.5 data-plane parts, so the upload is genuinely multipart.
        data = bytes(range(256)) * (DEFAULT_PART_SIZE_BYTES * 5 // 2 // 256)

        blob, _ = await Blob.create(
            self.context,
            content_type="application/octet-stream",
            size=len(data),
        )

        await self._upload(blob, data)

        info = await blob.info(self.context)
        self.assertEqual(info.bytes_uploaded, len(data))
        self.assertEqual(info.status, Blob.State.UPLOADING)

        await blob.commit(self.context)

        info = await self._wait_until_status(blob, {Blob.State.COMMITTED})
        self.assertTrue(info.etag.endswith("-3"))

        downloaded, content_type = await self._download(blob)
        self.assertEqual(downloaded, data)
        self.assertEqual(content_type, "application/octet-stream")

    async def test_commit_validates_etags(self) -> None:
        data = b"hello, blobs!"

        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )

        instructions = await self._instructions(blob, [1])
        await self._put(instructions.instructions[0].url, data)

        # Report a bogus ETag; the commit must fail and revert the
        # blob to `UPLOADING` with `commit_error` set.
        await blob.part_uploaded(
            self.context,
            part_number=1,
            etag=hashlib.md5(b"not the data").hexdigest(),
            size=len(data),
        )
        await blob.commit(self.context)

        info = await self._wait_until_status(blob, {Blob.State.UPLOADING})
        self.assertIn("ETag mismatch", info.commit_error)

        # Re-report the correct ETag and commit again; now it must
        # succeed.
        await blob.part_uploaded(
            self.context,
            part_number=1,
            etag=hashlib.md5(data).hexdigest(),
            size=len(data),
        )
        await blob.commit(self.context)
        info = await self._wait_until_status(blob, {Blob.State.COMMITTED})
        self.assertFalse(info.HasField("commit_error"))

        downloaded, _ = await self._download(blob)
        self.assertEqual(downloaded, data)

    async def test_size_validation(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            max_size=10,
        )

        with self.assertRaises(Blob.PartUploadedAborted) as raised:
            await blob.part_uploaded(
                self.context,
                part_number=1,
                etag="0" * 32,
                size=100,
            )
        self.assertIsInstance(raised.exception.error, SizeMismatch)

        # Declared `size` must match the sum of the parts at commit
        # time.
        sized_blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            size=5,
        )
        await sized_blob.part_uploaded(
            self.context,
            part_number=1,
            etag="0" * 32,
            size=3,
        )

        # A declared `size` is its own ceiling: a part that overshoots
        # it is rejected as it is reported, rather than being stored
        # only to be refused at commit time.
        with self.assertRaises(Blob.PartUploadedAborted) as raised:
            await sized_blob.part_uploaded(
                self.context,
                part_number=2,
                etag="0" * 32,
                size=100,
            )
        self.assertIsInstance(raised.exception.error, SizeMismatch)

        with self.assertRaises(Blob.CommitAborted) as commit_raised:
            await sized_blob.commit(self.context)
        self.assertIsInstance(commit_raised.exception.error, SizeMismatch)

    async def test_commit_requires_contiguous_parts(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        await blob.part_uploaded(
            self.context,
            part_number=2,
            etag="0" * 32,
            size=1,
        )
        with self.assertRaises(Blob.CommitAborted) as raised:
            await blob.commit(self.context)
        self.assertIsInstance(raised.exception.error, IncompleteParts)

    async def test_get_download_url_requires_committed(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        with self.assertRaises(Blob.GetDownloadUrlAborted) as raised:
            await blob.get_download_url(self.context)
        self.assertIsInstance(raised.exception.error, NotCommitted)

    async def test_store_complete_enforces_max_size(self) -> None:
        # `complete()` verifies the *real* total size against
        # `max_size` independently of the control plane's own
        # (reported-size) check, as defense in depth against untruthful
        # reported sizes. A store-level test, on its own store.
        with tempfile.TemporaryDirectory() as directory:
            store = FilesystemBlobStore(directory)
            blob_id = "max-size-blob"
            upload_id = await store.begin_upload(blob_id, "text/plain")
            encoded = _encode_blob_id(blob_id)
            data = b"x" * 100
            with open(store.part_path(encoded, upload_id, 1), "wb") as f:
                f.write(data)
            part = UploadedPart(
                number=1,
                etag=hashlib.md5(data).hexdigest(),
                size=len(data),
            )
            with self.assertRaises(BlobStoreError):
                await store.complete(
                    blob_id,
                    upload_id,
                    "text/plain",
                    [part],
                    max_size=50,
                )
            # Within the bound, it succeeds.
            etag = await store.complete(
                blob_id,
                upload_id,
                "text/plain",
                [part],
                max_size=1000,
            )
            self.assertTrue(etag.endswith("-1"))

    async def test_a_part_put_cannot_land_inside_completion(
        self,
    ) -> None:
        # The race the blob's lock exists to close, driven to the
        # exact interleaving rather than raced for: completion is
        # paused after it has read the parts and computed their ETag
        # but before it records either, and a part `PUT` on a
        # still-valid signed URL is issued into that window.
        #
        # `_write_meta` runs on a worker thread (completion's body
        # goes through `asyncio.to_thread`), so the handshake is
        # `threading.Event`, not `asyncio.Event`: the thread cannot
        # await one, and setting one from off the loop is not safe.
        data = b"original bytes"
        replacement = b"REPLACED bytes"
        self.assertEqual(len(data), len(replacement))

        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            size=len(data),
        )
        instructions = await self._instructions(blob, [1])
        url = instructions.instructions[0].url
        etag = await self._put(url, data)
        await blob.part_uploaded(
            self.context,
            part_number=1,
            etag=etag,
            size=len(data),
        )

        reached_recording = threading.Event()
        may_record = threading.Event()
        write_meta = FilesystemBlobStore._write_meta

        def paused_write_meta(self, encoded_blob_id: str, meta) -> None:
            # Only completion records a committed blob; `begin_upload`
            # writes metadata too, and must not be paused.
            if meta.get("committed", False):
                reached_recording.set()
                may_record.wait(timeout=_RACE_TIMEOUT_SECONDS)
            write_meta(self, encoded_blob_id, meta)

        with mock.patch.object(
            FilesystemBlobStore,
            "_write_meta",
            paused_write_meta,
        ):
            await blob.commit(self.context)
            self.assertTrue(
                await asyncio.to_thread(
                    reached_recording.wait,
                    _RACE_TIMEOUT_SECONDS,
                ),
                "completion never reached the point where it records "
                "what it read",
            )

            # Deliberately not awaited yet: while completion holds the
            # blob's lock this `PUT` cannot finish, so awaiting it
            # before releasing completion would deadlock the test
            # rather than test anything.
            overwrite = asyncio.ensure_future(
                self._put_returning_status(url, replacement)
            )
            # Long enough for the `PUT` to reach the lock and block on
            # it -- or, unlocked, to publish its bytes and return.
            await asyncio.sleep(0.5)
            may_record.set()

        # Bounded: a `PUT` that did land inside completion leaves the
        # bytes disagreeing with the ETag completion computed, the
        # commit fails its own digest check, and the blob never
        # commits. Without a bound that is a test that hangs instead
        # of a test that reports what broke.
        try:
            await asyncio.wait_for(
                self._wait_until_status(blob, {Blob.State.COMMITTED}),
                timeout=_RACE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            self.fail(
                "the blob never committed: a part `PUT` published "
                "bytes inside completion, so the ETag completion "
                "computed no longer described them"
            )
        status = await overwrite

        # Serialized behind completion, the `PUT` finds the blob
        # committed and refuses rather than publishing.
        self.assertEqual(409, status)

        # The bytes served are the bytes completion actually read, so
        # they still match the ETag and length it recorded.
        downloaded, _ = await self._download(blob)
        self.assertEqual(data, downloaded)

    async def test_html_blob_is_not_served_as_html(self) -> None:
        # A blob's content type is whatever its uploader claimed,
        # and the bytes come back on the application's own origin.
        # Served as `text/html` they would be a same-origin
        # document with the reader's session, so they are served as
        # an opaque download instead. `nosniff` does not cover this:
        # nothing needs sniffing when the declared type is already
        # the dangerous one.
        data = b"<script>alert(document.domain)</script>"

        blob, _ = await Blob.create(
            self.context,
            content_type="text/html",
            size=len(data),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        url = (await blob.get_download_url(self.context)).url
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.get(url) as response:
                self.assertEqual(200, response.status)
                body = await response.read()
                self.assertEqual(
                    "application/octet-stream",
                    response.content_type,
                )
                self.assertEqual(
                    "attachment",
                    response.headers.get("Content-Disposition"),
                )
                self.assertEqual(
                    "nosniff",
                    response.headers.get("X-Content-Type-Options"),
                )

        # The bytes themselves are untouched; only how they are
        # labelled changes.
        self.assertEqual(data, body)

    async def test_renderable_blob_keeps_its_content_type(self) -> None:
        # The coercion is narrow: a type that cannot carry script
        # still renders inline, or every image attachment would
        # download instead of showing.
        data = b"\x89PNG\r\n\x1a\n"

        blob, _ = await Blob.create(
            self.context,
            content_type="image/png",
            size=len(data),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        url = (await blob.get_download_url(self.context)).url
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.get(url) as response:
                self.assertEqual("image/png", response.content_type)
                self.assertIsNone(response.headers.get("Content-Disposition"))

    async def test_malformed_signed_url_params_are_refused(
        self,
    ) -> None:
        # Both parameters of a signed URL are attacker-chosen, and
        # both are read before anything has been verified, so neither
        # may be able to raise: a non-ASCII `sig` is rejected by
        # `hmac.compare_digest`, and an `exp` like superscript two
        # satisfies `str.isdigit()` but not `int()`. Either one
        # unhandled turns an unauthenticated request into a 500.
        data = b"signed url bytes"
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            size=len(data),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})
        url = (await blob.get_download_url(self.context)).url
        path = url.split("?")[0]

        for query in (
            # Non-ASCII signature.
            "exp=99999999999&sig=%C3%A9",
            # `isdigit()` accepts this; `int()` does not.
            "exp=%C2%B2&sig=whatever",
            # All ASCII digits, but longer than `int()` will parse:
            # it refuses beyond `sys.get_int_max_str_digits()`.
            f"exp={'9' * 4301}&sig=whatever",
            # Nothing at all.
            "",
        ):
            async with aiohttp.ClientSession(self.rbt.url()) as session:
                async with session.get(f"{path}?{query}") as response:
                    self.assertLess(
                        response.status,
                        500,
                        f"query {query!r} produced a server error",
                    )
                    self.assertNotEqual(200, response.status)

    async def test_content_type_parameters_are_not_served_back(
        self,
    ) -> None:
        # A declared content type is matched against the allow-list
        # by its type alone, so whatever follows the first `;` is
        # never inspected -- and it would otherwise go into a
        # response header verbatim. Starlette does not validate
        # header values, so that is a header the uploader writes.
        data = b"\x89PNG\r\n\x1a\n"

        blob, _ = await Blob.create(
            self.context,
            content_type="image/png; charset=utf-7",
            size=len(data),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        url = (await blob.get_download_url(self.context)).url
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.get(url) as response:
                header = response.headers["Content-Type"]
                self.assertEqual("image/png", header)
                self.assertNotIn("utf-7", header)

    async def test_commit_rejects_zero_parts(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        with self.assertRaises(Blob.CommitAborted) as raised:
            await blob.commit(self.context)
        self.assertIsInstance(raised.exception.error, IncompleteParts)

    async def test_part_uploaded_rejects_bad_input(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        # Part number 0 (e.g. an omitted proto field) is rejected.
        with self.assertRaises(Blob.PartUploadedAborted):
            await blob.part_uploaded(
                self.context,
                part_number=0,
                etag="0" * 32,
                size=1,
            )
        # A non-MD5-hex ETag is rejected (it would corrupt the S3
        # completion XML).
        with self.assertRaises(Blob.PartUploadedAborted):
            await blob.part_uploaded(
                self.context,
                part_number=1,
                etag='"><injected/>',
                size=1,
            )

    async def test_uploader_gating(self) -> None:
        # A blob with an uploader: external callers that are not the
        # uploader may read `Info` but not upload. (This application
        # has no token verifier, so the external context has no user
        # at all.)
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            uploader_id="alice",
        )

        info = await Blob.ref(blob.state_id).info(self.external_context)
        self.assertEqual(info.uploader_id, "alice")

        # A non-uploader (here: an unauthenticated external caller) is
        # denied upload-side calls. Authorization denials surface as
        # the method's `Aborted` type.
        with self.assertRaises(Blob.PartUploadedAborted):
            await Blob.ref(blob.state_id).part_uploaded(
                self.external_context,
                part_number=1,
                etag="0" * 32,
                size=1,
            )

        # A blob without an uploader: anyone who knows the id may
        # upload. Use a fresh external context: after the denied
        # mutation above, the previous context considers the outcome
        # of its last mutation uncertain and refuses further
        # non-idempotent mutations.
        open_blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        open_context = self.rbt.create_external_context(
            name=f"test-open-{self.id()}",
        )
        await Blob.ref(open_blob.state_id).part_uploaded(
            open_context,
            part_number=1,
            etag="0" * 32,
            size=1,
        )

    async def test_download_gating(self) -> None:
        data = b"secret bytes"

        # A blob with a download allow-list: only listed users may get
        # a download URL. This application has no token verifier, so
        # the external context has no user and is not on any list.
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            downloader_ids=Downloaders(user_ids=["bob"]),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        # The app-internal caller may always download.
        downloaded, _ = await self._download(blob)
        self.assertEqual(downloaded, data)

        # A caller not on the allow-list is denied.
        with self.assertRaises(Blob.GetDownloadUrlAborted):
            await Blob.ref(blob.state_id
                          ).get_download_url(self.external_context)

        # A blob with no allow-list: anyone who knows the id may get a
        # download URL.
        open_blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        await self._upload(open_blob, data)
        await open_blob.commit(self.context)
        await self._wait_until_status(open_blob, {Blob.State.COMMITTED})

        response = await Blob.ref(open_blob.state_id
                                 ).get_download_url(self.external_context)
        self.assertNotEqual(response.url, "")

    async def test_set_downloaders(self) -> None:
        data = b"mutable acl"

        # Start open: anyone who knows the id may download.
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        response = await Blob.ref(blob.state_id
                                 ).get_download_url(self.external_context)
        self.assertNotEqual(response.url, "")

        # Restrict downloads to a user the external caller is not.
        await blob.set_downloaders(
            self.context,
            downloader_ids=Downloaders(user_ids=["bob"]),
        )
        with self.assertRaises(Blob.GetDownloadUrlAborted):
            await Blob.ref(blob.state_id
                          ).get_download_url(self.external_context)

        # Remove the restriction again by omitting `downloader_ids`.
        await blob.set_downloaders(self.context)
        response = await Blob.ref(blob.state_id
                                 ).get_download_url(self.external_context)
        self.assertNotEqual(response.url, "")

    async def test_info_gating(self) -> None:
        # `Info` is visible to anyone who may upload or download the
        # blob. With both sides restricted, an unauthenticated external
        # caller (this app has no token verifier) can do neither, so it
        # cannot read `Info` either.
        locked, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            uploader_id="alice",
            downloader_ids=Downloaders(user_ids=["bob"]),
        )
        with self.assertRaises(Blob.InfoAborted):
            await Blob.ref(locked.state_id).info(self.external_context)

        # Open upload side (empty `uploader_id`): anyone who may upload
        # may also watch progress via `Info`, even behind a download
        # allow-list.
        upload_open, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            downloader_ids=Downloaders(user_ids=["bob"]),
        )
        info = await Blob.ref(upload_open.state_id).info(self.external_context)
        self.assertEqual(info.status, Blob.State.UPLOADING)

        # Open download side (omitted `downloader_ids`): anyone who may
        # download may read `Info`, even with a specific uploader.
        download_open, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            uploader_id="alice",
        )
        info = await Blob.ref(download_open.state_id
                             ).info(self.external_context)
        self.assertEqual(info.status, Blob.State.UPLOADING)

    async def test_delete(self) -> None:
        data = b"delete me"

        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        url = (await blob.get_download_url(self.context)).url

        await blob.remove(self.context)
        info = await self._wait_until_status(blob, {Blob.State.REMOVED})
        self.assertEqual(info.status, Blob.State.REMOVED)

        # The bytes must be gone from the data plane.
        async with aiohttp.ClientSession(self.rbt.url()) as session:
            async with session.get(url) as response:
                self.assertEqual(response.status, 404)


if __name__ == "__main__":
    unittest.main()
