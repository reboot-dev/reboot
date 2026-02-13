import { NativeServicer } from "@reboot-dev/reboot";
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
