import {
  AuthorizerRule,
  NativeLibrary,
  NativeServicer,
  assert,
} from "@reboot-dev/reboot";
import {
  MousePosition,
  MousePositionRequestTypes,
} from "@reboot-dev/reboot-std-api/presence/mouse_tracker/v1/mouse_position_rbt.js";
import {
  Subscriber,
  SubscriberRequestTypes,
} from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt.js";
import {
  Presence,
  PresenceRequestTypes,
} from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt.js";
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
  authorizer,
}: {
  // Just using `Presence.Authorizer` results in ts(2749), "refers to a value,
  // but is being used as a type." `InstanceType<typeof ...>` allows us to
  // refer to the type.
  presenceAuthorizer?:
    | InstanceType<typeof Presence.Authorizer>
    | AuthorizerRule<Presence.State, PresenceRequestTypes>;
  subscriberAuthorizer?:
    | InstanceType<typeof Subscriber.Authorizer>
    | AuthorizerRule<Subscriber.State, SubscriberRequestTypes>;
  mousePositionAuthorizer?:
    | InstanceType<typeof MousePosition.Authorizer>
    | AuthorizerRule<MousePosition.State, MousePositionRequestTypes>;
  authorizer?: AuthorizerRule<any, any>;
} = {}): NativeLibrary {
  const authorizers: NativeLibrary["authorizers"] = {};
  if (authorizer !== undefined) {
    assert(
      presenceAuthorizer === undefined &&
        subscriberAuthorizer === undefined &&
        mousePositionAuthorizer == undefined,
      "If an AuthorizerRule is supplied, it will be applied to all " +
        "three servicers. To specify a specific authorizers for each " +
        "servicer, please use pass in `presenceAuthorizer`, " +
        "`subscriberAuthorizer` and `mousePositionAuthorizer`."
    );
  }
  if (presenceAuthorizer !== undefined) {
    authorizers["presence_authorizer"] =
      presenceAuthorizer instanceof AuthorizerRule
        ? new Presence.Authorizer({ _default: presenceAuthorizer })
        : presenceAuthorizer;
  }
  if (subscriberAuthorizer !== undefined) {
    authorizers["subscriber_authorizer"] =
      subscriberAuthorizer instanceof AuthorizerRule
        ? new Subscriber.Authorizer({ _default: subscriberAuthorizer })
        : subscriberAuthorizer;
  }
  if (mousePositionAuthorizer !== undefined) {
    authorizers["mouse_position_authorizer"] =
      mousePositionAuthorizer instanceof AuthorizerRule
        ? new MousePosition.Authorizer({ _default: mousePositionAuthorizer })
        : mousePositionAuthorizer;
  }
  return {
    nativeLibraryModule: "reboot.std.presence.v1.presence",
    nativeLibraryFunction: "presence_library",
    authorizers,
  };
}
