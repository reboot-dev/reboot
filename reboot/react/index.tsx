"use client";
import { Event, react_pb, Status } from "@reboot-dev/reboot-api";
import {
  createContext,
  lazy,
  ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Globals injected by the Reboot server for remote access.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    REBOOT_URL?: string;
    REBOOT_MCP_UI_TITLE?: string;
  }
}

// Re-export internal hooks and context so existing imports
// don't break.
export {
  McpAppContext,
  DefaultStateIdsContext,
  useMcpApp,
  useMcpToolData,
  useRefreshMCPBearerToken,
  type McpAppContextValue,
  type DefaultStateIdsContextValue,
} from "./internal/index.js";
import {
  BearerRefreshContext,
  DefaultStateIdsContext,
  type DefaultStateIdsContextValue,
} from "./internal/index.js";

// ---------------------------------------------------------------------------
// URL and MCP title auto-detection.
// ---------------------------------------------------------------------------

// React Native (and other non-browser runtimes) define a global
// `window` but no `window.location`, so reading `.search`/`.origin`
// throws there. These helpers degrade to "no query string" and "no
// origin", which disables the browser-only auto-detection paths; on
// native the URL is always passed explicitly to `RebootClientProvider`.
function locationSearch(): string {
  if (typeof window === "undefined" || typeof window.location === "undefined") {
    return "";
  }
  return window.location.search;
}

function locationOrigin(): string | undefined {
  if (typeof window === "undefined" || typeof window.location === "undefined") {
    return undefined;
  }
  return window.location.origin;
}

/**
 * Auto-detect the Reboot server URL.
 *
 * Priority:
 * 1. `window.REBOOT_URL` (injected by server)
 * 2. `rebootUrl` query parameter (dev iframe mode)
 * 3. `window.location.origin` (if valid HTTP)
 */
function detectRebootUrl(): string {
  // Server-injected URL (for remote MCP Apps).
  const injectedUrl = window.REBOOT_URL;
  if (injectedUrl) return injectedUrl;

  // Query param URL (for iframe-based loading).
  const queryUrl = new URLSearchParams(locationSearch()).get("rebootUrl");
  if (queryUrl) return queryUrl;

  // Same-origin deployment.
  const origin = locationOrigin();
  if (origin && origin !== "null" && origin.startsWith("http")) {
    return origin;
  }

  throw new Error(
    "Could not detect Reboot server URL. " +
      "Ensure the page is served from the Reboot server."
  );
}

/**
 * Detect MCP properties. Returns non-null when the app
 * should operate in MCP mode.
 *
 * Sources (any triggers MCP mode):
 * 1. Explicit `mcpUiTitle` prop
 * 2. `window.REBOOT_MCP_UI_TITLE` (production injection)
 * 3. `mcpUiTitle` query parameter (dev iframe mode)
 */
function detectMcpProperties(
  explicitTitle?: string
): { uiTitle: string } | null {
  if (explicitTitle) return { uiTitle: explicitTitle };

  const injectedTitle = window.REBOOT_MCP_UI_TITLE;
  if (injectedTitle) return { uiTitle: injectedTitle };

  const queryTitle = new URLSearchParams(locationSearch()).get("mcpUiTitle");
  if (queryTitle) return { uiTitle: queryTitle };

  return null;
}

// Lazy-loaded McpConnector. Kept in `internal/` so that
// the ext-apps import doesn't appear in `index.d.ts`,
// which would break consumers using `moduleResolution:
// "node"` or that don't have ext-apps installed.

const LazyMcpConnector = lazy(() => import("./internal/McpConnector.js"));

export class RebootClient {
  readonly url: string;
  readonly bearerToken: string | undefined;
  readonly setBearerToken: (token?: string) => void;
  readonly setAuthorizationBearer: (token?: string) => void;
  readonly offlineCacheEnabled: boolean = false;

