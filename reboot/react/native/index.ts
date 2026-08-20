// Native sign-in for `RebootClientProvider`.
//
// A React Native app can't use Reboot's browser sign-in flow: there is
// no `window.location` to redirect and no cookie jar shared with the
// backend. The same Reboot OAuth server also speaks the standard
// OAuth 2.1 authorization-code flow that native apps use — dynamic
// client registration (RFC 7591) plus PKCE (RFC 7636) — and mints
// exactly the same access token out of it. `nativeAuth` runs that
// flow, and the app passes the result to `RebootClientProvider`:
//
//     const auth = nativeAuth({ ... });
//
//     <RebootClientProvider url={REBOOT_URL} nativeAuth={auth}>
//
// after which `useSignIn()`, `useSignOut()`, and the generated
// `use<State>()` hooks work exactly as they do on the web.
//
// The whole protocol lives here; only the two things React Native has
// no standard answer for are passed in — opening a browser tab and
// persisting a secret. That keeps this module free of any dependency
// on a particular toolchain, so an Expo app, a bare React Native app,
// and anything else that can supply those two primitives all use the
// same code.
import { calcSha256 } from "@reboot-dev/reboot-web/sha256.js";
import type { RebootAuth, RebootAuthFactory, RebootSession } from "../index.js";

/**
 * Where a refresh token and this installation's client registration
 * are kept between runs. Deliberately the shape of `expo-secure-store`,
 * which can be passed directly.
 *
 * The refresh token is a credential with a long life, so this should
 * be backed by the platform keychain rather than by anything the rest
 * of the device can read.
 */
export interface NativeAuthStorage {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

/**
 * What `openAuthSession` reports back. Matches
 * `expo-web-browser`'s `WebBrowserAuthSessionResult`, so that
 * library's `openAuthSessionAsync` can be passed straight in.
 */
export interface NativeAuthSessionResult {
  /**
   * `"success"` when the browser landed back on the redirect URI.
   * Any other value means the user dismissed the flow before it got
   * that far.
   */
  type: string;
  /**
   * The redirect URL, carrying the authorization code. Read only
   * when `type` is `"success"`.
   */
  url?: string | null;
}

export interface NativeAuthOptions {
  /**
   * Where the OAuth server sends the authorization code — the app's
   * own custom scheme (`myapp://redirect`) or a verified App Link.
   * Under Expo, `AuthSession.makeRedirectUri({ scheme, path })`.
   *
   * List this in `Application(native_redirect_uris=[...])` so Reboot
   * recognizes the app as first-party and signs users in without a
   * consent screen.
   */
  redirectUri: string;
  /**
   * Open `url` in a browser, and resolve once the browser lands back
   * on `redirectUri` (or the user dismisses it). Under Expo,
   * `WebBrowser.openAuthSessionAsync`.
   */
  openAuthSession: (
    url: string,
    redirectUri: string
  ) => Promise<NativeAuthSessionResult>;
  storage: NativeAuthStorage;
  /**
   * A human-readable name for this app. Shown on the consent screen,
   * which first-party apps never reach — so this only matters if the
   * app's `redirectUri` is not among the backend's
   * `native_redirect_uris`.
   */
  clientName?: string;
  /**
   * Prefix for the keys written to `storage`, to keep two Reboot
   * apps on one device from overwriting each other's session.
   */
  storageKeyPrefix?: string;
}

// Where an OAuth 2.1 authorization server advertises its endpoints
// (RFC 8414).
const METADATA_PATH = "/.well-known/oauth-authorization-server";

// The subset of the discovery document this flow needs, with the
// three endpoints required rather than optional so the code below
// never has to assert they are present.
interface Endpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
}

interface StoredRegistration {
  clientId: string;
  redirectUri: string;
}

// `bytes` as unpadded base64url, the encoding every string OAuth
// carries in a URL uses (RFC 7636 4.2).
const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

// A cryptographically random base64url string of `byteLength` bytes,
// for the PKCE verifier and the OAuth `state`. `crypto.getRandomValues`
// is standard in browsers, and React Native apps already need it
// polyfilled for the Reboot client's idempotency keys.
const randomBase64Url = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

