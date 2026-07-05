// Browser-side helpers for `reboot.std.blobs`: a dead-simple hook for
// uploading a `File` into a `Blob` the application backend has
// created, plus the lower-level `BlobUploader` for bytes that come
// from somewhere other than a file input.
//
// The control-plane calls (`UploadInstructions`, `PartUploaded`,
// `Commit`, `Info`, `DownloadUrl`) go over the ordinary Reboot HTTP
// RPC path; the bytes themselves are `PUT` directly to the URLs the
// control plane mints (the application's own data plane for the
// `filesystem` store, presigned S3 URLs for the `s3` store — the
// uploader neither knows nor cares which).

import { stateIdToRef } from "@reboot-dev/reboot-api";
import { useRebootClient } from "@reboot-dev/reboot-react";
import { useEffect, useMemo, useState } from "react";

// Re-exported so applications can reactively render blob metadata
// (e.g. a progress bar for an attachment some *other* client is
// uploading) without a separate import of the generated client.
export { useBlob } from "@reboot-dev/reboot-std-api/blobs/v1/blobs_rbt_react.js";

const STATE_TYPE = "rbt.std.blobs.v1.Blob";
const METHODS_SERVICE = "rbt.std.blobs.v1.BlobMethods";

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  etag?: string;
  error?: string;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callBlobMethod(
  options: { url: string; blobId: string; bearerToken?: string },
  method: string,
  request: object
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.bearerToken !== undefined) {
    headers["Authorization"] = `Bearer ${options.bearerToken}`;
  }
  const response = await fetch(
    `${options.url}/__/reboot/rpc/${stateIdToRef(
      STATE_TYPE,
      options.blobId
    )}/` + `${METHODS_SERVICE}/${method}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Blob.${method} failed (${response.status}): ` +
        `${await response.text()}`
    );
  }
  return await response.json();
}

/**
 * Uploads bytes into a `Blob` that the application backend has
 * created (blob creation is always application-mediated; ask your
 * backend for a blob id first).
 *
 * Use `upload(...)` for a `File`/`Blob`/`Uint8Array` you already
 * have, or `putPart(...)`/`commit()` directly when producing bytes
 * incrementally from some other source. Attaching an uploader to a
 * partially-uploaded blob resumes it: already-confirmed parts are
 * skipped.
 */
export class BlobUploader {
  private options: { url: string; blobId: string; bearerToken?: string };
  private confirmed: Map<number, number> = new Map();

  constructor(options: { url: string; blobId: string; bearerToken?: string }) {
    this.options = options;
  }

  private async call(method: string, request: object): Promise<any> {
    return await callBlobMethod(this.options, method, request);
  }

  /**
   * Fetches upload instructions for the given part numbers, waiting
   * for the blob's upload session to be provisioned.
   */
  async instructions(
    partNumbers: number[],
    options?: { signal?: AbortSignal }
  ): Promise<{ partSize: number; urls: Map<number, string> }> {
    while (true) {
      options?.signal?.throwIfAborted();
      const response = await this.call("UploadInstructions", {
        partNumbers,
      });
      if (response.ready) {
        const urls = new Map<number, string>();
        for (const instruction of response.instructions ?? []) {
          urls.set(
            instruction.partNumber,
            new URL(instruction.url, this.options.url).toString()
          );
        }
        return { partSize: Number(response.partSize), urls };
      }
      await sleep(100);
    }
  }

