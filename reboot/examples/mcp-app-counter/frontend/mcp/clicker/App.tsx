// frontend/mcp/clicker/App.tsx
import {
  type UseCounterApi,
  useCounter,
} from "@api/mcp_app_counter/v1/counter_rbt_react";
import { useMcpApp } from "@reboot-dev/reboot-react";
import { useState, type FC } from "react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const { counter, isLoading } = useCounter();

  if (isLoading) {
    return <div>loading...</div>;
  }

  // `isLoading` is checked first: while it is true, `counter` is
  // still `undefined`. Reaching this check with `undefined` therefore
  // means resolution finished and there is genuinely no default
  // Counter id.
  if (counter === undefined) {
    console.error("No default Counter id was available; cannot render.");
    return <div>An error occurred, sorry about that!</div>;
  }

  return <Clicker counter={counter} />;
};

const Clicker: FC<{ counter: UseCounterApi }> = ({ counter }) => {
  const [isPending, setIsPending] = useState(false);
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
    // The web app is at the backend's own origin, which serves it at
    // `/` (`--web-app` in development, `--web-app-dist-path` in
    // production), unless `VITE_WEB_APP_URL` (`web/.env.production`)
    // names a host it is deployed to elsewhere.
    const webAppUrl =
      import.meta.env.VITE_WEB_APP_URL ??
      new URL(window.REBOOT_URL ?? window.location.origin).origin;
    const url = webAppUrl + "/?counter=" + encodeURIComponent(counterId);
    // The sandboxed MCP App iframe blocks `window.open` unless the
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
