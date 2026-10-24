"""What the `Blob` control plane needs of the store that holds the
bytes: S3's multipart upload, seen from the control plane.

A blob is uploaded in numbered parts, each `PUT` by the client to a
URL the store mints, and finished by a commit that checks the parts
the client reports against the ones the store holds. The control
plane never touches bytes: it asks the store for URLs and hands them
to the client, and the bytes travel between the client and the store.

A store retries nothing: it lets what may pass on a later attempt
raise as it is, and raises `BlobStoreError` only for what never will.
"""

from dataclasses import dataclass
from typing import Mapping, Optional, Protocol, Sequence

# The part size a store asks clients for. Every part except the last
# must be exactly this size. At least 5 MiB, the S3 minimum part size.
DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024


class BlobStoreError(Exception):
    """A storage failure no retry can fix (e.g. a part missing at
    commit time), as opposed to a transient one (e.g. a network
    error), which a store raises as its original exception type
    instead."""


@dataclass(frozen=True)
class UploadedPart:
    """One part of an upload, as reported by the client."""
    number: int
    etag: str
    size: int


class BlobStore(Protocol):

    @property
    def part_size(self) -> int:
        """The part size clients must use; every part but the last is
        exactly this size."""
        ...

    async def create(self, blob_id: str, content_type: str) -> str:
        """Establishes the session a blob's parts are written under and
        returns its ID."""
        ...

    def part_upload_url(
        self,
        blob_id: str,
        upload_id: str,
        part_number: int,
    ) -> str:
        """A URL to `PUT` one part's bytes to: absolute, or relative to
        the application when the application forwards it."""
        ...

    async def commit(
        self,
        blob_id: str,
        upload_id: str,
        content_type: str,
        parts: Sequence[UploadedPart],
        max_size: Optional[int] = None,
    ) -> str:
        """Finishes the object from the parts the client reports,
        checking each against what was actually stored, and returns
        its ETag. Raises `BlobStoreError` for what can never succeed;
        committing an already-committed blob returns its ETag."""
        ...

    def download_url(
        self,
        blob_id: str,
        ttl_seconds: Optional[int] = None,
        response_overrides: Optional[Mapping[str, str]] = None,
    ) -> tuple[str, int]:
        """A URL to `GET` the blob's bytes from, and how long it is
        valid for. `response_overrides` are S3's `response-*` query
        parameters, which set the headers the bytes are served with."""
        ...

    async def delete(
        self,
        blob_id: str,
        upload_ids: Sequence[str] = (),
    ) -> None:
        """Removes the object's bytes and the upload sessions named.
        Idempotent: deleting an absent blob succeeds."""
        ...
