import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/blob/v1/blob_rbt.js";

// The servicers are implemented in Python (`S3Bucket` lives
// there); Node.js applications host them as "native" servicers.
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
