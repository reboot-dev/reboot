import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { Queue } from "@reboot-dev/reboot-std-api/collections/queue/v1/queue_rbt.js";
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

export const QUEUE_LIBRARY_NAME = "reboot.std.collections.queue.v1.queue";

export function queueLibrary({
  authorizer,
}: {
  // Just using `Queue.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to
  // refer to the type.
  authorizer?: InstanceType<typeof Queue.Authorizer>;
} = {}): NativeLibrary {
  const authorizers: NativeLibrary["authorizers"] = {};
  if (authorizer !== undefined) {
    authorizers["authorizer"] = authorizer;
  }
  return {
    nativeLibraryModule: "reboot.std.collections.queue.v1.queue",
    nativeLibraryFunction: "queue_library",
    authorizers,
  };
}
