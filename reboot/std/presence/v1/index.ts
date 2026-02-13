import { NativeServicer } from "@reboot-dev/reboot";
export * from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt.js";

export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.presence.v1.presence",
      },
    ];
  },
};
