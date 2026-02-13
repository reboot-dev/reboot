import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useEffect, type ReactNode } from "react";

// Injected by server for remote access (e.g., MCP Apps in MCPJam).
declare global {
  interface Window {
    REBOOT_URL?: string;
  }
}

interface RebootProviderProps {
  children: ReactNode;
  url?: string;
}

/**
 * Wrapper for RebootClientProvider that auto-detects the Reboot URL.
 *
 * Priority:
 * 1. Explicit url prop
 * 2. window.REBOOT_URL (injected by server for remote MCP Apps)
 * 3. window.location.origin (same-origin deployment)
 * 4. http://localhost:9991 (local development fallback)
 */
export function RebootProvider({ children, url }: RebootProviderProps) {
  const origin = window.location.origin;
  const isValidOrigin =
    origin && origin !== "null" && origin.startsWith("http");

  // Check for server-injected URL (for remote MCP Apps).
  const injectedUrl = window.REBOOT_URL;

  const rebootUrl =
    url ?? injectedUrl ?? (isValidOrigin ? origin : "http://localhost:9991");

  useEffect(() => {
    console.log("[RebootProvider] Using URL:", rebootUrl);
    if (injectedUrl) {
      console.log("[RebootProvider] (from window.REBOOT_URL)");
    }
  }, [rebootUrl, injectedUrl]);

  return (
    <RebootClientProvider url={rebootUrl}>{children}</RebootClientProvider>
  );
}
