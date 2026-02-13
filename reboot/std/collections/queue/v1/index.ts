import { NativeServicer } from "@reboot-dev/reboot";
export * from "@reboot-dev/reboot-std-api/collections/queue/v1/queue_rbt.js";

export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.collections.queue.v1.queue",
      },
    ];
  },
};
