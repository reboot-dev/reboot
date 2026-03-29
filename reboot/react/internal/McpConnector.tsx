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
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { McpAppContext, type McpAppContextValue } from "./index.js";
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

  const { mcpApp, isConnected, error } = useAppSafe({
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

  if (error) {
    return (
      <div style={{ color: "red", padding: "1rem" }}>
        MCP Error: {error.message}
      </div>
    );
  }

  // Wait for connection and state IDs. The MCP host (Claude, MCPJam,
  // etc.) delivers IDs by invoking the UI tool, which fires
  // `ontoolinput`/`ontoolresult` events. The `ids` field maps fully
  // qualified state type names to their IDs (e.g. `{"rbt.ping.v1.Ping":
  // "...", "rbt.ping.v1.User": "..."}`). Without IDs the generated
  // hooks (e.g. `usePing()`, `useUser()`) can't connect to the right
  // state instances, so we show a loading state until they arrive.
  const hasIds = toolData?.ids != null && typeof toolData.ids === "object";
  if (!isConnected || !mcpApp || !hasIds) {
    return (
      <div style={{ padding: "1rem", opacity: 0.7 }}>
        Connecting to MCP host...
      </div>
    );
  }

  const contextValue: McpAppContextValue = {
    mcpApp,
    toolData,
    refreshMCPBearerToken,
  };

  return (
    <McpAppContext.Provider value={contextValue}>
      {children}
    </McpAppContext.Provider>
  );
}