  /**
   * `PUT`s one part's bytes to the data plane and reports it to the
   * control plane. Idempotent per part number.
   */
  async putPart(
    partNumber: number,
    bytes: globalThis.Blob | Uint8Array,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    const { urls } = await this.instructions([partNumber], options);
    const url = urls.get(partNumber);
    if (url === undefined) {
      throw new Error(`No upload URL for part ${partNumber}`);
    }
    const response = await fetch(url, {
      method: "PUT",
      body: bytes,
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Part ${partNumber} upload failed (${response.status}): ` +
          `${await response.text()}`
      );
    }
    const etag = (response.headers.get("ETag") ?? "").replace(/"/g, "");
    if (etag === "") {
      throw new Error(
        `Part ${partNumber} upload returned no ETag; if this ` +
          "application uses an S3-compatible store, its bucket CORS " +
          "configuration must expose the `ETag` header"
      );
    }
    const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
    await this.call("PartUploaded", {
      partNumber,
      etag,
      size,
    });
    this.confirmed.set(partNumber, size);
  }

  /**
   * Commits the upload and waits for the storage backend to confirm,
   * returning the blob's ETag or the reason the commit failed. The
   * failure reason describes what went wrong but does not identify
   * which parts, if any, were at fault; to retry, re-`putPart` (parts
   * are safe to re-upload) and call `commit` again.
   */
  async commit(options?: { signal?: AbortSignal }): Promise<UploadResult> {
    await this.call("Commit", {});
    while (true) {
      options?.signal?.throwIfAborted();
      const info = await this.call("Info", {});
      if (info.status === "COMMITTED") {
        return { etag: info.etag };
      }
      if (info.commitError !== undefined && info.commitError !== "") {
        return { error: info.commitError };
      }
      await sleep(100);
    }
  }

  /**
   * Uploads `data` in parts and commits: the whole story for bytes
   * you already have. Resumes where a previous attempt left off.
   */
  async upload(
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ): Promise<UploadResult> {
    // Refresh what the control plane already has, so interrupted
    // uploads resume rather than restart.
    const info = await this.call("Info", {});
    this.confirmed = new Map(
      (info.parts ?? []).map(
        (part: { number: number; size: string | number }) => [
          part.number,
          Number(part.size),
        ]
      )
    );

    const { partSize } = await this.instructions([], options);
    const totalBytes = data instanceof Uint8Array ? data.byteLength : data.size;
    const partCount = Math.max(1, Math.ceil(totalBytes / partSize));

    let uploadedBytes = 0;
    for (const [, size] of this.confirmed) {
      uploadedBytes += size;
    }

    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      if (this.confirmed.has(partNumber)) {
        continue;
      }
      const offset = (partNumber - 1) * partSize;
      const bytes = data.slice(offset, Math.min(offset + partSize, totalBytes));
      await this.putPart(partNumber, bytes, options);
      uploadedBytes +=
        bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
      options?.onProgress?.({ uploadedBytes, totalBytes });
    }

    return await this.commit(options);
  }
}

/**
 * The dead-simple upload hook. The blob id comes from an
 * application-level RPC (blob creation is application-mediated), and
 * then:
 *
 *     const { upload } = useBlobUpload();
 *     ...
 *     const { etag, error } = await upload(blobId, file);
 */
export function useBlobUpload(): {
  upload: (
    blobId: string,
    data: globalThis.Blob | Uint8Array,
    options?: UploadOptions
  ) => Promise<UploadResult>;
} {
  const client = useRebootClient();
  const upload = useMemo(() => {
    return async (
      blobId: string,
      data: globalThis.Blob | Uint8Array,
      options?: UploadOptions
    ) => {
      const uploader = new BlobUploader({
        url: client.url,
        blobId,
        bearerToken: client.bearerToken,
      });
      return await uploader.upload(data, options);
    };
  }, [client.url, client.bearerToken]);
  return { upload };
}

/**
 * Resolves to a URL from which a committed blob's bytes can be
 * downloaded (e.g. for an `<img src>`), or `undefined` while the blob
 * is still uploading. Polls until the blob commits; render upload
 * progress meanwhile via `useBlob(...).useInfo()`.
 */
export function useBlobDownloadUrl(blobId: string): string | undefined {
  const client = useRebootClient();
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let unmounted = false;
    const options = {
      url: client.url,
      blobId,
      bearerToken: client.bearerToken,
    };
    (async () => {
      while (!unmounted) {
        const info = await callBlobMethod(options, "Info", {});
        if (info.status === "COMMITTED") {
          const response = await callBlobMethod(options, "DownloadUrl", {});
          if (!unmounted) {
            setUrl(new URL(response.url, client.url).toString());
          }
          return;
        }
        if (info.status === "DELETING" || info.status === "DELETED") {
          return;
        }
        await sleep(500);
      }
    })().catch((error) => {
      console.error(`[Reboot] Failed to resolve blob URL: ${error}`);
    });
    return () => {
      unmounted = true;
    };
  }, [blobId, client.url, client.bearerToken]);

  return url;
}
