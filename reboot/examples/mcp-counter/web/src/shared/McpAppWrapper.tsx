import { type ReactNode, useMemo } from "react";
import {
  useApp,
  useHostStyleVariables,
  type App as McpApp,
} from "@modelcontextprotocol/ext-apps/react";
import css from "./shared.module.css";

interface McpAppWrapperProps {
  appName: string;
  children: (app: McpApp) => ReactNode;
}

/**
 * Wrapper component that handles MCP host connection.
 * Applies host theme/styles and passes connected app to children.
 */
export function McpAppWrapper({ appName, children }: McpAppWrapperProps) {
  const { app, isConnected, error } = useApp({
    appInfo: {
      name: appName,
      version: "1.0.0",
    },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      console.log(`[${appName}] Connected to MCP host`);
      createdApp.onerror = (err) => {
        console.error(`[${appName}] MCP error:`, err);
      };
    },
  });

  // Get initial host context once app is connected.
  const initialContext = useMemo(() => {
    return app?.getHostContext() ?? null;
  }, [app]);

  // Apply host theme and style variables (initial + listen for changes).
  useHostStyleVariables(app, initialContext);

  if (error) {
    return <div className={css.error}>error: {error.message}</div>;
  }

  if (!isConnected || !app) {
    return <div className={css.loading}>connecting to host...</div>;
  }

  return <>{children(app)}</>;
}
