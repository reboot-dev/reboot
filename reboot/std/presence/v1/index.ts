import { Authorizer, NativeLibrary } from "@reboot-dev/reboot";
export * from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt.js";

export const PRESENCE_LIBRARY_NAME = "reboot.std.presence.v1.presence";

// The presence servicers: `Presence`, `Subscriber` and `MousePosition`.
// `authorizer` applies to every method of all three; without one the
// library admits the application itself or a caller with a verified
// token.
export function presenceLibrary({
  authorizer,
}: {
  authorizer?: Authorizer<unknown, unknown>;
} = {}): NativeLibrary {
  return {
    nativeLibraryModule: PRESENCE_LIBRARY_NAME,
    nativeLibraryFunction: "presence_library",
    authorizer,
  };
}
