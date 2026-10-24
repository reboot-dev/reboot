// Browser-side helpers for `reboot.std.blob`: a dead-simple hook for
// uploading a `File` into a `Blob` the application backend has
// created, plus the lower-level `BlobUploader` for bytes that come
// from somewhere other than a file input, and a hook that shows a
// blob: its progress while uploading, its bytes once committed.
//
// The control-plane calls go through the generated browser client,
// which brings retry, reconnection and authentication with it; only
// the bytes are handled here directly, sent to the URLs the control
// plane answers (relative to the application for a storage it forwards
// to, presigned URLs of the storage otherwise — the uploader neither
// knows nor cares which). Those requests are not Reboot RPCs, so they
// are a plain `fetch`, with retries of their own in the storage's
// uploader: `S3BlobUploader`, in `s3.ts`, the one there is.

import { useRebootClient } from "@reboot-dev/reboot-react";
import { InfoResponse } from "@reboot-dev/reboot-std-api/blob/v1/blob_pb.js";
import { useBlob } from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_react.js";
import {
  BlobDownloadUrlAborted,
  BlobInfoAborted,
} from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt_web.js";
import { useEffect, useMemo, useState } from "react";
import { S3BlobUploader } from "./s3.js";
import {
  BlobUploadAborted,
  BlobUploader,
  Receipt,
  UploadOptions,
} from "./uploader.js";

// Re-exported so applications can reactively render blob metadata
// (e.g. a progress bar for an attachment some *other* client is
// uploading) without a separate import of the generated client.
export { useBlob };

// The uploader, for bytes that come from somewhere other than a file
// input: the abstract protocol and the one storage it is implemented
// for.
export { BlobUploader, S3BlobUploader };
export type { BlobUploadAborted, Receipt, UploadOptions };

// How long `useBlobDownload` asks its URL to stay valid for. The
// S3 caps what it grants; the granted value comes back on the
// response, and the hook asks for a new URL before it lapses.
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * The dead-simple upload hook. The blob ID comes from an
 * application-level RPC (blob creation is application-mediated), and
 * then:
 *
 *     const { upload } = useBlobUpload();
 *     ...
 *     const { aborted } = await upload(blobId, file);
 *
 * Like a Reboot React mutation, `upload` resolves `{ aborted }` when
 * the backend refuses, and `aborted` is the `Aborted` of whichever
 * `Blob` method refused: `error` on it is that method's declared
 * error, and `message` says what happened. The refusals another
 * `upload` would only repeat are bytes that do not add up to the
 * `size` the blob was created with (`SizeMismatch`), a blob that is
 * no longer uploading because its commit has begun
 * (`AlreadyCommitted`) or it was discarded (`Discarded`), and the
 * bucket's verdict on the commit
 * (`CommitRefused`, from the blob's workflow): what was uploaded cannot
 * commit as reported. After that last one the blob is back to
 * uploading, but `upload` cannot repair it, since it skips every part
 * the blob already has and the verdict does not say which part is at
 * fault; upload again into a new blob. An upload the bucket has
 * dropped, for going uncompleted too long (`UploadNotFound`), is
 * restarted and uploaded again from its first part by `upload`
 * itself, once. A rejection is
 * an interruption: a part that could not be uploaded even after
 * retries, or the caller's own abort. After an interruption the parts
 * that did upload are kept, so calling `upload` again for the same
 * blob resumes rather than restarts. Once a blob's commit has begun,
 * its outcome is read from `useBlob` rather than from `upload`.
 */
export function useBlobUpload(): {
  upload: (
    blobId: string,
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ) => Promise<{ aborted?: BlobUploadAborted }>;
} {
  const client = useRebootClient();
  const upload = useMemo(() => {
    return async (
      blobId: string,
      data: globalThis.Blob | Uint8Array,
      options?: UploadOptions
    ) => {
      const uploader = new S3BlobUploader({
        url: client.url,
        blobId,
        bearerToken: client.bearerToken,
      });
      return await uploader.upload(data, options);
    };
  }, [client.url, client.bearerToken]);
  return { upload };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Everything a component that shows a blob needs, kept current for as
 * long as the component is mounted: `info` (status, upload progress,
 * content type) from the first response on; `url`, from which the
 * bytes can be downloaded (e.g. for an `<img src>`), once the blob
 * has committed, asked for anew before it lapses; and `aborted` when
 * this caller may not download the blob (its download allow-list) or
 * read it at all. Exactly one of `url` and `aborted` is ever set;
 * both are `undefined` while the blob is still uploading, which is
 * when `info` has the progress to render, and for good once it never
 * will be: a discarded blob is a status `info` reports, not an error.
 */
export function useBlobDownload(blobId: string):
  | { info: InfoResponse | undefined; url: string; aborted: undefined }
  | {
      info: InfoResponse | undefined;
      url: undefined;
      aborted: BlobInfoAborted | BlobDownloadUrlAborted;
    }
  | { info: InfoResponse | undefined; url: undefined; aborted: undefined } {
  const client = useRebootClient();
  const blob = useBlob({ id: blobId });
  const { response: info, aborted: infoAborted } = blob.useInfo();
  // One reactive read does the waiting for the URL: `DownloadUrl`
  // answers `ready: false` until the blob commits, so the read stays
  // subscribed and is pushed the URL the moment it does, and aborts
  // only when there will never be one. A reactive read is re-issued
  // when its request changes and not otherwise, so a fresh URL
  // before the last one lapses (S3 caps how long it signs for, and an
  // `<img>` re-rendered after that would 403) is asked for with a
  // later `requestedAt`. Sent to the second, so that components
  // asking within the same second share the read, and the URL.
  const [requestedAtSeconds, setRequestedAtSeconds] = useState(nowSeconds);
  const { response: download, aborted: downloadAborted } = blob.useDownloadUrl({
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    requestedAt: { seconds: BigInt(requestedAtSeconds) },
  });

  useEffect(() => {
    if (download?.ready !== true || download.ttlSeconds === undefined) {
      return;
    }
    const timer = setTimeout(
      () => setRequestedAtSeconds(nowSeconds()),
      (download.ttlSeconds * 1000 * 9) / 10
    );
    return () => clearTimeout(timer);
  }, [download]);

  // Exactly one of the two, or neither: an `aborted` is final, so a
  // URL from before it is not returned beside it.
  const aborted = downloadAborted ?? infoAborted;
  if (aborted !== undefined) {
    return { info, url: undefined, aborted };
  }
  if (download?.ready === true && download.urlReference !== undefined) {
    return {
      info,
      url: new URL(download.urlReference, client.url).toString(),
      aborted: undefined,
    };
  }
  return { info, url: undefined, aborted: undefined };
}
