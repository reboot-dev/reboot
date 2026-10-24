---
title: Store Large Binary Objects with `Blob`
impact: HIGH
impactDescription: Files and media do not belong in actor state; `Blob` keeps the bytes in a bucket and the metadata in Reboot
tags: stdlib, Blob, upload, download, file, image, video, attachment, S3, Silo
---

## Store Large Binary Objects with `Blob`

> **Critical:** actor state is protobuf, unsuited to anything beyond
> a few hundred kilobytes. A field for a file's bytes is wrong; a
> `Blob` is right. `blob_library()` registers the `Blob` servicer, and
> the library needs the `reboot[std-blob]` extra installed at the same
> version as `reboot` (it speaks S3 through boto3). By default only
> the backend creates a blob, from within its own transaction, after
> its own policy; the browser uploads into one it was given.

`reboot.std.blob.v1.blob` provides `Blob`, the control plane for one
object whose bytes never change once committed. Its state holds the
metadata (content type, size, upload progress, lifecycle, who may
upload and download) while the bytes travel directly between the
browser and an S3-compatible bucket, in parts, through URLs the blob
answers. Uploads are resumable, and sizes are enforced against the
bytes actually uploaded.

### Dependency

```toml
# pyproject.toml
dependencies = [
    "reboot==<version>",
    "reboot[std-blob]==<version>",
]
```

The browser side is `@reboot-dev/reboot-std-react` (hooks) plus
`@reboot-dev/reboot-std-api` (the generated client and types).

### Register the Library

```python
from reboot.std.blob.v1.blob import blob_library


async def main():
    await Application(
        servicers=[MyServicer],
        libraries=[blob_library()],
    ).run()
```

### Create a Blob from the Backend

By default `create` is app-internal: the backend creates the blob
from within the same transaction that records what the blob is for,
after applying whatever policy goes beyond authorization (what may be
attached, how large, how many), and returns the blob's ID to the
client. The ID is random and acts as the capability.

```python
from rbt.std.blob.v1.blob_rbt import Blob, Downloaders


async def send(self, context: TransactionContext, request: SendRequest):
    if request.size_bytes > MAX_ATTACHMENT_BYTES:
        raise ChatRoom.SendAborted(
            AttachmentTooLarge(max_size_bytes=MAX_ATTACHMENT_BYTES)
        )
    blob, _ = await Blob.create(
        context,
        content_type=request.content_type,
        # Exact size: definite progress, and enforced at commit.
        size=request.size_bytes,
        # Who may upload into it; omit to let anyone with the ID.
        uploader_id=context.auth.user_id,
        # Who may download; omit to let anyone with the ID, pass
        # (even empty) to restrict. The uploader is not implied.
        downloaders=Downloaders(user_ids=[context.auth.user_id]),
    )
    self.state.messages.append(
        Message(text=request.message, attachment_blob_id=blob.state_id)
    )
    return SendResponse(attachment_blob_id=blob.state_id)
```

`size` is the exact total in bytes; `max_size` is an upper bound for
when the total is not known up front; neither means no limit. Either
is enforced as parts are reported and again at commit.

When authorization alone is policy enough, let clients create blobs
directly by giving the library an authorizer, which replaces the
default rules for every method of `Blob` (an `AuthorizerRule` for all
of them, or a `Blob.Authorizer` with a rule per method):

```python
from reboot.aio.auth.authorizers import allow_if, has_verified_token

blob_library(authorizer=allow_if(any=[has_verified_token]))
```

### Methods

| Method            | Type   | Who                   | Notes                                                           |
| ----------------- | ------ | --------------------- | --------------------------------------------------------------- |
| `create`          | writer | application           | `content_type`, `size`/`max_size`, `uploader_id`, `downloaders` |
| `set_downloaders` | writer | application           | replaces the download allow-list                                |
| `part_upload_url` | reader | uploader              | the URL to upload one part to, once the upload exists           |
| `part_uploaded`   | writer | uploader              | reports a part's receipt (ETag) and size                        |
| `commit`          | writer | uploader              | validates the parts, schedules the completion                   |
| `restart_upload`  | writer | uploader              | schedules another upload in place of one the bucket dropped     |
| `info`            | reader | uploader, downloaders | metadata, part size and progress; reactive                      |
| `download_url`    | reader | downloaders           | `ready` false until committed, and for good once discarded      |
| `discard`         | writer | application           | deletes the bytes; leaves a `DISCARDED` tombstone               |

"Application" means an app-internal caller (`is_app_internal`);
"uploader" means `uploader_id`, or anyone who knows the ID when it was
omitted; "downloaders" likewise for `downloaders`. These are the
default rules; `blob_library(authorizer=...)` replaces them. The
browser helpers call the uploader and downloader methods for you.

### Lifecycle

`info.status` is what the bucket holds: `CREATED` (nothing yet) →
`UPLOADING` → `COMMITTED`, or `DISCARDED`. `info.transition` is what
has been asked for next, named for the status it leads to: `create`
asks for `UPLOAD`, `commit` for `COMMIT`, `discard` for `DISCARD`, and
one workflow per blob carries it out in the bucket, one step at a
time, then clears it. A commit
the bucket refuses (a part that differs from what was reported)
leaves the blob `UPLOADING` with `commit_refused` set, so the client
can upload again and commit again. A blob stays uploadable until it
is committed, and is then immutable; discarding one is the
application's call. The bucket, though, drops an upload that goes
uncompleted for long enough (a week, for the buckets Reboot runs and
provides): it then refuses every part, and a commit records
`upload_not_found` instead. `restart_upload` asks for another upload
in place of it, into which every part is uploaded again; the browser's
`upload` does that on its own, once.

### The Browser Side

```tsx
import {
  useBlobDownload,
  useBlobUpload,
} from "@reboot-dev/reboot-std-react/blob";

const { upload } = useBlobUpload();
// After the backend created the blob and returned its ID:
const { aborted } = await upload(blobId, file);
if (aborted !== undefined) {
  // The typed error of whichever `Blob` method refused:
  // `SizeMismatch`, `AlreadyCommitted`, `Discarded`, `CommitRefused`, ...
  setError(aborted.message);
}

// Showing a blob: `info` (status and progress, reactive, for any
// participant) from the first response on; `url` once committed,
// refreshed before it lapses; `aborted` instead when this user may
// not download it. A discarded blob is a status on `info`, not an
// error: `url` stays undefined for good.
const { info, url, aborted: downloadAborted } = useBlobDownload(blobId);
```

`upload` resolves `{ aborted }` like a mutation and rejects on an
interruption (a part that could not be uploaded after retries, or the
caller's `AbortSignal`); a second `upload` of the same blob resumes
from the parts it already has. See
`web-app/references/react-client.md` for the full browser recipe.

### Where the Bytes Live

`REBOOT_STD_BLOB_S3_{ENDPOINT,BUCKET,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`
name the bucket (plus an optional key prefix,
`REBOOT_STD_BLOB_S3_PREFIX`); the browser is sent to the endpoint
too, so it must be a name the browser can reach. Reboot Cloud sets
them. Under
`rbt dev run` and in tests nothing need be set: the application runs a
Silo of its own, found on the `PATH` as `silo` or named by
`REBOOT_STD_BLOB_SILO_PATH` or run from its Docker image, and reaches
it on its own origin. `rbt serve run` needs a bucket you provide.
