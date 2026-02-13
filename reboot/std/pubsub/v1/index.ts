import { NativeServicer } from "@reboot-dev/reboot";
export * from "@reboot-dev/reboot-std-api/pubsub/v1/pubsub_rbt.js";

export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.pubsub.v1.pubsub",
      },
    ];
  },
};
