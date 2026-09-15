import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt.js";

// The servicers are implemented in Python (the data-plane client
// lives there); Node.js applications host them as "native" servicers.
//
// NOTE: the HTTP routes that serve the filesystem data plane's bytes
// are currently only registered by Python applications; a Node.js
// application needs a data plane that serves its own URLs, named by
// `REBOOT_BLOB_DATA_PLANE_URL`.
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
