// Internal MCP context and hooks for generated code. Not
// public API.
//
// The `mcpApp` field is typed as `any` here to avoid a
// top-level import of `@modelcontextprotocol/ext-apps`
// which would break consumers using `moduleResolution:
// "node"`. Callers that need the real type should import
// `App` from `@modelcontextprotocol/ext-apps/react`.
import { createContext, useContext } from "react";

export interface McpAppContextValue {
  mcpApp: any;
  // Merged data from ontoolinput (arguments) and
  // ontoolresult (parsed result content).
  toolData: Record<string, unknown> | null;
  // Re-invoke the UI tool via the MCP host to obtain a
  // fresh bearer token. Concurrent calls are coalesced.
  refreshMCPBearerToken: () => Promise<string | undefined>;
}

export const McpAppContext = createContext<McpAppContextValue | null>(null);

/**
 * @internal Used by generated code. Do not import
 * directly; use the generated hooks instead.
 */
export function useMcpApp(): any | null {
  return useContext(McpAppContext)?.mcpApp ?? null;
}

/**
 * @internal Used by generated code. Do not import
 * directly; use the generated hooks instead.
 */
export function useMcpToolData(): Record<string, unknown> | null {
  return useContext(McpAppContext)?.toolData ?? null;
}

/**
 * @internal Used by generated code to refresh an expired
 * bearer token by re-invoking the UI tool through the
 * MCP host.
 */
export function useRefreshMCPBearerToken():
  | (() => Promise<string | undefined>)
  | null {
  return useContext(McpAppContext)?.refreshMCPBearerToken ?? null;
}
