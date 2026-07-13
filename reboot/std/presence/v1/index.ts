import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";
import { MousePosition } from "@reboot-dev/reboot-std-api/presence/mouse_tracker/v1/mouse_position_rbt.js";
import { Presence } from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt.js";
import { Subscriber } from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt.js";
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
  presenceAuthorizer,
  subscriberAuthorizer,
  mousePositionAuthorizer,
}: {
  // Just using `Presence.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to
  // refer to the type.
  presenceAuthorizer?: InstanceType<typeof Presence.Authorizer>;
  subscriberAuthorizer?: InstanceType<typeof Subscriber.Authorizer>;
  mousePositionAuthorizer?: InstanceType<typeof MousePosition.Authorizer>;
} = {}): NativeLibrary {
  const authorizers: NativeLibrary["authorizers"] = {};
  if (presenceAuthorizer !== undefined) {
    authorizers["presence_authorizer"] = presenceAuthorizer;
  }
  if (subscriberAuthorizer !== undefined) {
    authorizers["subscriber_authorizer"] = subscriberAuthorizer;
  }
  if (mousePositionAuthorizer !== undefined) {
    authorizers["mouse_position_authorizer"] = mousePositionAuthorizer;
  }
  return {
    nativeLibraryModule: "reboot.std.presence.v1.presence",
    nativeLibraryFunction: "presence_library",
    authorizers,
  };
}