  constructor(
    constructorArgs:
      | string
      | {
          url: string;
          bearerToken: string | undefined;
          setBearerToken?: (token?: string) => void;
          // TODO: Remove after a deprecation cycle.
          setAuthorizationBearer?: (token?: string) => void;
          offlineCacheEnabled?: boolean;
        }
  ) {
    if (typeof constructorArgs === "string") {
      console.warn(
        `Constructing a RebootClient directly is deprecated.

        Instead, use a 'RebootClientProvider' with a 'url' e.g.
        <RebootClientProvider url={someUrl} />
        Explicitly constructing a client will continue to work; however, the
        client object you get back from this RebootClientProvider will not be
        the same object you passed into the 'client' prop.`
      );
      this.url = constructorArgs;

      // We can be sure that setBearerToken is correctly set
      // because, if we are passed a client directly with only a `url` we will
      // reconstruct a client using the new, non-deprecated constructor.
      // See `RebootClientProvider` in reboot/react/index.tsx for more context.
      // This prevents people from having to call
      // setBearerToken?.(rebootToken) instead of
      // setBearerToken(rebootToken)
      this.setBearerToken = () => {};
      this.setAuthorizationBearer = () => {};
    } else {
      this.url = constructorArgs.url;
      this.bearerToken = constructorArgs.bearerToken;
      this.setBearerToken =
        constructorArgs.setBearerToken ||
        // TODO: Remove after a deprecation cycle.
        constructorArgs.setAuthorizationBearer ||
        (() => {});
      this.setAuthorizationBearer = this.setBearerToken;
      this.offlineCacheEnabled = constructorArgs.offlineCacheEnabled ?? false;
    }

    if (this.url === undefined || this.url === "" || this.url === null) {
      throw new Error("You must pass a 'url' to RebootClient");
    }
    const urlObj = new URL(this.url);
    if (urlObj.pathname !== "/") {
      throw new Error("'url' must be the base URL with no pathname");
    }
    // url.searchParams.size can be undefined in Chromium tests.
    if (
      urlObj.searchParams.size !== undefined &&
      urlObj.searchParams.size !== 0
    ) {
      throw new Error("'url' cannot include search parameters");
    }
    if (!urlObj.protocol.startsWith("http")) {
      throw new Error("'url' must use HTTP or HTTPS protocols");
    }
  }
}

// ---------------------------------------------------------------------------
// Browser auth: cookie-based session against the OAuth server's
// `/__/oauth/*` endpoints. Plumbs `signIn` / `signOut` action
// helpers. Apps branch on the generated `useUser()` hook for the
// `User` state type, whose no-id form surfaces `{ user, isLoading }`.
// ---------------------------------------------------------------------------

// `error` means the sign-in state is unknown: the `/__/oauth/whoami`
// probe failed without answering the signed-in question (backend
// unreachable, 5xx) and is being retried with backoff.
type RebootAuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

interface RebootAuthState {
  status: RebootAuthStatus;
  expiresAt?: number;
  // `{state_type_full_name: state_id}` map returned by
  // `/__/oauth/whoami` — same shape MCP delivers via tool results.
  // Generated React hooks (`useCounter()`, `usePing()`, …) fall back
  // to this map when no explicit id is passed, so SPA components
  // mounted under `RebootClientProvider` don't have to thread the
  // user_id through every call.
  ids?: Record<string, string>;
}

/**
 * Returns a function that begins sign-in by redirecting the
 * browser to the Reboot OAuth server's `/__/oauth/start`. After
 * the IdP round-trip the user lands back at `returnTo` (defaults
 * to the current URL) with a session cookie set.
 *
 * Reads the backend URL from the surrounding `RebootClientProvider`
 * via `useRebootClient()`, so it points at the *backend* origin
 * even when the SPA is hosted on a different one — crucial for
 * cross-origin deployments where `window.location.origin` would
 * misdirect the flow at the Vite dev server.
 */
export const useSignIn = (): ((returnTo?: string) => void) => {
  const client = useRebootClient();
  return (returnTo?: string) => {
    const target = new URL("/__/oauth/start", client.url);
    target.searchParams.set("return_to", returnTo ?? window.location.href);
    window.location.href = target.toString();
  };
};

