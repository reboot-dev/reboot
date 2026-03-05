/**
 * StrictMode-safe replacement for @modelcontextprotocol/ext-apps useApp hook.
 *
 * React StrictMode double-mounts components in development. The upstream
 * useApp hook doesn't call app.close() on cleanup, leaving duplicate message
 * listeners active. This causes "unknown message ID" errors when the stale
 * listener receives responses meant for the new instance.
 *
 * This hook properly closes the app on cleanup, removing the message listener.
 *
 * TODO: Remove this file once @modelcontextprotocol/ext-apps fixes cleanup.
 * See: useApp should call app.close() in cleanup to support StrictMode.
 */

import { useEffect, useRef, useState } from "react";
import {
  App as McpApp,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps";

export interface UseAppOptions {
  appInfo: {
    name: string;
    version: string;
  };
  // Capabilities object passed to MCP host. Empty object if not specified.
  capabilities?: Record<string, unknown>;
  onAppCreated?: (mcpApp: McpApp) => void;
}

export interface UseAppResult {
  mcpApp: McpApp | null;
  isConnected: boolean;
  error: Error | null;
}

/**
 * StrictMode-safe replacement for useApp from @modelcontextprotocol/ext-apps.
 *
 * Unlike the upstream hook, this properly closes the app on cleanup,
 * which removes the message listener and prevents duplicate responses.
 */
export function useAppSafe(options: UseAppOptions): UseAppResult {
  const { appInfo, capabilities, onAppCreated } = options;
  const [mcpApp, setMcpApp] = useState<McpApp | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store app in ref so cleanup can access it.
  const appRef = useRef<McpApp | null>(null);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        // Args: eventTarget (send to parent), eventSource
        // (only accept messages from parent).
        const transport = new PostMessageTransport(
          window.parent,
          window.parent
        );
        const app = new McpApp(appInfo, capabilities ?? {});
        appRef.current = app;

        // Call onAppCreated before connect (for handler registration).
        onAppCreated?.(app);

        await app.connect(transport);

        if (mounted) {
          setMcpApp(app);
          setIsConnected(true);
          setError(null);
        } else {
          // Component unmounted during connect - clean up.
          await app.close();
        }
      } catch (err) {
        if (mounted) {
          setMcpApp(null);
          setIsConnected(false);
          setError(err instanceof Error ? err : new Error("Failed to connect"));
        }
      }
    }

    connect();

    return () => {
      mounted = false;
      // Close the app to remove message listener.
      // This is the fix for StrictMode - upstream useApp doesn't do this.
      if (appRef.current) {
        appRef.current.close();
        appRef.current = null;
      }
    };
  }, []); // Intentionally empty - options only used on initial mount.

  return { mcpApp, isConnected, error };
}