// The PKCE code challenge for `verifier`: the unpadded base64url of
// its SHA-256 digest. Hermes has no `crypto.subtle`, so the digest
// comes from Reboot's own implementation, handed the verifier's bytes
// rather than the string itself — that keeps it off `calcSha256`'s
// `TextEncoder`/`Buffer` path, neither of which React Native reliably
// has. A verifier is base64url, so its bytes are its char codes.
const sha256Base64Url = (verifier: string): string => {
  const bytes = new Uint8Array(verifier.length);
  for (let index = 0; index < verifier.length; index++) {
    bytes[index] = verifier.charCodeAt(index);
  }
  return bytesToBase64Url(calcSha256(bytes) as Uint8Array);
};

// The query parameters of `url`, parsed by hand rather than through
// `URL`: the redirect lands on a custom scheme like
// `myapp://redirect?code=...`, and React Native's `URL` polyfill does
// not reliably expose `searchParams` for schemes it doesn't consider
// special.
const queryParameters = (url: string): Record<string, string> => {
  const query = url.split("#")[0].split("?").slice(1).join("?");
  const parameters: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const separator = pair.indexOf("=");
    const [key, value] =
      separator === -1
        ? [pair, ""]
        : [pair.slice(0, separator), pair.slice(separator + 1)];
    parameters[decodeURIComponent(key)] = decodeURIComponent(
      value.replace(/\+/g, " ")
    );
  }
  return parameters;
};

const formEncode = (fields: Record<string, string>): string =>
  Object.entries(fields)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");

// Thrown when the OAuth server answers a token request with an error:
// the request will never succeed as-is, as opposed to a network
// failure, which might.
class TokenRejected extends Error {}

const fetchEndpoints = async (rebootUrl: string): Promise<Endpoints> => {
  const response = await fetch(`${rebootUrl}${METADATA_PATH}`);
  if (!response.ok) {
    throw new Error(`OAuth discovery failed with HTTP ${response.status}.`);
  }
  const metadata = await response.json();
  if (
    typeof metadata.authorization_endpoint !== "string" ||
    typeof metadata.token_endpoint !== "string" ||
    typeof metadata.registration_endpoint !== "string"
  ) {
    throw new Error("OAuth discovery returned an incomplete document.");
  }
  return {
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    registrationEndpoint: metadata.registration_endpoint,
  };
};

// Turn an OAuth token response into a session. Reboot returns
// `expires_in` (seconds from now); the provider wants an absolute
// deadline so it can schedule a refresh against it.
const sessionFromTokenResponse = (body: any): RebootSession => {
  if (typeof body.access_token !== "string") {
    throw new TokenRejected("Token response carried no 'access_token'.");
  }
  return {
    accessToken: body.access_token,
    expiresAt:
      typeof body.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + body.expires_in
        : undefined,
  };
};

/**
 * Build the `nativeAuth` for a `RebootClientProvider` in a bare React
 * Native app. Expo apps want `expoAuth` instead, which fills these in.
 *
 * Hold the result in a module-level constant rather than building it
 * inline in JSX: the provider rebuilds its session machinery whenever
 * this value changes identity.
 */