/**
 * Returns a function that signs the user out by clearing the
 * session cookies on the backend and reloading. Local sign-out
 * only.
 *
 * Like `useSignIn`, reads the backend URL from
 * `useRebootClient()` so the request lands on the backend origin.
 */
export const useSignOut = (): (() => Promise<void>) => {
  const client = useRebootClient();
  return async () => {
    await fetch(new URL("/__/oauth/signout", client.url).toString(), {
      method: "POST",
      credentials: "include",
    });
    window.location.reload();
  };
};

interface WhoamiResponse {
  authenticated: boolean;
  user_id?: string;
  access_token?: string;
  expires_at?: number;
  default_ids?: Record<string, string>;
}

interface WhoamiResult {
  state: RebootAuthState;
  accessToken?: string;
}

// `"retry"` means the probe failed without answering the signed-in
// question (network error, 5xx, or a malformed body): the caller
// should probe again rather than treat the user as signed out.
async function fetchWhoami(rebootUrl: string): Promise<WhoamiResult | "retry"> {
  let response: Response;
  try {
    response = await fetch(new URL("/__/oauth/whoami", rebootUrl).toString(), {
      credentials: "include",
    });
  } catch {
    return "retry";
  }
  if (response.status >= 500) {
    return "retry";
  }
  if (!response.ok) {
    // E.g. a 404 from a backend without `oauth=...` configured:
    // there is no session to be had, so the SPA can show its
    // sign-in page (or render normally if it doesn't require sign-in).
    return { state: { status: "unauthenticated" } };
  }
  let body: WhoamiResponse;
  try {
    body = (await response.json()) as WhoamiResponse;
  } catch {
    return "retry";
  }
  if (body.authenticated && body.user_id !== undefined) {
    return {
      state: {
        status: "authenticated",
        expiresAt: body.expires_at,
        ids: body.default_ids,
      },
      accessToken: body.access_token,
    };
  }
  return { state: { status: "unauthenticated" } };
}

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
  expires_at?: number;
}

/**
 * Result returned by `refreshBearer` on a successful refresh.
 * The caller already has the new bearer applied via the
 * `setBearerToken` callback they passed in; this struct surfaces
 * the new expiry so a proactive-refresh scheduler can re-arm.
 */
export interface RefreshResult {
  accessToken: string;
  /** Unix epoch seconds at which the new access JWT expires. */
  expiresAt: number;
}

/**
 * POST `/__/oauth/refresh`: rotate the session cookies, pull the
 * freshly-minted access JWT and its new expiry out of the body,
 * and hand the JWT to `setBearerToken` so subsequent calls carry
 * the new bearer. Returns the new `{accessToken, expiresAt}` pair
 * on success; `"unauthenticated"` when the backend rejected the
 * refresh token itself (HTTP 401 — the session is over and the
 * user must sign in again); `null` on a transient failure (network
 * error, 5xx, malformed response) that says nothing about the
 * session and is worth retrying.
 *
 * Exported so apps that take fine control of their auth lifecycle
 * can drive a refresh manually too.
 */
