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
import { useMemo, useState, type ReactNode } from "react";
import { McpAppContext, type McpAppContextValue } from "./index.js";
import { useAppSafe } from "./useAppSafe.js";

export default function McpConnector({
  appName,
  children,
}: {
  appName: string;
  children: ReactNode;
}) {
  // Merged tool data from ontoolinput + ontoolresult.
  const [toolData, setToolData] = useState<Record<string, unknown> | null>(
    null
  );

  const { mcpApp, isConnected, error } = useAppSafe({
    appInfo: {
      name: appName,
      version: "1.0.0",
    },
    capabilities: {},
    onAppCreated: (createdMcpApp: McpApp) => {
      console.log(`[${appName}] Connected to MCP host`);

      // Capture tool input arguments (e.g. request params).
      createdMcpApp.ontoolinput = (input) => {
        setToolData((prev) => ({
          ...prev,
          ...(input.arguments ?? {}),
        }));
      };

      // Capture tool result — for Session types the session
      // ID is returned here (not in tool input arguments).
      createdMcpApp.ontoolresult = (result: any) => {
        const text = result.content?.find((c: any) => c.type === "text")?.text;
        if (text) {
          try {
            const data = JSON.parse(text);
            setToolData((prev) => ({ ...prev, ...data }));
          } catch {
            // Ignore malformed tool results.
          }
        }
      };
    },
  });

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
  // "...", "rbt.ping.v1.Session": "..."}`). Without IDs the generated
  // hooks (e.g. `usePing()`, `useSession()`) can't connect to the right
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
  };

  return (
    <McpAppContext.Provider value={contextValue}>
      {children}
    </McpAppContext.Provider>
  );
}