export function nativeAuth(options: NativeAuthOptions): RebootAuthFactory {
  const {
    redirectUri,
    openAuthSession,
    storage,
    clientName,
    storageKeyPrefix = "reboot",
  } = options;

  const REFRESH_TOKEN_KEY = `${storageKeyPrefix}.refreshToken`;
  const REGISTRATION_KEY = `${storageKeyPrefix}.clientRegistration`;

  return (rebootUrl: string): RebootAuth => {
    // `RebootClient` requires a bare origin, so dropping a trailing
    // slash is all it takes to build endpoint URLs from it.
    const baseUrl = rebootUrl.replace(/\/$/, "");

    // Discovery and client registration, resolved once and shared by
    // sign-in and by every refresh.
    let setupPromise: Promise<{
      endpoints: Endpoints;
      clientId: string;
    }> | null = null;

    // Obtain a `client_id`, registering one if we have none for
    // `redirectUri`. Reboot mints it as a signed token encoding the
    // `redirect_uris` it was registered with, so a registration is
    // only good for the redirect URI that produced it — and a
    // development redirect URI embeds the development machine's
    // address, which changes from one machine (or network) to the
    // next. Hence the two are stored, and compared, as a pair.
    const registeredClientId = async (
      endpoints: Endpoints
    ): Promise<string> => {
      const stored = await storage.getItemAsync(REGISTRATION_KEY);
      if (stored !== null) {
        const registration: StoredRegistration = JSON.parse(stored);
        if (
          registration.redirectUri === redirectUri &&
          typeof registration.clientId === "string"
        ) {
          return registration.clientId;
        }
      }
      const response = await fetch(endpoints.registrationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: [redirectUri],
          ...(clientName === undefined ? {} : { client_name: clientName }),
        }),
      });
      if (!response.ok) {
        throw new Error(
          `OAuth client registration failed with HTTP ${response.status}.`
        );
      }
      const body = await response.json();
      if (typeof body.client_id !== "string") {
        throw new Error("OAuth client registration returned no 'client_id'.");
      }
      await storage.setItemAsync(
        REGISTRATION_KEY,
        JSON.stringify({ clientId: body.client_id, redirectUri })
      );
      return body.client_id;
    };

    const setup = () => {
      if (setupPromise === null) {
        const promise = (async () => {
          const endpoints = await fetchEndpoints(baseUrl);
          return { endpoints, clientId: await registeredClientId(endpoints) };
        })();
        // A failure — typically the backend not being up yet — must
        // not be cached, so that the next attempt starts over.
        promise.catch(() => {
          if (setupPromise === promise) {
            setupPromise = null;
          }
        });
        setupPromise = promise;
      }
      return setupPromise;
    };

    const postToken = async (
      endpoints: Endpoints,
      fields: Record<string, string>
    ): Promise<any> => {
      const response = await fetch(endpoints.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formEncode(fields),
      });
      if (response.status >= 400 && response.status < 500) {
        // The server rejected the request itself (an `invalid_grant`
        // once a refresh token has expired, say); retrying it
        // unchanged would fail the same way.
        throw new TokenRejected(
          `The OAuth server rejected the token request with HTTP ` +
            `${response.status}.`
        );
      }
      if (!response.ok) {
        throw new Error(
          `The OAuth token request failed with HTTP ${response.status}.`
        );
      }
      return await response.json();
    };

    // Adopt a token response: persist the refresh token it rotated to
    // (Reboot mints a fresh one on every exchange) and hand back the
    // session.
    const adopt = async (body: any): Promise<RebootSession> => {
      const session = sessionFromTokenResponse(body);
      if (typeof body.refresh_token === "string") {
        await storage.setItemAsync(REFRESH_TOKEN_KEY, body.refresh_token);
      }
      return session;
    };

    const refresh = async (): Promise<
      RebootSession | "unauthenticated" | undefined
    > => {
      const refreshToken = await storage.getItemAsync(REFRESH_TOKEN_KEY);
      if (refreshToken === null) {
        return "unauthenticated";
      }
      try {
        const { endpoints, clientId } = await setup();
        return await adopt(
          await postToken(endpoints, {
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: clientId,
          })
        );
      } catch (error) {
        if (error instanceof TokenRejected) {
          // This session is over; drop what is left of it so the next
          // launch doesn't try again with the same dead token.
          await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
          return "unauthenticated";
        }
        // Transient, e.g. the backend is unreachable. Keep the stored
        // refresh token so a later attempt can still use it.
        console.warn("[Reboot] could not refresh the session:", error);
        return undefined;
      }
    };

    return {
      restore: async () => {
        if ((await storage.getItemAsync(REFRESH_TOKEN_KEY)) === null) {
          return undefined;
        }
        const session = await refresh();
        return session === "unauthenticated" || session === undefined
          ? undefined
          : session;
      },

      signIn: async () => {
        const { endpoints, clientId } = await setup();

        // PKCE (RFC 7636): the verifier stays in this process, and
        // only its hash travels through the browser, so intercepting
        // the redirect — which a hostile app claiming the same custom
        // scheme could — yields a code that cannot be exchanged.
        const codeVerifier = randomBase64Url(32);
        const codeChallenge = sha256Base64Url(codeVerifier);
        const state = randomBase64Url(16);

        const authorizationUrl =
          `${endpoints.authorizationEndpoint}?` +
          formEncode({
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state,
          });

        const result = await openAuthSession(authorizationUrl, redirectUri);
        if (result.type !== "success" || !result.url) {
          // The user dismissed the browser tab.
          return undefined;
        }

        const returned = queryParameters(result.url);
        if (returned.error !== undefined) {
          if (returned.error === "access_denied") {
            // The user declined on the consent screen.
            return undefined;
          }
          throw new Error(
            `Sign-in failed: ${returned.error_description ?? returned.error}`
          );
        }
        if (returned.state !== state) {
          // Not the flow we started. Refuse it rather than exchange a
          // code we can't account for.
          throw new Error("Sign-in failed: the OAuth 'state' did not match.");
        }
        if (returned.code === undefined) {
          throw new Error(
            "Sign-in failed: no authorization code was returned."
          );
        }
        const code = returned.code;

        return await adopt(
          await postToken(endpoints, {
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          })
        );
      },

      // Local sign-out: drops this device's tokens and leaves the
      // identity provider's own session alone. The client
      // registration survives, being this installation's identity
      // rather than the user's.
      signOut: async () => {
        await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
      },

      refresh,
    };
  };
}

