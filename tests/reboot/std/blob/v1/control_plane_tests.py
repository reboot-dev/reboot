"""The `Blob` control plane against a store held in memory.

What `blob_tests.py` exercises end to end through Envoy and MinIO,
this exercises with nothing outside the process: the store is a fake
that remembers what was `PUT` into it, so that the control plane's
own decisions -- what it records, what it refuses, what it asks the
store for and when -- can be tested without an object store at hand.
"""

import hashlib
import os
import unittest
from rbt.std.blob.v1.blob_rbt import Blob, InfoResponse
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.std.blob.v1._s3 import (
    ENVVAR_BLOB_S3_ACCESS_KEY_ID,
    ENVVAR_BLOB_S3_BUCKET,
    ENVVAR_BLOB_S3_ENDPOINT,
    ENVVAR_BLOB_S3_REGION,
    ENVVAR_BLOB_S3_SECRET_ACCESS_KEY,
)
from reboot.std.blob.v1._store import BlobStoreError, UploadedPart
from reboot.std.blob.v1.blob import BlobServicer, blob_library
from typing import Mapping, Optional, Sequence


class FakeBlobStore:
    """A `BlobStore` that keeps parts in memory, as an S3 would: by
    upload session, finished by a commit that checks the parts the
    client reports against the ones it holds."""

    def __init__(self) -> None:
        self.part_size = 4
        # Parts by `(blob_id, upload_id)`, then part number.
        self.uploads: dict[tuple[str, str], dict[int, bytes]] = {}
        # Committed objects by blob ID.
        self.objects: dict[str, bytes] = {}
        self.deleted: list[tuple[str, tuple[str, ...]]] = []
        self._next_upload = 0

    def put(self, url: str, data: bytes) -> str:
        """What a client's `PUT` to a part URL does: stores the bytes
        and answers their ETag."""
        _, blob_id, upload_id, number = url.split("/")[-4:]
        self.uploads[(blob_id, upload_id)][int(number)] = data
        return hashlib.md5(data).hexdigest()

    async def create(self, blob_id: str, content_type: str) -> str:
        self._next_upload += 1
        upload_id = f"upload-{self._next_upload}"
        self.uploads[(blob_id, upload_id)] = {}
        return upload_id

    def part_upload_url(
        self,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        return f"/fake/{blob_id}/{upload_id}/{part_number}"

    async def commit(
        self,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: Sequence[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str:
        if blob_id in self.objects:
            return hashlib.md5(self.objects[blob_id]).hexdigest()
        stored = self.uploads.get((blob_id, upload_id))
        if stored is None:
            raise BlobStoreError(f"upload '{upload_id}' no longer exists")
        for part in parts:
            data = stored.get(part.number)
            if data is None:
                raise BlobStoreError(f"part {part.number} was never uploaded")
            if len(data) != part.size:
                raise BlobStoreError(f"part {part.number} size mismatch")
            if hashlib.md5(data).hexdigest() != part.etag:
                raise BlobStoreError(f"part {part.number} ETag mismatch")
        total = sum(len(stored[part.number]) for part in parts)
        if max_size is not None and total > max_size:
            raise BlobStoreError(f"uploaded {total} bytes exceeds the maximum")
        self.objects[blob_id] = b"".join(
            stored[part.number]
            for part in sorted(parts, key=lambda part: part.number)
        )
        del self.uploads[(blob_id, upload_id)]
        return hashlib.md5(self.objects[blob_id]).hexdigest()

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
        response_overrides: Optional[Mapping[str, str]] = None,
    ) -> tuple[str, int]:
        query = "&".join(
            f"{key}={value}"
            for key, value in sorted((response_overrides or {}).items())
        )
        return f"/fake/download/{blob_id}?{query}", ttl_seconds or 3600

    async def delete(
        self,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        self.deleted.append((blob_id, tuple(upload_ids)))
        self.objects.pop(blob_id, None)
        for upload_id in upload_ids:
            self.uploads.pop((blob_id, upload_id), None)


class TestControlPlane(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # Name a store, so that the library configures one from the
        # environment rather than running a MinIO; it is then replaced
        # with the fake, which every server of the in-process harness
        # shares.
        for name, value in {
            ENVVAR_BLOB_S3_ENDPOINT: "http://store.invalid",
            ENVVAR_BLOB_S3_BUCKET: "bucket",
            ENVVAR_BLOB_S3_REGION: "us-east-1",
            ENVVAR_BLOB_S3_ACCESS_KEY_ID: "key",
            ENVVAR_BLOB_S3_SECRET_ACCESS_KEY: "secret",
        }.items():
            os.environ[name] = value

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(libraries=[blob_library()]))

        self.store = FakeBlobStore()
        BlobServicer._store = self.store

        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        BlobServicer._store = None
        await self.rbt.stop()

    async def _instructions(self, blob, part_numbers: list[int]):
        async for response, aborted in blob.reactively(
        ).get_part_upload_instructions(
            self.context,
            part_numbers=part_numbers,
        ):
            if aborted is not None:
                raise aborted
            if response.ready:
                return response
        raise AssertionError("Reacting to a blob ended without a session")

    async def _wait_until_status(self, blob, statuses) -> InfoResponse:
        async for info, aborted in blob.reactively().info(self.context):
            if aborted is not None:
                raise aborted
            if info.status in statuses:
                return info
        raise AssertionError("Reacting to a blob ended before its status did")

    async def _upload(self, blob, data: bytes) -> None:
        parts = [
            data[offset:offset + self.store.part_size]
            for offset in range(0, len(data), self.store.part_size)
        ] or [b""]
        instructions = await self._instructions(
            blob, list(range(1,
                             len(parts) + 1))
        )
        for instruction, part in zip(instructions.instructions, parts):
            etag = self.store.put(instruction.url, part)
            await blob.part_uploaded(
                self.context,
                part_number=instruction.part_number,
                etag=etag,
                size=len(part),
            )

    async def test_upload_commit_and_download(self) -> None:
        data = b"0123456789"
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            size=len(data),
        )

        await self._upload(blob, data)
        info = await blob.info(self.context)
        self.assertEqual(info.bytes_uploaded, len(data))
        self.assertEqual([part.number for part in info.parts], [1, 2, 3])

        await blob.commit(self.context)
        info = await self._wait_until_status(blob, {Blob.State.COMMITTED})
        self.assertEqual(info.etag, hashlib.md5(data).hexdigest())
        self.assertEqual(self.store.objects[blob.state_id], data)

        # The download URL is the store's, carrying how the bytes are
        # to be served: a type that cannot carry script, as declared.
        response = await blob.get_download_url(self.context)
        self.assertEqual(
            response.url,
            f"/fake/download/{blob.state_id}"
            "?response-content-type=text/plain",
        )

    async def test_a_claimed_type_that_could_script_is_downloaded(
        self,
    ) -> None:
        data = b"<html>"
        blob, _ = await Blob.create(
            self.context,
            content_type="text/html",
            size=len(data),
        )
        await self._upload(blob, data)
        await blob.commit(self.context)
        await self._wait_until_status(blob, {Blob.State.COMMITTED})

        response = await blob.get_download_url(self.context)
        self.assertIn("response-content-disposition=attachment", response.url)
        self.assertIn(
            "response-content-type=application/octet-stream", response.url
        )

    async def test_a_commit_the_store_refuses_reverts_to_uploading(
        self,
    ) -> None:
        data = b"abcd"
        blob, _ = await Blob.create(self.context, content_type="text/plain")
        instructions = await self._instructions(blob, [1])
        self.store.put(instructions.instructions[0].url, data)
        await blob.part_uploaded(
            self.context,
            part_number=1,
            etag=hashlib.md5(b"other").hexdigest(),
            size=len(data),
        )
        await blob.commit(self.context)

        info = await self._wait_until_status(blob, {Blob.State.UPLOADING})
        self.assertIn("ETag mismatch", info.commit_error)
        # The session survives for the client to repair.
        self.assertIn((blob.state_id, "upload-1"), self.store.uploads)

        await blob.part_uploaded(
            self.context,
            part_number=1,
            etag=hashlib.md5(data).hexdigest(),
            size=len(data),
        )
        await blob.commit(self.context)
        info = await self._wait_until_status(blob, {Blob.State.COMMITTED})
        self.assertFalse(info.HasField("commit_error"))

    async def test_remove_takes_the_session_with_it(self) -> None:
        blob, _ = await Blob.create(self.context, content_type="text/plain")
        await self._instructions(blob, [])

        await blob.remove(self.context)
        await self._wait_until_status(blob, {Blob.State.REMOVED})

        self.assertEqual(self.store.deleted, [(blob.state_id, ("upload-1",))])
        self.assertNotIn((blob.state_id, "upload-1"), self.store.uploads)

    async def test_part_urls_stop_at_the_ceiling(self) -> None:
        blob, _ = await Blob.create(
            self.context,
            content_type="text/plain",
            max_size=self.store.part_size + 1,
        )
        instructions = await self._instructions(blob, [1, 2, 3])
        self.assertEqual(
            [
                instruction.part_number
                for instruction in instructions.instructions
            ],
            [1, 2],
        )


if __name__ == "__main__":
    unittest.main()
