"use client";
import { Event, react_pb, Status } from "@reboot-dev/reboot-api";
import {
  createContext,
  lazy,
  ReactNode,
  Suspense,
  useContext,
  useMemo,
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
  useMcpApp,
  useMcpToolData,
  useRefreshMCPBearerToken,
  type McpAppContextValue,
} from "./internal/index.js";

// ---------------------------------------------------------------------------
// URL and MCP title auto-detection.
// ---------------------------------------------------------------------------

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
  const queryUrl = new URLSearchParams(window.location.search).get("rebootUrl");
  if (queryUrl) return queryUrl;

  // Same-origin deployment.
  const origin = window.location.origin;
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

  const queryTitle = new URLSearchParams(window.location.search).get(
    "mcpUiTitle"
  );
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
      {children}
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
