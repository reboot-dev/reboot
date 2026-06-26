import { useMcpApp } from "@reboot-dev/reboot-react";
import { useState, type FC } from "react";
import {
  type UseCounterApi,
  type ShowClickerProps,
  useCounter,
} from "../../../ping_api_zod_rbt_react";
import css from "./App.module.css";

/**
 * Compact clicker widget. Uses generated MCP-aware hook:
 * WebSocket for reads, MCP tools for writes. The `primaryColor`
 * prop comes from the `ShowClickerProps` request the AI passes
 * to the `show_clicker` MCP tool; `main.tsx` renders a bare
 * `<ClickerApp />`, and `RebootClientProvider` (via its internal
 * `McpConnector`) auto-injects the request fields as props onto
 * it with `React.cloneElement`. Python `primary_color` is
 * generated as TypeScript `primaryColor` by protobuf-es.
 */
export const ClickerApp: FC<ShowClickerProps> = ({ primaryColor }) => {
  const { counter, isLoading } = useCounter();

  if (isLoading) {
    return (
      <div className={css.container}>
        <div style={{ opacity: 0.5 }}>Loading...</div>
      </div>
    );
  }

  if (counter === undefined) {
    console.error("No default Counter id was available; cannot render.");
    return (
      <div className={css.container}>
        <div style={{ opacity: 0.5 }}>An error occurred, sorry about that!</div>
      </div>
    );
  }

  return <Clicker counter={counter} primaryColor={primaryColor} />;
};

const Clicker: FC<ShowClickerProps & { counter: UseCounterApi }> = ({
  counter,
  primaryColor,
}) => {
  const [isPending, setIsPending] = useState(false);

  const { response, isLoading } = counter.useValue();

  // Reuse the MCP-inferred id to deep-link into the standalone web
  // SPA for the very same counter.
  const counterId = counter.state_id;

  // The MCP host's app handle, used to open the deep link (see
  // `handlePopOut`). `null` when not running under an MCP host.
  const mcpApp = useMcpApp();

  const count = response?.value ?? 0;

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment();
    } finally {
      setIsPending(false);
    }
  };

  const handlePopOut = async () => {
    // The standalone web app is served at `/__/frontend/web/` on the
    // Reboot origin (Envoy proxies that prefix to the static-file
    // server in dist mode, or to Vite in HMR mode). Prefer the
    // server-injected `window.REBOOT_URL` (set for inline/remote MCP
    // hosts, where `window.location.origin` is the sandbox or "null"),
    // falling back to our own origin when loaded in the iframe.
    // (ping serves its web app same-origin, so the origin is
    // the web app's URL — no separate `VITE_WEB_APP_URL` needed.)
    const url =
      (window.REBOOT_URL ?? window.location.origin) +
      "/__/frontend/web/?counter=" +
      encodeURIComponent(counterId);
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
    return (
      <div className={css.container}>
        <div style={{ opacity: 0.5 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      className={css.container}
      style={primaryColor ? { color: primaryColor } : undefined}
    >
      <div className={css.counter}>{count}</div>
      <button
        onClick={handleIncrement}
        disabled={isPending}
        className={css.button}
      >
        {isPending ? "Incrementing..." : "+1"}
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
