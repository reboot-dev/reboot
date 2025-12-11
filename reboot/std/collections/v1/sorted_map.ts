import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
export * from "@reboot-dev/reboot-std-api/collections/v1/sorted_map_rbt.js";

export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.collections.v1.sorted_map",
      },
    ];
  },
};

export const SORTED_MAP_LIBRARY_NAME = "reboot.std.collections.v1.sorted_map";

export function sortedMapLibrary(): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.collections.v1.sorted_map",
    nativeLibraryFunction: "sorted_map_library",
  };
}
