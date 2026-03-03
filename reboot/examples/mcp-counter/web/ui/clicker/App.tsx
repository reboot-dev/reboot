import { useEffect, useRef, useState, type FC } from "react";
import { useChat } from "@api/mcp_counter/v1/counter_rbt_react";
import css from "./App.module.css";

/**
 * Compact clicker widget with trend indicator.
 * Uses generated MCP-aware hook: WebSocket for reads, MCP tools for writes.
 * Designed to work alongside dashboard for side-by-side demos.
 */
export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);
  const chat = useChat();
  const { response, isLoading } = chat.useGet();

  const prevValueRef = useRef<number | null>(null);
  const [trend, setTrend] = useState<"up" | "down" | "same" | null>(null);

  const value = response?.value ?? 0;

  // Track trend based on value changes (reacts to any source).
  useEffect(() => {
    if (response?.value !== undefined) {
      if (prevValueRef.current !== null) {
        if (response.value > prevValueRef.current) {
          setTrend("up");
        } else if (response.value < prevValueRef.current) {
          setTrend("down");
        } else {
          setTrend("same");
        }
      }
      prevValueRef.current = response.value;
    }
  }, [response?.value]);

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await chat.increment({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const handleDecrement = async () => {
    setIsPending(true);
    try {
      await chat.decrement({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendClass =
    trend === "up" ? css.trendUp : trend === "down" ? css.trendDown : "";

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.row}>
        <button
          onClick={handleDecrement}
          disabled={isPending}
          className={css.buttonDecrement}
        >
          −
        </button>
        <div className={css.valueGroup}>
          <div
            className={`${css.counter} ${trendClass} ${
              isPending ? css.pending : ""
            }`}
          >
            {value}
          </div>
          {trend && (
            <span className={`${css.trend} ${trendClass}`}>{trendIcon}</span>
          )}
        </div>
        <button
          onClick={handleIncrement}
          disabled={isPending}
          className={css.buttonIncrement}
        >
          +
        </button>
      </div>
      <span className={`${css.syncStatus} ${isPending ? css.visible : ""}`}>
        syncing...
      </span>
    </div>
  );
};
