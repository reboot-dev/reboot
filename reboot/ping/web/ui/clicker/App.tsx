import { useState, type FC } from "react";
import {
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
  const [isPending, setIsPending] = useState(false);

  const counter = useCounter();
  const { response, isLoading } = counter.useValue();

  const count = response?.value ?? 0;

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment();
    } finally {
      setIsPending(false);
    }
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
    </div>
  );
};
