import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { Presence } from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt.js";
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

export const PRESENCE_LIBRARY_NAME = "reboot.std.presence.v1.presence";

export function presenceLibrary({
  authorizer,
}: {
  // Just using `Presence.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to
  // refer to the type.
  authorizer?: InstanceType<typeof Presence.Authorizer>;
} = {}): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.presence.v1.presence",
    nativeLibraryFunction: "presence_library",
    authorizer,
  };
}
