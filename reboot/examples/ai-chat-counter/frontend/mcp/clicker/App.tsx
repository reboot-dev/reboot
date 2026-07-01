// frontend/mcp/clicker/App.tsx
import { useCounter } from "@api/ai_chat_counter/v1/counter_rbt_react";
import { useMcpApp } from "@reboot-dev/reboot-react";
import { useState, type FC } from "react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);
  const counter = useCounter();
  const { response, isLoading } = counter.useGet();

  // Reuse the MCP-inferred id to deep-link into the standalone web
  // SPA for the very same counter.
  const counterId = counter.state_id;

  // The MCP host's app handle, used to open the deep link (see
  // `handlePopOut`). `null` when not running under an MCP host.
  const mcpApp = useMcpApp();

  const value = response?.value ?? 0;

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const handlePopOut = async () => {
    // The standalone web app lives on its own origin (in production
    // typically a CDN), never on the backend's, so `VITE_WEB_APP_URL`
    // is required in every environment: `web/.env.development` points
    // it at the local Vite dev server, and `web/.env.production` must
    // name the real web-app host.
    const webAppUrl = import.meta.env.VITE_WEB_APP_URL;
    const url =
      webAppUrl + "/__/frontend/web/?counter=" + encodeURIComponent(counterId);
    // The sandboxed MCP UI iframe blocks `window.open` unless the
    // host grants `allow-popups`, so ask the host to open the link
    // via the MCP Apps `ui/open-link` request. Fall back to
    // `window.open` when not under an MCP host (or it declines).
    if (mcpApp?.openLink) {
      try {
        const { isError } = await mcpApp.openLink({ url });
        if (!isError) {
          return;
        }
      } catch {
        // Fall through to `window.open` below.
      }
    }
    window.open(url, "_blank", "noopener");
  };

  if (isLoading && response === undefined) {
    return <div>loading...</div>;
  }

  return (
    <div className={css.container}>
      <span className={css.value}>{value}</span>
      <button
        onClick={handleIncrement}
        disabled={isPending}
        className={css.button}
      >
        +
      </button>
      <button
        onClick={handlePopOut}
        className={css.popOut}
        title="Open this counter in the web app"
      >
        Open in web app ↗
      </button>
    </div>
  );
};
