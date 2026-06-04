import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { Topic } from "@reboot-dev/reboot-std-api/pubsub/v1/pubsub_rbt.js";
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

export const PUBSUB_LIBRARY_NAME = "reboot.std.pubsub.v1.pubsub";

export function pubsubLibrary({
  authorizer,
}: {
  // Just using `Topic.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to refer
  // to the type.
  authorizer?: InstanceType<typeof Topic.Authorizer>;
} = {}): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.pubsub.v1.pubsub",
    nativeLibraryFunction: "pubsub_library",
    authorizer,
  };
}
