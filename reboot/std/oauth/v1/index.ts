import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/oauth/v1/oauth_rbt.js";

// The servicers are implemented in Python (they reuse the Python
// `ciphertext` library); Node.js applications host them as "native"
// servicers.
export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.oauth.v1.oauth",
      },
    ];
  },
};

// Canonical `OAuthTokenManager` state ids for the well-known services.
// Any string is a valid id, so a service without a predefined constant
// just uses its own name.
export const GOOGLE = "google.com";
export const GITHUB = "github.com";

export const OAUTH_LIBRARY_NAME = "reboot.std.oauth.v1.oauth";

export function oauthLibrary(): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.oauth.v1.oauth",
    nativeLibraryFunction: "oauth_library",
  };
}
