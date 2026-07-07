import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/blobs/v1/blobs_rbt.js";

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
        nativeServicerModule: "reboot.std.blobs.v1.blobs",
      },
    ];
  },
};

export const BLOBS_LIBRARY_NAME = "reboot.std.blobs.v1.blobs";

export function blobsLibrary(): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.blobs.v1.blobs",
    nativeLibraryFunction: "blobs_library",
  };
}
