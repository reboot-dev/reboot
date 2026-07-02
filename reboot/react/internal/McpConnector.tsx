"use client";

/**
 * Internal MCP connector component. Loaded lazily by
 * `RebootClientProvider` when MCP mode is detected.
 *
 * This file is intentionally separate so that
 * `@modelcontextprotocol/ext-apps` imports don't leak into
 * `index.d.ts`, which would break consumers that don't
 * have the package installed or use older moduleResolution.
 */

import {
  useHostStyleVariables,
  type App as McpApp,
} from "@modelcontextprotocol/ext-apps/react";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  McpAppContext,
  BearerRefreshContext,
  DefaultStateIdsContext,
  type McpAppContextValue,
  type DefaultStateIdsContextValue,
} from "./index.js";
import { useAppSafe } from "./useAppSafe.js";

export default function McpConnector({
  appName,
  setBearerToken,
  children,
}: {
  appName: string;
  setBearerToken: (token?: string) => void;
  children: ReactNode;
}) {
  // Reboot auto-injects the AI-supplied `UI(request=...)` props onto
  // the single child element via `React.cloneElement` (see the render
  // at the bottom of this component), so `RebootClientProvider` in MCP
  // mode must wrap exactly one React element — the customer's UI App.
  // Validate eagerly here, before any other render or state setup, so a
  // misconfigured provider tree fails fast with a Reboot-specific
  // message that points at the fix, rather than silently injecting the
  // props onto just one of several siblings while the rest render
  // untouched. Common mistakes this catches:
  //   - multiple siblings: <A /><B />
  //   - fragment wrapper:  <>...</>
  //   - text/null/array:   "loading", null, [<A />, <B />]
  //   - empty provider:    <RebootClientProvider />
  const childArray = Children.toArray(children);
  if (childArray.length !== 1 || !isValidElement(childArray[0])) {
    const count = childArray.length;
    throw new Error(
      `RebootClientProvider must wrap exactly one React ` +
        `element (your UI App component); got ${count} ` +
        `${count === 1 ? "child" : "children"}. Reboot ` +
        `auto-injects UI request props (from ` +
        `UI(request=<Model>) declarations) onto that single ` +
        `child via React.cloneElement, so a fragment, an ` +
        `array of siblings, or a non-element child would ` +
        `silently drop the props. Wrap multiple top-level ` +
        `components in a single parent component (e.g. ` +
        `<MyAppShell><Header /><App /></MyAppShell>) and ` +
        `render that one component here.`
    );
  }
  // The validated single child — used below in place of the
  // raw `children` prop so the cloneElement path and the
  // pass-through path share the same element.
  const onlyChild = childArray[0] as ReactElement;

  // Merged tool data from ontoolinput + ontoolresult.
  const [toolData, setToolData] = useState<Record<string, unknown> | null>(
    null
  );

  // To open this UI, the MCP client was required to call an MCP tool.
  // That MCP tool will, amongst other things, return a bearer token
  // this UI can use. If that bearer token expires we must (under the
  // hood) re-call the tool to refresh the token; capture the tool's
  // input arguments (request params) and record the tool name, so we
  // can call it again later.
  const toolInfoRef = useRef<{
    name: string;
    arguments: Record<string, unknown>;
  } | null>(null);

  // Coalesce concurrent refresh calls.
  const refreshPromiseRef = useRef<Promise<string | undefined> | null>(null);

  // Access `setBearerToken` via ref so callbacks always use the
  // latest version without depending on its identity. In practice
  // `setBearerToken` is a React `useState` setter (stable), but
  // the ref avoids coupling to that assumption.
  const setBearerTokenRef = useRef(setBearerToken);
  setBearerTokenRef.current = setBearerToken;

  const { mcpApp, error } = useAppSafe({
    appInfo: {
      name: appName,
      version: "1.0.0",
    },
    capabilities: {},

    // To open this UI, the MCP client was required to call an MCP tool.
    // Store required information about that tool (see the comment on
    // `toolInfoRef`).
    onAppCreated: (createdMcpApp: McpApp) => {
      createdMcpApp.ontoolinput = (input) => {
        // If for any reason the host doesn't provide the tool name, set
        // `toolInfoRef` to `null` — this disables bearer token refresh
        // (our only option; we can't re-invoke a tool without knowing
        // its name).
        const toolName = (createdMcpApp as any).getHostContext?.()?.toolInfo
          ?.tool?.name;

        toolInfoRef.current = toolName
          ? {
              name: toolName,
              arguments: (input.arguments as Record<string, unknown>) ?? {},
            }
          : null;

        setToolData((prev) => ({
          ...prev,
          ...(input.arguments ?? {}),
        }));
      };

      // Capture tool result — for User types the user ID is returned
      // here (not in tool input arguments). Also extract `bearer_token`
      // if present.
      createdMcpApp.ontoolresult = (result: any) => {
        // Try `structuredContent` first (ChatGPT wraps tool data here),
        // then fall back to `content[].text`.
        const sources: string[] = [];

        // `structuredContent` may be an object with a `text` string, or
        // the data itself.
        const sc = result.structuredContent;
        if (sc != null) {
          if (typeof sc === "string") {
            sources.push(sc);
          } else if (typeof sc.text === "string") {
            sources.push(sc.text);
          } else if (typeof sc === "object") {
            // Already parsed — merge directly.
            setToolData((prev) => ({ ...prev, ...sc }));
            return;
          }
        }

        const text = result.content?.find((c: any) => c.type === "text")?.text;
        if (text) sources.push(text);

        for (const src of sources) {
          try {
            const data = JSON.parse(src);
            setToolData((prev) => ({ ...prev, ...data }));

            // Forward bearer token to the RebootClient.
            if (typeof data.bearer_token === "string") {
              setBearerTokenRef.current(data.bearer_token);
            }

            return;
          } catch {
            // Try next source.
          }
        }
      };
    },
  });

  // Refresh bearer token by re-invoking the UI tool through the MCP
  // host. The host refreshes its own access token (via refresh token)
  // if needed before proxying the call, so we always get a fresh token.
  const refreshMCPBearerToken = useCallback(async (): Promise<
    string | undefined
  > => {
    // Coalesce: return in-flight promise if one exists. This is
    // safe even if `mcpApp` has changed since the promise was
    // created: the bearer token is minted by our server (not
    // tied to the MCP connection), so a successful result from
    // the old app is still valid. If the old connection died,
    // the promise rejects and the `finally` block clears the
    // ref, so the next attempt uses the new `mcpApp`.
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    if (!mcpApp || !toolInfoRef.current?.name) {
      return undefined;
    }

    const promise = (async () => {
      try {
        const result = await (mcpApp as any).callServerTool({
          name: toolInfoRef.current!.name,
          arguments: toolInfoRef.current!.arguments,
        });

        const text = result?.content?.find((c: any) => c.type === "text")?.text;
        if (text) {
          const data = JSON.parse(text);
          if (typeof data.bearer_token === "string") {
            setBearerTokenRef.current(data.bearer_token);
            return data.bearer_token as string;
          }
        }
        return undefined;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [mcpApp]);

  // Get initial host context once mcpApp is connected.
  const initialContext = useMemo(() => {
    return mcpApp?.getHostContext() ?? null;
  }, [mcpApp]);

  // Apply host theme and style variables.
  useHostStyleVariables(mcpApp, initialContext);

  // These `useMemo`s must run before the early returns below.
  // Otherwise the hook count grows the moment we stop bailing out
  // for the loading state, which violates React's rules of hooks
  // ("rendered more hooks than during the previous render").
  //
  // We memoize even though building the object is trivial: it's a
  // context `Provider` value, and React re-renders consumers when
  // that value changes by reference (`Object.is`), not
  // structurally. An inline object literal would be a fresh
  // reference on every render of this component, and this
  // component re-renders for reasons unrelated to these three
  // values (`error` from `useAppSafe`, a parent
  // re-render, host-style churn) — each of which would otherwise
  // re-render every `useMcpApp()` / `useMcpToolData()` consumer
  // (every generated hook in the subtree) for nothing. The deps
  // list isn't a no-op for naming the same three values: it
  // defines what "really changed" means. This component's renders
  // are the big set; the renders where a dep actually changed are
  // the subset that should propagate, and the memo holds the
  // reference stable across all the others.
  const contextValue = useMemo<McpAppContextValue>(
    () => ({ mcpApp, toolData, refreshMCPBearerToken }),
    [mcpApp, toolData, refreshMCPBearerToken]
  );
  // State-IDs come out of `toolData.ids` for MCP — same shape
  // the web flow populates from `/__/oauth/whoami`. Generated
  // hooks read them via `useDefaultStateIds()` regardless of
  // surface. Memoize so unrelated `toolData` updates (e.g. a
  // bearer-token refresh that touches a non-`ids` key) don't
  // re-render every state-ids consumer.
  const stateIdsContextValue = useMemo<DefaultStateIdsContextValue>(
    () => ({
      // `null` until the host delivers tool input carrying `ids` (so a
      // no-id hook reports loading); the map itself once it arrives.
      defaultIds:
        toolData?.ids != null && typeof toolData.ids === "object"
          ? (toolData.ids as Record<string, string>)
          : null,
    }),
    [toolData?.ids]
  );

  if (error) {
    return (
      <div style={{ color: "red", padding: "1rem" }}>
        MCP Error: {error.message}
      </div>
    );
  }

  // Auto-inject the AI-supplied request props onto the single
  // child component, so customer `main.tsx` can write a plain
  // `<MyApp />` and the App's typed `FC<<Model>>` props get
  // populated automatically. The MCP tool stub puts the
  // validated, camelCased request payload under
  // `toolData.request`. UIs declared with `UI(request=None)`
  // have no `request` field and the child renders unchanged.
  // `onlyChild` is the validated single element from the top of
  // this component.
  const requestProps =
    toolData?.request != null &&
    typeof toolData.request === "object" &&
    !Array.isArray(toolData.request)
      ? (toolData.request as Record<string, unknown>)
      : null;

  const child =
    requestProps !== null ? cloneElement(onlyChild, requestProps) : onlyChild;

  return (
    <McpAppContext.Provider value={contextValue}>
      <BearerRefreshContext.Provider value={refreshMCPBearerToken}>
        <DefaultStateIdsContext.Provider value={stateIdsContextValue}>
          {child}
        </DefaultStateIdsContext.Provider>
      </BearerRefreshContext.Provider>
    </McpAppContext.Provider>
  );
}
