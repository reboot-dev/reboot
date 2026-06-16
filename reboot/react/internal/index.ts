// Internal contexts and hooks for generated code. Not
// public API.
//
// The `mcpApp` field is typed as `any` here to avoid a
// top-level import of `@modelcontextprotocol/ext-apps`
// which would break consumers using `moduleResolution:
// "node"`. Callers that need the real type should import
// `App` from `@modelcontextprotocol/ext-apps/react`.
import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// State-ID context (surface-agnostic).
//
// No matter how we communicate with the backend (MCP, web, ...), we
// need a "default IDs" map so that generated hooks (notably
// `useUser()`) don't need to be passed an ID if the ID is obvious from
// context.
// ---------------------------------------------------------------------------

export interface DefaultStateIdsContextValue {
  // Map of fully qualified state type name → default state ID,
  // consulted only when a hook is called without an explicit ID.
  // `null` while the surface is still resolving it; an empty map once
  // resolved with no default ID available (e.g. for a `User`, signed
  // out); a populated map otherwise.
  defaultIds: Record<string, string> | null;
}

export const DefaultStateIdsContext =
  createContext<DefaultStateIdsContextValue | null>(null);

/**
 * @internal Returns the default-ID map: `null` while the surface is
 * still resolving it, an empty map once resolved with no default ID
 * available, a populated map otherwise. Outside any provider it
 * resolves to an empty map — there are no default IDs and nothing is
 * in flight. Do not import directly; use the generated hooks
 * instead.
 */
export function useDefaultStateIds(): Record<string, string> | null {
  const value = useContext(DefaultStateIdsContext);
  return value === null ? {} : value.defaultIds;
}

// ---------------------------------------------------------------------------
// MCP-specific context.
//
// Everything that only makes sense when the backend is reached
// through an MCP host. Kept deliberately separate from
// `DefaultStateIdsContext` so non-MCP surfaces (e.g. a standalone
// web SPA) can supply default IDs without depending on any MCP
// concept.
// ---------------------------------------------------------------------------

export interface McpAppContextValue {
  mcpApp: any;
  // The merged bag of `structuredContent` / `content` keys
  // delivered by the MCP host across `ontoolinput`/`ontoolresult`.
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
 * MCP-only. Returns the merged tool-input bag the MCP host
 * delivered (typically `structuredContent` from the most recent
 * tool result). Use this to read tool arguments the server
 * stuffed into the UI's bootstrap payload (e.g. `product_ids`,
 * `cart_id`). For the state-IDs map specifically, prefer the
 * surface-neutral `useDefaultStateIds()` so the same component
 * code works under a standalone web SPA too.
 *
 * Returns `null` outside MCP mode and before the first
 * `ontoolinput` / `ontoolresult` arrives.
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
