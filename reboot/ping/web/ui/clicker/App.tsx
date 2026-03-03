import { useState, type FC } from "react";
import { useChat } from "../../../ping_api_zod_rbt_react";
import css from "./App.module.css";

/**
 * Compact clicker widget. Uses generated MCP-aware hook:
 * WebSocket for reads, MCP tools for writes.
 */
export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);

  const chat = useChat();
  const { response, isLoading } = chat.useCounterValue();

  const count = response?.counterValue ?? 0;

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await chat.counterIncrement();
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
    <div className={css.container}>
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