export async function refreshBearer(
  rebootUrl: string,
  setBearerToken: (token?: string) => void
): Promise<RefreshResult | "unauthenticated" | null> {
  let response: Response;
  try {
    response = await fetch(new URL("/__/oauth/refresh", rebootUrl).toString(), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return null;
  }
  if (response.status === 401) {
    return "unauthenticated";
  }
  if (!response.ok) {
    return null;
  }
  let body: RefreshResponse;
  try {
    body = (await response.json()) as RefreshResponse;
  } catch {
    return null;
  }
  if (body.access_token === undefined || body.expires_at === undefined) {
    return null;
  }
  setBearerToken(body.access_token);
  return {
    accessToken: body.access_token,
    expiresAt: body.expires_at,
  };
}

// ---------------------------------------------------------------------------
// RebootClientProvider: unified provider for both MCP and
// non-MCP apps.
// ---------------------------------------------------------------------------

const RebootClientContext = createContext<RebootClient | undefined>(undefined);

interface RebootClientProviderWithClientProps {
  children: ReactNode;
  url?: undefined;
  mcpUiTitle?: string;
  token?: string;
  client: RebootClient;
  offlineCacheEnabled?: boolean;
}

interface RebootClientProviderWithURLProps {
  children: ReactNode;
  url: string;
  mcpUiTitle?: string;
  token?: string;
  client?: undefined;
  offlineCacheEnabled?: boolean;
}

interface RebootClientProviderAutoProps {
  children: ReactNode;
  url?: undefined;
  mcpUiTitle?: string;
  token?: string;
  client?: undefined;
  offlineCacheEnabled?: boolean;
}

type RebootClientProviderProps =
  | RebootClientProviderWithClientProps
  | RebootClientProviderWithURLProps
  | RebootClientProviderAutoProps;

export const RebootClientProvider = ({
  children,
  url: explicitUrl,
  mcpUiTitle: explicitUiTitle,
  token,
  client,
  offlineCacheEnabled = false,
}: RebootClientProviderProps) => {
  const [bearerToken, setBearerToken] = useState<string | undefined>(token);

  const rebootUrl = useMemo(
    () => explicitUrl || client?.url || detectRebootUrl(),
    [explicitUrl, client?.url]
  );

  const mcpTitle = useMemo(
    () => detectMcpProperties(explicitUiTitle),
    [explicitUiTitle]
  );

  const rebootClient = useMemo(
    () =>
      new RebootClient({
        url: rebootUrl,
        setBearerToken,
        setAuthorizationBearer: setBearerToken,
        bearerToken,
        offlineCacheEnabled,
      }),
    [rebootUrl, offlineCacheEnabled, bearerToken]
  );

  // 401-triggered refresh for the web surface, handed to generated
  // hooks through `BearerRefreshContext` (the MCP connector provides
  // its own, host-based implementation there). Coalesces concurrent
  // callers into one `/__/oauth/refresh` round-trip; resolves to the
  // fresh bearer, or `undefined` when no fresh bearer could be
  // obtained. A terminal rejection also flips the auth state to
  // signed out, so the UI reacts.
  const refreshWebBearerPromise = useRef<Promise<string | undefined> | null>(
    null
  );
  const refreshWebBearerToken = useCallback((): Promise<string | undefined> => {
    if (refreshWebBearerPromise.current !== null) {
      return refreshWebBearerPromise.current;
    }
    const promise = (async () => {
      try {
        const refreshed = await refreshBearer(rebootUrl, setBearerToken);
        if (refreshed === "unauthenticated") {
          setAuthState({ status: "unauthenticated" });
          setBearerToken(undefined);
          return undefined;
        }
        if (refreshed === null) {
          return undefined;
        }
        setAuthState((prev) =>
          prev.status === "authenticated"
            ? { ...prev, expiresAt: refreshed.expiresAt }
            : prev
        );
        return refreshed.accessToken;
      } finally {
        refreshWebBearerPromise.current = null;
      }
    })();
    refreshWebBearerPromise.current = promise;
    return promise;
  }, [rebootUrl]);

  // In web mode: probe `/whoami` to learn the signed-in state,
  // retrying with backoff while the backend can't answer, so user
  // code can branch on the generated `useUser()` hook's
  // `{ user, isLoading }` shape. In MCP mode the bearer is
  // delivered by the host via tool results, so this probe doesn't
  // run.
  const [authState, setAuthState] = useState<RebootAuthState>({
    status: "loading",
  });

  useEffect(() => {
    if (mcpTitle) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Exponential backoff for `"retry"` probe results, capped so an
    // extended backend outage keeps probing at a modest rate.
    let backoffMs = 1_000;
    const probe = async () => {
      const result = await fetchWhoami(rebootUrl);
      if (cancelled) return;
      if (result === "retry") {
        // The signed-in question is unanswered; generated hooks
        // keep reporting `isLoading` (see `stateIdsContextValue`
        // below) until a probe lands.
        setAuthState({ status: "error" });
        timer = setTimeout(() => void probe(), backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30_000);
        return;
      }
      // The whoami response carries the cookie-backed access JWT;
      // hand it to the RebootClient so unary RPCs send
      // `Authorization: Bearer` and reactive reads / mutations
      // stuff it into the `bearerToken` proto field. Cross-origin
      // WebSocket frames don't carry cookies, so the JWT-in-payload
      // bridge is mandatory.
      //
      // Refuse `authenticated: true` without an `access_token` —
      // it means the SPA's contract with the backend has drifted
      // (version skew or partial response). A "signed in but no
      // bearer" state would render the authenticated UI while
      // every RPC goes out unauthenticated, with WebSocket
      // mutations failing silently. Treat it as unauthenticated
      // and let the user re-sign-in.
      if (
        result.state.status === "authenticated" &&
        result.accessToken === undefined
      ) {
        setAuthState({ status: "unauthenticated" });
        return;
      }
      setAuthState(result.state);
      if (result.accessToken !== undefined) {
        setBearerToken(result.accessToken);
      }
    };
    void probe();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [rebootUrl, mcpTitle]);

  // Proactive bearer refresh. The reactive-reads + mutations
  // path travels through the WebSocket multiplex carrying the
  // bearer in the request payload, where it has no retry hook
  // we could attach an `onUnauthenticated` to — once it 401s on
  // an expired JWT, the mutation just aborts. So we *prevent*
  // expiry by refreshing well before the deadline, off the
  // `expires_at` value the server hands back on every successful
  // `/__/oauth/whoami` and `/__/oauth/refresh`. `REFRESH_MARGIN_MS`
  // is a generous head-start that absorbs clock skew and the
  // round-trip latency of the refresh itself.
  useEffect(() => {
    if (mcpTitle) return;
    if (authState.status !== "authenticated") return;
    if (authState.expiresAt === undefined) return;

    const REFRESH_MARGIN_MS = 5_000;
    const msUntilRefresh = Math.max(
      authState.expiresAt * 1000 - Date.now() - REFRESH_MARGIN_MS,
      0
    );

    // Retry cadence for transient refresh failures: fast enough to
    // beat the access token's remaining lifetime in most outages,
    // slow enough not to hammer a struggling backend.
    const RETRY_MS = 2_000;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void refreshBearer(rebootUrl, setBearerToken).then((refreshed) => {
        if (cancelled) return;
        if (refreshed === "unauthenticated") {
          // The refresh token itself was rejected — the session is
          // over. The SPA observes a clean signed-out state and
          // re-renders to its sign-in page. The framework's
          // reactive readers will abort on the next tick (their
          // cached JWT is stale), which is exactly what we want —
          // the user sees the sign-in page rather than a frozen
          // UI.
          setAuthState({ status: "unauthenticated" });
          setBearerToken(undefined);
          return;
        }
        if (refreshed === null) {
          // Transient failure (backend unreachable, 5xx): the
          // session may well still be alive, so keep the
          // authenticated UI up and retry until the backend
          // answers one way or the other.
          retryTimer = setTimeout(refresh, RETRY_MS);
          return;
        }
        // Re-arm: bump `expiresAt` and let this effect run again
        // with the new deadline. Use the functional `setAuthState`
        // so we don't have to thread the latest `authState` into
        // the deps list.
        setAuthState((prev) =>
          prev.status === "authenticated"
            ? { ...prev, expiresAt: refreshed.expiresAt }
            : prev
        );
      });
    };
    const timer = setTimeout(refresh, msUntilRefresh);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [rebootUrl, mcpTitle, authState.status, authState.expiresAt]);

  // Generated hooks (`useCounter()`, `usePing()`, …) read the
  // state-ID map through `useDefaultStateIds()` — surface-
  // agnostic; populated by either this provider (web mode, via
  // `/whoami`) or the MCP connector (MCP mode, via tool-input/
  // result events). This provider supplies only the context values it
  // can truthfully compute in web mode — the surface-neutral ones;
  // `McpAppContext` is the MCP connector's to supply.
  //
  // A `null` map surfaces the unanswered `/whoami` probe (in
  // flight, or erroring and being retried) so a no-id generated
  // hook can report `{ <state>, isLoading }` (or suspend) instead
  // of the provider hard-blocking the whole tree: rendering is
  // async, and only reads that need auth wait. Once resolved the map
  // is the ids — an empty map when signed out / no default ID.
  // Memoized on exactly `status` and `ids` so the context value is
  // reference-stable across unrelated re-renders (notably the
  // proactive-refresh `expiresAt` bump, which re-renders this
  // provider every TTL-5s; without the memo every generated
  // `use<State>()` hook would re-render too).
  const stateIdsContextValue = useMemo<DefaultStateIdsContextValue>(
    () => ({
      defaultIds:
        authState.status === "loading" || authState.status === "error"
          ? null
          : authState.ids ?? {},
    }),
    [authState.status, authState.ids]
  );

  if (mcpTitle) {
    return (
      <RebootClientContext.Provider value={rebootClient}>
        <Suspense
          fallback={
            <div style={{ padding: "1rem", opacity: 0.7 }}>Loading MCP...</div>
          }
        >
          <LazyMcpConnector
            appName={mcpTitle.uiTitle}
            setBearerToken={setBearerToken}
          >
            {children}
          </LazyMcpConnector>
        </Suspense>
      </RebootClientContext.Provider>
    );
  }

  return (
    <RebootClientContext.Provider value={rebootClient}>
      <BearerRefreshContext.Provider value={refreshWebBearerToken}>
        <DefaultStateIdsContext.Provider value={stateIdsContextValue}>
          {children}
        </DefaultStateIdsContext.Provider>
      </BearerRefreshContext.Provider>
    </RebootClientContext.Provider>
  );
};

/**
 * @deprecated useRebootContext is deprecated in favor of useRebootClient.
 */
export const useRebootContext = () => {
  console.warn(
    "`useRebootContext` has been deprecated for `useRebootClient`; " +
      "please update your code, it will be removed in a future release"
  );
  return useRebootClient();
};

export const useRebootClient = () => {
  const context = useContext(RebootClientContext);
  if (context === undefined) {
    throw new Error(
      "useRebootClient must be used within a RebootClientProvider."
    );
  }

  return context;
};

export interface Mutate {
  request: react_pb.MutateRequest;
  resolve: (response: react_pb.MutateResponse) => void;
  update: (props: { isLoading: boolean; error?: any }) => void;
}

export interface Reader<ResponseType> {
  abortController: AbortController;
  event: Event;
  promise?: Promise<void>;
  response?: ResponseType;
  scheduledUnusedTimeoutsCount: number;
  status?: Status;
  used: boolean;

  // Listeners.
  setResponses: { [id: string]: (response: ResponseType) => void };
  setIsLoadings: { [id: string]: (isLoading: boolean) => void };
  setStatuses: { [id: string]: (status: Status) => void };

  // Functions to dispatch to listeners.
  setResponse: (response: ResponseType, options?: { cache: boolean }) => void;
  setIsLoading: (isLoading: boolean) => void;
  setStatus: (status: Status) => void;
}

export interface Observers {
  [key: string]: {
    observe: (
      idempotencyKey: string,
      observed: (callback: () => void) => Promise<void>,
      aborted: () => void
    ) => void;

    unobserve: (idempotencyKey: string) => void;
  };
}

export interface Mutation<RequestType> {
  request: RequestType;
  idempotencyKey: string;
  bearerToken?: string;
  isLoading: boolean;
  error?: unknown; // TODO(benh): coerce to a string? JSON.stringify?
  metadata?: any;
}