// `expo-secure-store` is the device keychain, implemented natively
// behind a JS bridge — so in a web bundle of the same app
// (`expo start --web`) it exists as a module but its functions are
// missing, and calling one throws. Fall back to `sessionStorage`
// there: it survives a reload and dies with the tab.
//
// Deliberately not `localStorage`, where a refresh token would
// outlive the session and be readable by any script on the origin. A
// real web front end shouldn't come through here at all — it signs in
// through the browser flow, which keeps its session in HttpOnly
// cookies.
function withWebFallback(storage: NativeAuthStorage): NativeAuthStorage {
  // A browser is exactly what has `sessionStorage`; React Native
  // defines a global `window` but nothing on it.
  if (typeof sessionStorage === "undefined") {
    return storage;
  }
  return {
    getItemAsync: async (key) => sessionStorage.getItem(key),
    setItemAsync: async (key, value) => {
      sessionStorage.setItem(key, value);
    },
    deleteItemAsync: async (key) => {
      sessionStorage.removeItem(key);
    },
  };
}

/**
 * The Expo modules `expoAuth` needs. Pass the module namespaces
 * straight through — `import * as WebBrowser from "expo-web-browser"`
 * and so on. They are typed structurally, so Reboot itself takes no
 * dependency on Expo.
 */
export interface ExpoAuthOptions {
  WebBrowser: {
    openAuthSessionAsync: (
      url: string,
      redirectUri: string
    ) => Promise<NativeAuthSessionResult>;
    maybeCompleteAuthSession: () => void;
  };
  SecureStore: NativeAuthStorage;
  Linking: { createURL: (path: string) => string };
  /**
   * Path appended to the app's scheme to form the redirect URI.
   * Defaults to `"redirect"`, giving `myapp://redirect`.
   */
  redirectPath?: string;
  clientName?: string;
  storageKeyPrefix?: string;
}

/**
 * Build the `nativeAuth` for a `RebootClientProvider` in an Expo app:
 *
 *     import * as Linking from "expo-linking";
 *     import * as SecureStore from "expo-secure-store";
 *     import * as WebBrowser from "expo-web-browser";
 *
 *     const auth = expoAuth({ WebBrowser, SecureStore, Linking });
 *
 * The redirect URI comes from `Linking`, which derives it from the
 * `scheme` in `app.json` — so list `<scheme>://redirect` in
 * `Application(native_redirect_uris=[...])` to have Reboot recognize
 * the app as first-party and sign users in without a consent screen.
 *
 * Hold the result in a module-level constant rather than building it
 * inline in JSX: the provider rebuilds its session machinery whenever
 * this value changes identity.
 */
export function expoAuth(options: ExpoAuthOptions): RebootAuthFactory {
  const {
    WebBrowser,
    SecureStore,
    Linking,
    redirectPath = "redirect",
    clientName,
    storageKeyPrefix,
  } = options;

  // Under a web bundle the flow runs in a popup, which loads the same
  // app at the redirect URI; this is what hands the result back to the
  // window that opened it and closes the popup. A no-op on native,
  // where the redirect arrives as a deep link.
  WebBrowser.maybeCompleteAuthSession();

  return nativeAuth({
    redirectUri: Linking.createURL(redirectPath),
    openAuthSession: WebBrowser.openAuthSessionAsync,
    storage: withWebFallback(SecureStore),
    clientName,
    storageKeyPrefix,
  });
}
