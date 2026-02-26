import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { SortedMap } from "@reboot-dev/reboot-std-api/collections/v1/sorted_map_rbt.js";
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

export function sortedMapLibrary({
  authorizer,
}: {
  // Just using `SortedMap.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to refer
  // to the type.
  authorizer?: InstanceType<typeof SortedMap.Authorizer>;
} = {}): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.collections.v1.sorted_map",
    nativeLibraryFunction: "sorted_map_library",
    authorizer,
  };
}
