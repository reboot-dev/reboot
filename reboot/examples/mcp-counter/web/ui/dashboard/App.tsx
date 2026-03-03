import { useEffect, useState, type FC } from "react";
import {
  type DashboardConfig,
  useChat,
} from "@api/mcp_counter/v1/counter_rbt_react";
import css from "./App.module.css";

type Trend = "up" | "down" | "same";

interface HistoryEntry {
  value: number;
  trend: Trend | null;
}

/**
 * Hybrid dashboard counter interface.
 * Uses generated MCP-aware hook: WebSocket for reads, MCP tools for writes.
 */
export const DashboardApp: FC<DashboardConfig> = ({ personalizedMessage }) => {
  const [isPending, setIsPending] = useState(false);
  const chat = useChat();
  const { response, isLoading } = chat.useGet();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const value = response?.value ?? 0;
  const currentTrend =
    history.length > 0 ? history[history.length - 1].trend : null;

  // Track history of values with trends (auto-updates via WebSocket).
  useEffect(() => {
    if (response?.value !== undefined) {
      setHistory((prev) => {
        const prevValue = prev.length > 0 ? prev[prev.length - 1].value : null;
        let trend: Trend | null = null;
        if (prevValue !== null) {
          if (response.value > prevValue) trend = "up";
          else if (response.value < prevValue) trend = "down";
          else trend = "same";
        }
        const next = [...prev, { value: response.value, trend }];
        return next.slice(-9);
      });
    }
  }, [response?.value]);

  const handleIncrement = async (amount: number) => {
    setIsPending(true);
    try {
      await chat.increment({ amount });
    } finally {
      setIsPending(false);
    }
  };

  const handleDecrement = async (amount: number) => {
    setIsPending(true);
    try {
      await chat.decrement({ amount });
    } finally {
      setIsPending(false);
    }
  };

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.headerLoading}>
          <span className={css.loading}>loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.header}>
        <div className={css.headerTitleGroup}>
          <span className={css.headerTitle}>Counter Dashboard</span>
          {personalizedMessage && (
            <span className={css.headerMessage}>{personalizedMessage}</span>
          )}
        </div>
        <span className={isPending ? css.headerSyncing : css.headerStatus}>
          {isPending ? "syncing..." : "live"}
        </span>
      </div>

      <div className={css.grid}>
        <div className={css.panel}>
          <div className={css.label}>Current Value</div>
          <div
            className={`${css.value} ${
              currentTrend === "up"
                ? css.trendUp
                : currentTrend === "down"
                ? css.trendDown
                : ""
            } ${isPending ? css.pending : ""}`}
          >
            {value}
          </div>
        </div>

        <div className={css.panel}>
          <div className={css.label}>Recent Values</div>
          <div className={css.historyList}>
            {history.map((entry, i) => (
              <span
                key={i}
                className={`${css.historyItem} ${
                  entry.trend === "up"
                    ? css.historyUp
                    : entry.trend === "down"
                    ? css.historyDown
                    : ""
                } ${i === history.length - 1 ? css.current : ""}`}
              >
                {entry.value}
              </span>
            ))}
          </div>
        </div>

        <div className={css.panelFull}>
          <div className={css.label}>Controls</div>
          <div className={css.controls}>
            <button
              onClick={() => handleDecrement(1)}
              disabled={isPending}
              className={css.buttonDecrement}
            >
              -1
            </button>
            <button
              onClick={() => handleIncrement(1)}
              disabled={isPending}
              className={css.buttonIncrement}
            >
              +1
            </button>
            <button
              onClick={() => handleIncrement(2)}
              disabled={isPending}
              className={css.buttonIncrement}
            >
              +2
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
