import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { OrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt.js";
export * from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt.js";

export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule:
          "reboot.std.collections.ordered_map.v1.ordered_map",
      },
    ];
  },
};

export const ORDERED_MAP_LIBRARY_NAME =
  "reboot.std.collections.ordered_map.v1.ordered_map";

export function orderedMapLibrary({
  authorizer,
}: {
  // Just using `OrderedMap.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to
  // refer to the type.
  authorizer?: InstanceType<typeof OrderedMap.Authorizer>;
} = {}): NativeLibrary {
  const authorizers: NativeLibrary["authorizers"] = {};
  if (authorizer !== undefined) {
    authorizers["authorizer"] = authorizer;
  }
  return {
    nativeLibraryModule: "reboot.std.collections.ordered_map.v1.ordered_map",
    nativeLibraryFunction: "ordered_map_library",
    authorizers,
  };
}
