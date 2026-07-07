import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt.js";

// The servicers are implemented in Python (the data-plane client
// lives there); Node.js applications host them as "native" servicers.
//
// NOTE: the application-side routes that proxy bytes to a data plane
// requesting forwarded paths (such as the local filesystem one) are
// currently only registered by Python applications; Node.js
// applications need a data plane whose URLs are directly reachable by
// clients (no forwarded paths, e.g. Reboot Cloud's).
export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.blob.v1.blob",
      },
    ];
  },
};

export const BLOBS_LIBRARY_NAME = "reboot.std.blob.v1.blob";

export function blobLibrary(): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.blob.v1.blob",
    nativeLibraryFunction: "blob_library",
  };
}
